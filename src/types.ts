import { z } from "zod";

export const SceneType = z.enum([
  "hook",
  "flowchart",
  "preflopMatrix",
  "boardSelections",
  "strategyBars",
  "freqBars",
  "cta",
]);
export type SceneType = z.infer<typeof SceneType>;

// What the LLM is allowed to produce: ordering + copy + narration ONLY.
// All numeric poker data comes from the SolverAPI, never the model, so we
// never put hallucinated frequencies on screen.
export const StoryboardScene = z.object({
  type: SceneType,
  voiceover: z.string(),
  headline: z.string(),
  subtext: z.string(),
});
export type StoryboardScene = z.infer<typeof StoryboardScene>;

export const Storyboard = z.object({
  title: z.string(),
  hashtags: z.array(z.string()),
  scenes: z.array(StoryboardScene),
});
export type Storyboard = z.infer<typeof Storyboard>;

// Numeric data pulled from the solver, attached to scenes by the pipeline.
// freq is a percentage (0-100). kind drives the brand action colour.
export const FreqBar = z.object({
  action: z.string(),
  freq: z.number(),
  kind: z.enum(["raise", "call", "check", "fold", "bet"]),
});
export type FreqBar = z.infer<typeof FreqBar>;

// One hand-strength class and its action distribution (sums ~100).
export const CategoryStrategy = z.object({
  category: z.string(),
  actions: z.array(FreqBar),
});
export type CategoryStrategy = z.infer<typeof CategoryStrategy>;

// One 13x13 grid cell: action proportions (0-1) bucketed to raise/call/fold.
export const RangeCell = z.object({
  combo: z.string(),
  raise: z.number(),
  call: z.number(),
  fold: z.number(),
});
export type RangeCell = z.infer<typeof RangeCell>;

export const SceneFilter = z.object({
  property: z.string(),
  value: z.string(),
  label: z.string().optional(),
  valueLabel: z.string().optional(),
});
export type SceneFilter = z.infer<typeof SceneFilter>;

// A flowchart node's label + normalised centre (0-1) within the rendered tree,
// plus a short summary of its strategy (for contextual narration).
export const FlowNode = z.object({
  id: z.string().optional(), // layout node id, or edge id for decision/branch stops
  label: z.string(),
  cx: z.number(),
  cy: z.number(),
  summary: z.string().optional(),
  kind: z.enum(["split", "strategy", "edge"]).optional(), // split = decides on a feature; strategy = an action mix; edge = a decision/branch point
  edge: z.string().optional(), // the branch/decision label that leads INTO this node
  source: z.string().optional(), // decision edge source node id (edge stops only)
  target: z.string().optional(), // decision edge target node id (edge stops only)
});
export type FlowNode = z.infer<typeof FlowNode>;

// One camera waypoint: centre on (cx,cy) at this zoom. The reel eases through the
// list across the scene; repeat a waypoint to dwell on it.
//   line  — optional narration spoken while the camera is on this node. When any
//           waypoint has a line, the scene voiceover is built from the lines in
//           order and each waypoint is timed to when its line is spoken.
//   atSec — computed at voicing time: when this waypoint becomes active (seconds).
export const CameraStep = z.object({
  cx: z.number(),
  cy: z.number(),
  zoom: z.number(),
  line: z.string().optional(),
  atSec: z.number().optional(),
});
export type CameraStep = z.infer<typeof CameraStep>;

// A natively-rendered decision tree (replaces the captured flowchart image).
// Coordinates are in layout pixels within {width,height}; the camera/picker use
// the normalised FlowNode[] alongside this.
export const LaidNode = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  kind: z.enum(["split", "strategy"]),
  label: z.string(),
  edge: z.string().optional(), // decision leading into this node
  predictions: z.array(FreqBar), // freq 0-100, sorted
});
export type LaidNode = z.infer<typeof LaidNode>;

export const LaidEdge = z.object({
  id: z.string().optional(),
  source: z.string().optional(),
  target: z.string().optional(),
  points: z.array(z.object({ x: z.number(), y: z.number() })),
  label: z.string().optional(),
  labelX: z.number(),
  labelY: z.number(),
});
export type LaidEdge = z.infer<typeof LaidEdge>;

export const FlowchartDirection = z.enum(["TB", "LR"]);
export type FlowchartDirection = z.infer<typeof FlowchartDirection>;

export const FlowchartLayout = z.object({
  direction: FlowchartDirection.default("TB"),
  width: z.number(),
  height: z.number(),
  nodes: z.array(LaidNode),
  edges: z.array(LaidEdge),
});
export type FlowchartLayout = z.infer<typeof FlowchartLayout>;

export const SpotData = z.object({
  label: z.string(),
  categories: z.array(CategoryStrategy), // for the strategy-by-strength scene
  highlightLabel: z.string(),
  highlightBars: z.array(FreqBar), // the single highlighted class for the freq scene
  preflopGrid: z.array(RangeCell).optional(), // native preflop range matrix
  preflopLabel: z.string().optional(), // e.g. "Button Opening Range" (line-specific)
  boardCategories: z.array(CategoryStrategy).optional(), // native board-selection bars
  boardLabel: z.string().optional(),
});
export type SpotData = z.infer<typeof SpotData>;

export const Brief = z.object({
  id: z.string(),
  topic: z.string(),
  concept: z.string(),
  loadId: z.number().optional(),
  board: z.string().optional(),
  street: z.enum(["flop", "turn", "river"]).optional(),
  category: z.string().optional(),
  highlightCategory: z.string().optional(), // which hand class the freq scene zooms into
  boardCategory: z.string().optional(), // board property for the board-selection bars (default flop_top_card_rank)
  gameId: z.string().optional(), // preflop wizard game id (defaults to the first game)
  // Preflop line used to resolve the postflop load id.
  preflopLine: z.array(z.string()).optional(),
  template: z.string().default("data-graphics-v1"),
});
export type Brief = z.infer<typeof Brief>;

export const WordTimestamp = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
});
export type WordTimestamp = z.infer<typeof WordTimestamp>;

// One scene, fully resolved and ready for Remotion to render.
export const RenderScene = z.object({
  type: SceneType,
  headline: z.string(),
  subtext: z.string(),
  voiceover: z.string(),
  audioFile: z.string(), // path relative to public/, e.g. "reels/<id>/scene_0.mp3"
  durationSec: z.number(),
  words: z.array(WordTimestamp),
  loadId: z.number().optional(), // scene-level override; defaults to draft loadId
  filters: z.array(SceneFilter).optional(), // property/value filters applied to scene data fetches
  category: z.string().optional(), // for bar-chart scenes: which aggregate property is shown
  categories: z.array(CategoryStrategy).optional(), // strategyBars / boardSelections scene
  freqBars: z.array(FreqBar).optional(), // freqBars scene
  rangeGrid: z.array(RangeCell).optional(), // preflopMatrix scene (native 13x13)
  image: z.string().optional(), // legacy captured asset (path relative to public/)
  flowchart: FlowchartLayout.optional(), // natively-rendered decision tree
  zoom: z.number().optional(), // flowchart/captured-scene end zoom (default 1.2)
  panY: z.number().optional(), // captured-scene vertical offset, % (default 0)
  nodes: z.array(FlowNode).optional(), // flowchart node positions for camera targeting
  camera: z.array(CameraStep).optional(), // flowchart camera path (waypoints)
  imageW: z.number().optional(), // captured image dimensions (for aspect-correct framing)
  imageH: z.number().optional(),
});
export type RenderScene = z.infer<typeof RenderScene>;

// A scene before voiceover/render — the editable unit shown in the UI editor.
export const DraftScene = z.object({
  type: SceneType,
  headline: z.string(),
  subtext: z.string(),
  voiceover: z.string(),
  loadId: z.number().optional(), // scene-level override; defaults to draft loadId
  filters: z.array(SceneFilter).optional(), // property/value filters applied to scene data fetches
  category: z.string().optional(), // for bar-chart scenes: which aggregate property is shown
  categories: z.array(CategoryStrategy).optional(),
  freqBars: z.array(FreqBar).optional(),
  rangeGrid: z.array(RangeCell).optional(),
  image: z.string().optional(),
  flowchart: FlowchartLayout.optional(),
  zoom: z.number().optional(),
  panY: z.number().optional(),
  nodes: z.array(FlowNode).optional(),
  camera: z.array(CameraStep).optional(),
  imageW: z.number().optional(),
  imageH: z.number().optional(),
});
export type DraftScene = z.infer<typeof DraftScene>;

// All assets fetched for a spot, so the editor can add ANY scene type (or
// rebuild one) without re-running draft creation. Every field is optional.
export const DraftPool = z.object({
  image: z.string().optional(),
  imageW: z.number().optional(),
  imageH: z.number().optional(),
  flowchart: FlowchartLayout.optional(),
  nodes: z.array(FlowNode).optional(),
  preflopGrid: z.array(RangeCell).optional(),
  preflopLabel: z.string().optional(),
  boardCategories: z.array(CategoryStrategy).optional(),
  boardLabel: z.string().optional(),
  categories: z.array(CategoryStrategy).optional(),
  freqBars: z.array(FreqBar).optional(),
  highlightLabel: z.string().optional(),
});
export type DraftPool = z.infer<typeof DraftPool>;

export const DraftManifest = z.object({
  briefId: z.string(),
  title: z.string(),
  hashtags: z.array(z.string()),
  topic: z.string().optional(), // brief context, kept for contextual re-scripting
  concept: z.string().optional(),
  loadId: z.number().optional(), // so the editor can refetch other properties
  street: z.string().optional(),
  pool: DraftPool.optional(),
  scenes: z.array(DraftScene),
});
export type DraftManifest = z.infer<typeof DraftManifest>;

export const RenderManifest = z.object({
  briefId: z.string(),
  title: z.string(),
  hashtags: z.array(z.string()),
  music: z.string().optional(), // path relative to public/, optional bed track
  scenes: z.array(RenderScene),
});
export type RenderManifest = z.infer<typeof RenderManifest>;
