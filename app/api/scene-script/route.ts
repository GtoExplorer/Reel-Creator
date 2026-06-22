import { NextResponse } from "next/server";
import { DraftScene, type CameraStep, type DraftScene as DraftSceneT, type FlowNode, type RangeCell } from "@/src/types";
import { narrateBars, narrateFlowchart, narrateFlowchartNodes, narrateSceneFromFacts } from "@/src/openai/script";
import { hasPerNodeLines, voiceoverFromLines } from "@/src/cameraTiming";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WP_EPS = 1e-3;

function comboWeight(combo: string): number {
  if (combo.length === 2) return 6;
  return combo.endsWith("s") ? 4 : 12;
}

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

function rangeGridFacts(grid: RangeCell[] = []): string {
  if (!grid.length) return "";
  let raise = 0;
  let call = 0;
  let fold = 0;
  let total = 0;
  for (const c of grid) {
    const w = comboWeight(c.combo);
    raise += c.raise * w;
    call += c.call * w;
    fold += c.fold * w;
    total += w;
  }
  const rows = [
    `Overall range mix: raise ${pct((raise / total) * 100)}, call/check ${pct((call / total) * 100)}, fold ${pct((fold / total) * 100)}.`,
  ];
  const active = grid
    .map((c) => ({ combo: c.combo, play: (c.raise + c.call) * 100, raise: c.raise * 100, call: c.call * 100, fold: c.fold * 100 }))
    .sort((a, b) => b.play - a.play)
    .slice(0, 8)
    .map((c) => `${c.combo}: play ${pct(c.play)} (raise ${pct(c.raise)}, call/check ${pct(c.call)}, fold ${pct(c.fold)})`);
  if (active.length) rows.push(`Most played hands:\n${active.join("\n")}`);
  return rows.join("\n");
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
    case "preflopMatrix":
      return [scene.preflopLine?.length ? `Preflop action sequence: ${scene.preflopLine.join(", ")}` : "", rangeGridFacts(scene.rangeGrid)]
        .filter(Boolean)
        .join("\n");
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
