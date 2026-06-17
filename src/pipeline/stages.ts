import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

import {
  RenderManifest,
  DraftManifest,
  type Brief,
  type DraftScene,
  type RenderScene,
  type SceneType,
  type SpotData,
} from "../types.js";
import { config } from "../config.js";
import { fetchSpotData, lineFromLoadId } from "../data/solverApi.js";
import { generateStoryboard } from "../openai/script.js";
import { synthesizeVoiceover } from "../openai/voiceover.js";
import { alignCaptions } from "../openai/captions.js";
import { captureFlowchart, preflopLineInteract } from "../capture/flowchart.js";
import { aggression } from "../poker/ranges.js";
import { hasPerNodeLines, voiceoverFromLines, timeCameraToLines } from "../cameraTiming.js";

// Both the tsx CLI and `next dev` run from the reels-pipeline package root, so
// cwd is a stable anchor (import.meta.url is unreliable once Next bundles this).
export const ROOT = process.cwd();
const publicDirOf = (id: string) => path.join(ROOT, "public", "reels", id);
const outDirOf = (id: string) => path.join(ROOT, "out", id);

function combosFor(combo: string): number {
  if (combo.length === 2) return 6;
  return combo.endsWith("s") ? 4 : 12;
}

function summariseSpot(spot: SpotData): string {
  const facts: string[] = [];
  if (spot.preflopGrid?.length) {
    let raised = 0;
    let total = 0;
    for (const c of spot.preflopGrid) {
      const n = combosFor(c.combo);
      raised += c.raise * n;
      total += n;
    }
    if (total) facts.push(`${spot.preflopLabel ?? "Preflop range"}: raises ${Math.round((raised / total) * 100)}% of all hands.`);
  }
  if (spot.boardCategories?.length) {
    const rows = spot.boardCategories.map((c) => ({ cat: c.category, agg: Math.round(aggression(c)) }));
    facts.push(`${spot.boardLabel ?? "Board"} bet/raise frequency: ${rows.map((r) => `${r.cat} ${r.agg}%`).join(", ")}.`);
    const sorted = [...rows].sort((a, b) => b.agg - a.agg);
    const hi = sorted[0];
    const lo = sorted[sorted.length - 1];
    if (hi && lo && hi.cat !== lo.cat) facts.push(`Most aggressive on ${hi.cat} (${hi.agg}%), least on ${lo.cat} (${lo.agg}%).`);
  }
  return facts.join("\n");
}

// STAGE 1 — capture + data + script, but no voiceover/render. Returns an editable
// draft (and writes out/<id>/draft.json).
export async function prepareDraft(brief: Brief): Promise<DraftManifest> {
  const publicDir = publicDirOf(brief.id);
  const outDir = outDirOf(brief.id);
  fs.mkdirSync(publicDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  console.log("  • Capturing live flowchart from", config.explorerUrl);
  let flowchartImage: string | undefined;
  let detectedLoadId: number | undefined;
  let fcNodes: { label: string; cx: number; cy: number }[] | undefined;
  let fcW: number | undefined;
  let fcH: number | undefined;
  // If a load id was given without a line, reverse-engineer the line from the
  // preflop wizard tree so we can still drive the Explorer to that load.
  let line = brief.preflopLine;
  if ((!line || !line.length) && brief.loadId) {
    const derived = await lineFromLoadId(brief.loadId, brief.gameId);
    if (derived?.line.length) {
      line = derived.line;
      console.log(`  • Derived preflop line from load ${brief.loadId}: ${line.join(", ")}`);
    } else {
      console.warn(`  ⚠ couldn't derive a line from load ${brief.loadId} (wrong game, or not a postflop-closing load)`);
    }
  }
  {
    const fcAbs = path.join(publicDir, "flowchart.png");
    const interact = line?.length ? preflopLineInteract(line) : undefined;
    const r = await captureFlowchart(fcAbs, { interact });
    if (r.ok) {
      flowchartImage = `reels/${brief.id}/flowchart.png`;
      detectedLoadId = r.loadId;
      fcNodes = r.nodes;
      fcW = r.width;
      fcH = r.height;
      console.log(`    ✓ flowchart (${r.width}x${r.height})${r.loadId ? `, load ${r.loadId}` : ""}, ${r.nodes?.length ?? 0} nodes`);
    } else {
      console.warn(`    ⚠ flowchart capture failed (${r.reason}) — falling back to strategy chart`);
    }
  }

  const loadId = brief.loadId ?? detectedLoadId;
  if (!brief.loadId && detectedLoadId) console.log(`  • Auto-detected loadId ${detectedLoadId} from the line`);
  console.log("  • Fetching solver data");
  const spot = await fetchSpotData({ ...brief, loadId });

  console.log("  • Writing script + storyboard (OpenAI)");
  const storyboard = await generateStoryboard(brief, summariseSpot(spot));

  const strategyCat = brief.category ?? "sdv";
  const boardCat = brief.boardCategory ?? "flop_top_card_rank";
  const resolve = (t: SceneType): Pick<DraftScene, "type" | "image" | "categories" | "freqBars" | "rangeGrid" | "category"> => {
    switch (t) {
      case "preflopMatrix":
        return spot.preflopGrid?.length ? { type: t, rangeGrid: spot.preflopGrid } : { type: "strategyBars", categories: spot.categories, category: strategyCat };
      case "flowchart":
        return flowchartImage ? { type: t, image: flowchartImage } : { type: "strategyBars", categories: spot.categories, category: strategyCat };
      case "boardSelections":
        return { type: t, categories: spot.boardCategories ?? spot.categories, category: boardCat };
      case "strategyBars":
        return { type: t, categories: spot.categories, category: strategyCat };
      case "freqBars":
        return { type: t, freqBars: spot.highlightBars };
      default:
        return { type: t };
    }
  };

  const scenes: DraftScene[] = storyboard.scenes.map((s) => {
    const r = resolve(s.type);
    const headline = r.type === "preflopMatrix" && spot.preflopLabel ? spot.preflopLabel : s.headline;
    const base: DraftScene = { ...r, headline, subtext: s.subtext, voiceover: s.voiceover };
    if (r.type === "flowchart") {
      // Default camera: open on the full tree, then a gentle centred push-in.
      base.nodes = fcNodes;
      base.imageW = fcW;
      base.imageH = fcH;
      base.camera = [
        { cx: 0.5, cy: 0.5, zoom: 1 },
        { cx: 0.5, cy: 0.5, zoom: 1.2 },
      ];
    }
    return base;
  });

  // Pool of every captured/fetched asset, so the editor can add or rebuild ANY
  // scene type without re-running capture.
  const pool = {
    image: flowchartImage,
    imageW: fcW,
    imageH: fcH,
    nodes: fcNodes,
    preflopGrid: spot.preflopGrid,
    preflopLabel: spot.preflopLabel,
    boardCategories: spot.boardCategories,
    boardLabel: spot.boardLabel,
    categories: spot.categories,
    freqBars: spot.highlightBars,
    highlightLabel: spot.highlightLabel,
  };

  const draft = DraftManifest.parse({
    briefId: brief.id,
    title: storyboard.title,
    hashtags: storyboard.hashtags,
    topic: brief.topic,
    concept: brief.concept,
    loadId,
    street: brief.street ?? "flop",
    pool,
    scenes,
  });
  fs.writeFileSync(path.join(outDir, "draft.json"), JSON.stringify(draft, null, 2));
  return draft;
}

export interface SceneEdit {
  headline?: string;
  subtext?: string;
  voiceover?: string;
  zoom?: number;
  panY?: number;
  customAudio?: string; // path relative to public/ (a recorded/uploaded clip)
}

// STAGE 2a — apply edits and voice each scene (AI text or a custom clip), align
// captions, and write the render manifest. Does NOT render — this is everything
// the live Remotion Player needs to preview the reel with real audio + captions.
export async function voiceDraft(draft: DraftManifest, edits: SceneEdit[] = []): Promise<RenderManifest> {
  const id = draft.briefId;
  const publicDir = publicDirOf(id);
  const outDir = outDirOf(id);
  fs.mkdirSync(publicDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  const scenes: RenderScene[] = [];
  for (let i = 0; i < draft.scenes.length; i++) {
    const d = draft.scenes[i];
    const e = edits[i] ?? {};
    // Per-node flowchart script: the voiceover is the waypoint lines in order,
    // and the camera is timed to each line (unless a custom clip is supplied).
    const perNode = d.type === "flowchart" && hasPerNodeLines(d.camera) && !e.customAudio;
    const voiceover = e.voiceover ?? (perNode ? voiceoverFromLines(d.camera) : d.voiceover);

    let audioFile: string;
    let audioAbs: string;
    if (e.customAudio) {
      audioFile = e.customAudio;
      audioAbs = path.join(ROOT, "public", e.customAudio);
      console.log(`  • Scene ${i} (${d.type}): using recorded audio`);
    } else {
      audioFile = `reels/${id}/scene_${i}.mp3`;
      audioAbs = path.join(publicDir, `scene_${i}.mp3`);
      console.log(`  • Scene ${i} (${d.type}): voiceover (AI)`);
      await synthesizeVoiceover(voiceover, audioAbs);
    }
    const { words, durationSec } = await alignCaptions(audioAbs);

    scenes.push({
      type: d.type,
      headline: e.headline ?? d.headline,
      subtext: e.subtext ?? d.subtext,
      voiceover,
      categories: d.categories,
      freqBars: d.freqBars,
      rangeGrid: d.rangeGrid,
      image: d.image,
      zoom: e.zoom ?? d.zoom,
      panY: e.panY ?? d.panY,
      nodes: d.nodes,
      camera: perNode ? timeCameraToLines(d.camera ?? [], durationSec) : d.camera,
      imageW: d.imageW,
      imageH: d.imageH,
      audioFile,
      durationSec,
      words,
    });
  }

  const manifest = RenderManifest.parse({ briefId: id, title: draft.title, hashtags: draft.hashtags, scenes });
  const manifestPath = path.join(outDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outDir, "caption.txt"), `${manifest.title}\n\n${manifest.hashtags.map((h) => `#${h}`).join(" ")}\n`);
  return manifest;
}

// STAGE 2b — render a voiced manifest to mp4 with Remotion. Streams render
// output through onLog (defaults to stdout) for live progress.
export async function renderManifest(manifest: RenderManifest, onLog?: (s: string) => void): Promise<string> {
  const id = manifest.briefId;
  const outDir = outDirOf(id);
  fs.mkdirSync(outDir, { recursive: true });
  const manifestPath = path.join(outDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const log = (s: string) => (onLog ? onLog(s) : process.stdout.write(s));
  log("  • Rendering with Remotion\n");
  const outFile = path.join(outDir, "reel.mp4");
  const toRel = (p: string) => path.relative(ROOT, p).split(path.sep).join("/");
  const args = ["remotion", "render", "src/remotion/index.ts", "Reel", toRel(outFile), `--props=${toRel(manifestPath)}`];
  // In Docker (no GPU), set REMOTION_GL=angle|swangle for reliable rendering.
  if (process.env.REMOTION_GL) args.push(`--gl=${process.env.REMOTION_GL}`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn("npx", args, { cwd: ROOT, shell: true });
    child.stdout?.on("data", (d) => log(d.toString()));
    child.stderr?.on("data", (d) => log(d.toString()));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Remotion render failed (exit ${code})`))));
  });
  return outFile;
}

// STAGE 2 (combined) — voice then render. Kept for the CLI / legacy server.
export async function buildReel(draft: DraftManifest, edits: SceneEdit[] = []): Promise<string> {
  const manifest = await voiceDraft(draft, edits);
  return renderManifest(manifest);
}
