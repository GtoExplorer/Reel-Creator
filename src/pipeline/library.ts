import fs from "node:fs";
import path from "node:path";
import { DraftManifest } from "../types.js";

// Independent of stages.ts so that just listing/loading reels doesn't pull in
// the OpenAI client (and its required env). cwd is the package root.
const OUT = path.join(process.cwd(), "out");

export interface ReelSummary {
  id: string;
  url: string | null; // present once rendered; null for draft-only
  mtime: number;
  status: "rendered" | "draft";
}

// Reels + in-progress drafts, newest first. A dir counts if it has a rendered
// reel.mp4 (status "rendered") or just a draft.json (status "draft"). Rendered
// URLs go through the range-aware media route.
export function listReels(): ReelSummary[] {
  if (!fs.existsSync(OUT)) return [];
  const out: ReelSummary[] = [];
  for (const d of fs.readdirSync(OUT, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const mp4 = path.join(OUT, d.name, "reel.mp4");
    const draft = path.join(OUT, d.name, "draft.json");
    const hasMp4 = fs.existsSync(mp4);
    const hasDraft = fs.existsSync(draft);
    if (!hasMp4 && !hasDraft) continue;
    out.push({
      id: d.name,
      url: hasMp4 ? `/api/media/${d.name}/reel.mp4` : null,
      mtime: fs.statSync(hasMp4 ? mp4 : draft).mtimeMs,
      status: hasMp4 ? "rendered" : "draft",
    });
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

// Rebuild an editable draft from a finished reel's manifest (for reels made
// before draft.json existed, or to re-edit any reel). Also reconstructs the
// asset pool so add-scene still works when re-editing an old reel.
export function manifestToDraft(m: {
  briefId: string;
  title: string;
  hashtags: string[];
  topic?: string;
  concept?: string;
  loadId?: number;
  gameId?: string;
  preflopLine?: string[];
  street?: string;
  scenes: Record<string, unknown>[];
}) {
  const legacyType = (t: unknown) => (t === "boardSelections" || t === "strategyBars" ? "barCharts" : t);
  const scenes = m.scenes.map((s) => ({
    type: legacyType(s.type),
    headline: s.headline,
    subtext: s.subtext,
    voiceover: s.voiceover,
    customAudio: s.customAudio,
    loadId: s.loadId,
    gameId: s.gameId,
    preflopLine: s.preflopLine,
    filters: s.filters,
    category: s.category,
    barValue: s.barValue,
    categories: s.categories,
    freqBars: s.freqBars,
    rangeGrid: s.rangeGrid,
    image: s.image,
    flowchart: s.flowchart,
    zoom: s.zoom,
    panY: s.panY,
    nodes: s.nodes,
    camera: s.camera,
    drawings: s.drawings,
    imageW: s.imageW,
    imageH: s.imageH,
  }));
  const pool: Record<string, unknown> = {};
  for (const s of scenes as Record<string, unknown>[]) {
    if (s.image) { pool.image = s.image; pool.imageW = s.imageW; pool.imageH = s.imageH; pool.nodes = s.nodes; }
    if (s.flowchart) { pool.flowchart = s.flowchart; pool.nodes = s.nodes; }
    if (s.rangeGrid) { pool.preflopGrid = s.rangeGrid; pool.preflopLabel = s.headline; }
    if (s.type === "barCharts" && s.categories) { pool.boardCategories = s.categories; pool.boardLabel = s.headline; pool.categories = s.categories; }
    if (s.type === "freqBars" && s.categories) { pool.boardCategories = s.categories; pool.boardLabel = s.headline; pool.categories = s.categories; }
    if (s.freqBars) { pool.freqBars = s.freqBars; pool.highlightLabel = s.barValue ?? s.headline; }
  }
  return {
    briefId: m.briefId,
    title: m.title,
    hashtags: m.hashtags,
    topic: m.topic,
    concept: m.concept,
    loadId: m.loadId,
    gameId: m.gameId,
    preflopLine: m.preflopLine,
    street: m.street,
    pool,
    scenes,
  };
}

// Delete a reel/draft: removes its out/<id> dir (draft.json, manifest, mp4) and
// its public/reels/<id> assets (flowchart, audio). Guards against path traversal.
export function deleteReel(id: string): boolean {
  const outDir = path.join(OUT, id);
  const publicReels = path.join(process.cwd(), "public", "reels");
  const pubDir = path.join(publicReels, id);
  let removed = false;
  if (outDir.startsWith(OUT + path.sep) && fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
    removed = true;
  }
  if (pubDir.startsWith(publicReels + path.sep) && fs.existsSync(pubDir)) {
    fs.rmSync(pubDir, { recursive: true, force: true });
    removed = true;
  }
  return removed;
}

// Load a draft for editing: prefer draft.json, else rebuild from manifest.json.
export function loadDraft(id: string): DraftManifest | null {
  const dPath = path.join(OUT, id, "draft.json");
  const mPath = path.join(OUT, id, "manifest.json");
  if (fs.existsSync(dPath)) return DraftManifest.parse(JSON.parse(fs.readFileSync(dPath, "utf8")));
  if (fs.existsSync(mPath)) return DraftManifest.parse(manifestToDraft(JSON.parse(fs.readFileSync(mPath, "utf8"))));
  return null;
}

export function saveDraft(id: string, draft: unknown): DraftManifest {
  const parsed = DraftManifest.parse(draft);
  const dir = path.join(OUT, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "draft.json"), JSON.stringify(parsed, null, 2));
  return parsed;
}

export { OUT };
