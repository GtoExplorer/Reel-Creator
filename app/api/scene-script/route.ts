import { NextResponse } from "next/server";
import { DraftScene, type CameraStep, type DraftScene as DraftSceneT, type FlowNode } from "@/src/types";
import { narrateBars, narrateFlowchart, narrateFlowchartNodes, narratePreflopMatrix, narrateSceneFromFacts } from "@/src/openai/script";
import { hasPerNodeLines, voiceoverFromLines } from "@/src/cameraTiming";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WP_EPS = 1e-3;

function pct(n: number): string {
  return `${Math.round(n)}%`;
}

function nodeForWaypoint(nodes: FlowNode[] = [], wp: CameraStep): FlowNode | undefined {
  return nodes.find((n) => Math.abs(n.cx - wp.cx) < WP_EPS && Math.abs(n.cy - wp.cy) < WP_EPS);
}

function flowchartCameraNodes(scene: DraftSceneT): { label: string; summary?: string; edge?: string }[] {
  const nodes = scene.nodes ?? [];
  const camera = scene.camera ?? [];
  return camera.map((wp) => {
    const n = nodeForWaypoint(nodes, wp);
    return n
      ? { label: n.label, summary: n.summary, edge: n.edge }
      : { label: "The full decision tree", summary: "", edge: undefined };
  });
}

function freqFacts(scene: DraftSceneT): string {
  const bars = scene.freqBars ?? [];
  if (!bars.length) return "";
  const rows = bars.map((b) => `${b.action}: ${pct(b.freq)}`);
  if (scene.barValue) rows.unshift(`Focused bar: ${scene.barValue}`);
  return rows.join("\n");
}

function genericFacts(scene: DraftSceneT): string {
  switch (scene.type) {
    case "freqBars":
      return [scene.category ? `Source bar chart property: ${scene.category}` : "", freqFacts(scene)].filter(Boolean).join("\n");
    case "hook":
      return "Opening hook. Create curiosity around the current poker spot and the strategic mistake the viewer might be making.";
    case "cta":
      return "Closing call to action. Invite the viewer to explore this exact spot in GTOCentral.";
    default:
      return "";
  }
}

// POST { topic, concept, scene } -> { voiceover, subtext?, camera? }
export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => ({}));
    const scene = DraftScene.parse(b.scene ?? {});
    const topic = String(b.topic || "");
    const concept = String(b.concept || "");

    if (scene.type === "barCharts") {
      const r = await narrateBars(topic, concept, scene.category || "this property", scene.categories ?? []);
      return NextResponse.json(r);
    }

    if (scene.type === "preflopMatrix") {
      const r = await narratePreflopMatrix({
        topic,
        concept,
        headline: scene.headline,
        preflopLine: scene.preflopLine,
        rangeGrid: scene.rangeGrid,
      });
      return NextResponse.json(r);
    }

    if (scene.type === "flowchart") {
      const nodes = flowchartCameraNodes(scene);
      if (hasPerNodeLines(scene.camera)) {
        const lines = await narrateFlowchartNodes(topic, concept, nodes);
        const camera = (scene.camera ?? []).map((wp, i) => ({ ...wp, line: lines[i] ?? wp.line ?? "" }));
        return NextResponse.json({ camera, voiceover: voiceoverFromLines(camera) });
      }
      const voiceover = await narrateFlowchart(topic, concept, nodes);
      return NextResponse.json({ voiceover });
    }

    const r = await narrateSceneFromFacts({
      topic,
      concept,
      sceneType: scene.type,
      headline: scene.headline,
      facts: genericFacts(scene),
    });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Script generation failed" }, { status: 500 });
  }
}
