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
  type FlowchartLayout,
  type FlowNode,
  type DrawingAnimation,
} from "../types.js";
import { fetchLoadStreet, fetchSpotData, lineFromLoadId, loadIdFromLine } from "../data/solverApi.js";
import { buildFlowchart } from "../flowchart/build.js";
import { generateStoryboard, narrateBars, narrateFlowchartNodes, narratePreflopMatrix } from "../openai/script.js";
import { synthesizeVoiceover } from "../openai/voiceover.js";
import { alignCaptions } from "../openai/captions.js";
import { aggression } from "../poker/ranges.js";
import { hasPerNodeLines, voiceoverFromLines, timeCameraToLines } from "../cameraTiming.js";
import { resolveDrawingTimings, stripAnimationTags } from "../drawingAnimations.js";
import { recommendSpot, type SpotRecommendation } from "../openai/spot.js";

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

function regexEscape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tagMention(text: string, term: string, id: string): string {
  const match = new RegExp(`\\b${regexEscape(term)}\\b`, "i").exec(text);
  if (!match || match.index == null) return text;
  return `${text.slice(0, match.index)}<${id}>${match[0]}</${id}>${text.slice(match.index + match[0].length)}`;
}

function mentionedValues(text: string, values: string[], limit = 2): string[] {
  return [...values].sort((a, b) => b.length - a.length).filter((value) => new RegExp(`\\b${regexEscape(value)}\\b`, "i").test(text)).slice(0, limit);
}

function tagSentencesForValues(text: string, values: string[], limit = 2): { text: string; values: string[] } {
  const available = [...values].sort((a, b) => b.length - a.length);
  const used = new Set<string>();
  let count = 0;
  const tagged = (text.match(/[^.!?]+[.!?]?(?:\s+|$)/g) ?? [text]).map((sentence) => {
    if (count >= limit) return sentence;
    const value = available.find((candidate) => !used.has(candidate) && new RegExp(`\\b${regexEscape(candidate)}\\b`, "i").test(sentence));
    if (!value) return sentence;
    const trailing = sentence.match(/\s+$/)?.[0] ?? "";
    const content = trailing ? sentence.slice(0, -trailing.length) : sentence;
    count += 1;
    used.add(value);
    return `<a${count}>${content}</a${count}>${trailing}`;
  }).join("");
  return { text: tagged, values: [...used] };
}

function cameraNodesForStory(nodes: FlowNode[] = [], raw: unknown[] = []): FlowNode[] {
  type TreeRow = { node_id: number; parent_edge?: { parent_node_id?: number } };
  const rows = raw as TreeRow[];
  const byId = new Map(rows.map((row) => [row.node_id, row]));
  const chainFor = (row: TreeRow): number[] => {
    const chain = [row.node_id];
    let parent = row.parent_edge?.parent_node_id;
    const seen = new Set(chain);
    while (parent != null && parent !== -1 && !seen.has(parent)) {
      chain.unshift(parent);
      seen.add(parent);
      parent = byId.get(parent)?.parent_edge?.parent_node_id;
    }
    return chain;
  };
  const deepest = rows.map(chainFor).sort((a, b) => b.length - a.length)[0] ?? [];
  const connected = deepest.map((id) => nodes.find((node) => node.id === String(id))).filter((node): node is FlowNode => !!node);
  const candidates = (connected.length >= 2 ? connected : nodes.filter((node) => node.kind !== "edge")).sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  if (candidates.length <= 4) return candidates;
  const picks = [0, Math.round((candidates.length - 1) / 3), Math.round(((candidates.length - 1) * 2) / 3), candidates.length - 1];
  return picks.map((index) => candidates[index]).filter((node, index, all) => all.findIndex((other) => other.id === node.id) === index);
}

// STAGE 1 - solver data + script, but no voiceover/render. Returns an editable
// draft (and writes out/<id>/draft.json).
export async function prepareDraft(brief: Brief): Promise<DraftManifest> {
  const publicDir = publicDirOf(brief.id);
  const outDir = outDirOf(brief.id);
  fs.mkdirSync(publicDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  // Resolve the load id (entered directly, or navigated from the preflop line),
  // then build the decision tree natively from the API — no browser, no Explorer.
  let loadId = brief.loadId;
  let gameId = brief.gameId;
  let preflopLine = brief.preflopLine;
  let aiSelection: SpotRecommendation | null = null;
  if (!loadId && !preflopLine?.length && brief.autoSelectSpot) {
    console.log("  • AI is searching available solver spots");
    aiSelection = await recommendSpot(brief.topic, brief.concept);
    if (aiSelection) {
      loadId = aiSelection.loadId;
      console.log(`  ✓ AI selected load ${loadId}: ${aiSelection.description}`);
    } else {
      console.warn("  ⚠ AI could not find a matching published solver spot");
    }
  }
  if (!loadId && brief.preflopLine?.length) {
    const found = await loadIdFromLine(brief.preflopLine, brief.gameId);
    if (found) {
      loadId = found.loadId;
      gameId = found.gameId;
      console.log(`  • Resolved loadId ${loadId} from the line`);
    } else {
      console.warn("  ⚠ couldn't resolve a load id from the line");
    }
  }

  console.log(`  • Building flowchart from load ${loadId ?? "(none)"}`);
  if (loadId && !gameId) {
    const found = await lineFromLoadId(loadId);
    if (found) {
      gameId = found.gameId;
      preflopLine = preflopLine ?? found.line;
      console.log(`  - Resolved preflop game ${gameId} from load ${loadId}`);
    }
  }

  const street = loadId ? (await fetchLoadStreet(loadId)) ?? brief.street ?? "flop" : brief.street ?? "flop";

  let fcLayout: FlowchartLayout | undefined;
  let fcNodes: FlowNode[] | undefined;
  let fcTree: unknown[] | undefined;
  if (loadId) {
    const fc = await buildFlowchart(loadId, street, 5, [], "TB");
    if (fc) {
      fcLayout = fc.layout;
      fcNodes = fc.nodes;
      fcTree = fc.raw;
      console.log(`    ✓ flowchart (${fc.layout.nodes.length} nodes, ${fc.layout.edges.length} edges)`);
    } else {
      console.warn("    ⚠ flowchart build failed — falling back to strategy chart");
    }
  }

  console.log("  • Fetching solver data");
  const resolvedBrief = { ...brief, loadId, gameId, preflopLine, street };
  const spot = await fetchSpotData(resolvedBrief);

  console.log("  • Writing script + storyboard (OpenAI)");
  const storyboardFacts = [
    aiSelection ? `Selected solver spot: ${aiSelection.description}. Selection rationale: ${aiSelection.reason}` : "",
    preflopLine?.length ? `Exact preflop line: ${preflopLine.join(", ")}.` : "",
    summariseSpot(spot),
  ].filter(Boolean).join("\n");
  const storyboard = await generateStoryboard(resolvedBrief, storyboardFacts);

  const boardCat = brief.boardCategory ?? (street === "turn" ? "turn_top_card_rank" : "flop_top_card_rank");
  const barCategories = spot.boardCategories ?? spot.categories;
  const focusBar = barCategories[Math.floor((barCategories.length - 1) / 2)];
  const resolve = (t: SceneType): Pick<DraftScene, "type" | "flowchart" | "categories" | "freqBars" | "rangeGrid" | "category" | "barValue"> => {
    switch (t) {
      case "preflopMatrix":
        return spot.preflopGrid?.length ? { type: t, rangeGrid: spot.preflopGrid } : { type: "barCharts", categories: spot.boardCategories ?? spot.categories, category: boardCat };
      case "flowchart":
        return fcLayout ? { type: t, flowchart: fcLayout } : { type: "barCharts", categories: spot.boardCategories ?? spot.categories, category: boardCat };
      case "barCharts":
        return { type: t, categories: barCategories, category: boardCat };
      case "freqBars":
        return { type: t, categories: barCategories, category: boardCat, barValue: focusBar?.category, freqBars: focusBar?.actions ?? spot.highlightBars };
      default:
        return { type: t };
    }
  };

  let scenes: DraftScene[] = storyboard.scenes.map((s) => {
    const r = resolve(s.type);
    const headline =
      r.type === "preflopMatrix" && spot.preflopLabel
        ? spot.preflopLabel
        : r.type === "freqBars" && r.barValue
          ? r.barValue
          : s.headline;
    const base: DraftScene = { ...r, headline, subtext: s.subtext, voiceover: s.voiceover };
    if (["flowchart", "preflopMatrix", "barCharts", "freqBars"].includes(r.type)) {
      base.loadId = loadId;
      base.gameId = gameId;
      base.street = street;
    }
    if (r.type === "preflopMatrix") {
      base.loadId = undefined;
      base.preflopLine = preflopLine;
    }
    if (r.type === "flowchart") {
      // Default camera: open on the full tree, then a gentle centred push-in.
      base.nodes = fcNodes;
      base.tree = fcTree;
      base.camera = [
        { cx: 0.5, cy: 0.5, zoom: 1 },
        { cx: 0.5, cy: 0.5, zoom: 1.2 },
      ];
    }
    return base;
  });

  // AI-created drafts get a second, data-grounded pass. Each data scene is
  // scripted from its actual values, then animations/camera targets are taken
  // only from entities that really exist in that scene.
  if (brief.autoSelectSpot) {
    const preflopScene = scenes.find((scene) => scene.type === "preflopMatrix");
    const barsScene = scenes.find((scene) => scene.type === "barCharts");
    const flowScene = scenes.find((scene) => scene.type === "flowchart");
    const selectedFlowNodes = cameraNodesForStory(fcNodes, fcTree);
    const [preflopCopy, barsCopy, flowLines] = await Promise.all([
      preflopScene ? narratePreflopMatrix({ topic: brief.topic, concept: brief.concept, headline: preflopScene.headline, preflopLine, rangeGrid: spot.preflopGrid }) : null,
      barsScene ? narrateBars(brief.topic, brief.concept, boardCat, barCategories) : null,
      flowScene && selectedFlowNodes.length
        ? narrateFlowchartNodes(brief.topic, brief.concept, [
            { label: "Full decision tree overview", summary: "Establish the complete strategy before visiting individual decisions." },
            ...selectedFlowNodes,
          ])
        : [],
    ]);

    scenes = scenes.map((scene) => {
      if (scene.type === "preflopMatrix" && preflopCopy) {
        let voiceover = preflopCopy.voiceover;
        const hands = mentionedValues(voiceover, (scene.rangeGrid ?? []).map((cell) => cell.combo));
        const drawings: DrawingAnimation[] = hands.map((hand, index) => ({ id: `a${index + 1}`, shape: "rect", target: { kind: "preflopHand", hand }, drawSec: 0.35, padding: 8 }));
        hands.forEach((hand, index) => { voiceover = tagMention(voiceover, hand, `a${index + 1}`); });
        return { ...scene, voiceover, subtext: preflopCopy.subtext, drawings };
      }
      if (scene.type === "barCharts" && barsCopy) {
        const tagged = tagSentencesForValues(barsCopy.voiceover, (scene.categories ?? []).map((category) => category.category));
        const voiceover = tagged.text;
        const categories = tagged.values;
        const drawings: DrawingAnimation[] = categories.map((category, index) => ({ id: `a${index + 1}`, shape: "rect", target: { kind: "barRange", from: category, to: category }, drawSec: 0.35, padding: 10 }));
        return { ...scene, voiceover, subtext: barsCopy.subtext, drawings };
      }
      if (scene.type === "flowchart" && selectedFlowNodes.length && flowLines.length) {
        const camera = [
          { cx: 0.5, cy: 0.5, zoom: 1, line: flowLines[0] ?? "" },
          ...selectedFlowNodes.map((node, index) => ({ cx: node.cx, cy: node.cy, zoom: 4, line: flowLines[index + 1] ?? "" })),
        ];
        return { ...scene, camera, voiceover: voiceoverFromLines(camera) };
      }
      return scene;
    });
  }

  // Pool of every fetched asset, so the editor can add or rebuild ANY scene type
  // without re-running draft creation.
  const pool = {
    flowchart: fcLayout,
    tree: fcTree,
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
    gameId,
    preflopLine,
    street,
    aiSelection: aiSelection ? {
      loadId: aiSelection.loadId,
      description: aiSelection.description,
      reason: aiSelection.reason,
    } : undefined,
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
    const taggedVoiceover = e.voiceover ?? (perNode ? voiceoverFromLines(d.camera) : d.voiceover);
    const voiceover = stripAnimationTags(taggedVoiceover);

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
    const { words, durationSec } = await alignCaptions(audioAbs, voiceover);
    const drawings = resolveDrawingTimings(d.drawings, taggedVoiceover, words, durationSec);
    // End-of-scene hold: extend the scene past the voiceover so the final frame
    // lingers (audio/captions/camera all complete before it).
    const holdSec = Math.max(0, d.holdSec ?? 0);

    scenes.push({
      type: d.type,
      headline: e.headline ?? d.headline,
      subtext: e.subtext ?? d.subtext,
      voiceover,
      customAudio: e.customAudio ?? d.customAudio,
      loadId: d.loadId,
      street: d.street,
      gameId: d.gameId,
      preflopLine: d.preflopLine,
      filters: d.filters,
      category: d.category,
      barValue: d.barValue,
      categories: d.categories,
      freqBars: d.freqBars,
      rangeGrid: d.rangeGrid,
      image: d.image,
      flowchart: d.flowchart,
      zoom: e.zoom ?? d.zoom,
      panY: e.panY ?? d.panY,
      nodes: d.nodes,
      camera: perNode ? timeCameraToLines(d.camera ?? [], words, durationSec) : d.camera,
      drawings,
      imageW: d.imageW,
      imageH: d.imageH,
      audioFile,
      durationSec: durationSec + holdSec,
      holdSec: d.holdSec,
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
