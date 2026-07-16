import { config } from "../config.js";
import { mintSession } from "../capture/session.js";
import type { Brief, SpotData, CategoryStrategy, FreqBar, RangeCell, SceneFilter } from "../types.js";
import { filterQueryParts } from "./filters.js";
import {
  actionDisplayName,
  actionKind,
  buildMockCategories,
  buildMockGrid,
  comboLabel,
  positionName,
  prettyAction,
  prettyCategory,
  rankSortValue,
  rawActionKind,
  sortActions,
} from "../poker/ranges.js";

// Shape returned by SolverAPI's aggregate endpoint (see crud.query_to_dict):
//   [{ category: str|bool|int, strategy: { <action>: <freq 0-1> } }, ...]
type AggregateRow = { category: string | number | boolean; strategy: Record<string, number> };

// Cap on bar rows - enough for all 13 card ranks (the largest property).
// Rank properties are normalized high-to-low (Ace -> 2); other properties keep
// the API's natural order.
const MAX_BARS = 13;

// Data goes through the local webapp's /api/gto proxy (same backend the Explorer
// uses), authed with the same minted session cookie — so an auto-detected load id
// is always valid for the data calls.
let _cookie: string | undefined;
async function authCookie(): Promise<string> {
  if (!_cookie) _cookie = `gtoc_session=${await mintSession(config.explorerLoginEmail, config.explorerSessionSecret)}`;
  return _cookie;
}
function proxyBase(): string {
  return `${new URL(config.explorerUrl).origin}/api/gto`;
}
export async function authGet(pathStr: string): Promise<Response> {
  return fetch(`${proxyBase()}${pathStr}`, { headers: { Cookie: await authCookie() } });
}

export type PostflopStreet = "flop" | "turn" | "river";

// A load is solved for one specific postflop street. Always ask the load
// endpoint instead of inferring it from the caller or defaulting to flop.
export async function fetchLoadStreet(loadId: number): Promise<PostflopStreet | null> {
  if (!config.explorerSessionSecret || !config.explorerLoginEmail) return null;
  const res = await authGet(`/loads/${loadId}`);
  if (!res.ok) return null;
  const street = String(((await res.json()) as { street?: unknown }).street ?? "").toLowerCase();
  return street === "flop" || street === "turn" || street === "river" ? street : null;
}

function buildSpot(label: string, categories: CategoryStrategy[], brief: Brief): SpotData {
  // Keep the API's natural order (same as the Explorer's bar charts) — no sorting.
  const ordered = categories.slice(0, MAX_BARS);
  const fallback = ordered[Math.floor(ordered.length / 2)] ?? ordered[0];
  const highlight =
    (brief.highlightCategory
      ? ordered.find((c) => c.category.toLowerCase() === brief.highlightCategory!.toLowerCase())
      : undefined) ?? fallback;

  return {
    label,
    categories: ordered,
    highlightLabel: highlight?.category ?? "",
    highlightBars: highlight?.actions ?? [],
  };
}

function mockSpot(brief: Brief): SpotData {
  const spot = buildSpot(brief.board ? `${brief.topic} — ${brief.board}` : brief.topic, buildMockCategories(), brief);
  spot.preflopGrid = buildMockGrid();
  spot.boardCategories = buildMockCategories();
  spot.boardLabel = "By flop high card";
  return spot;
}

// Human-readable label maps, fetched once from the same endpoints the Explorer
// uses (/properties/ for property names, /property_values/ for the values shown
// on the bars). Both expose human_readable.{flowchart,barchart}; bar charts use
// the `barchart` variant. Falls back to a local prettifier on failure.
type LabelMaps = {
  props: Record<string, string>; // barchart variant
  propsFlowchart: Record<string, string>; // flowchart variant (for the decision tree)
  values: Record<string, Record<string, string>>;
};
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
let _labelMaps: LabelMaps | undefined;
async function labelMaps(): Promise<LabelMaps> {
  if (_labelMaps) return _labelMaps;
  const maps: LabelMaps = { props: {}, propsFlowchart: {}, values: {} };
  try {
    const [pr, pv] = await Promise.all([authGet("/properties/"), authGet("/property_values/")]);
    if (pr.ok) {
      const rows = (await pr.json()) as { property: string; human_readable?: { barchart?: string; flowchart?: string } }[];
      for (const r of rows)
        if (r.property) {
          maps.props[r.property] = clean(r.human_readable?.barchart ?? r.property);
          maps.propsFlowchart[r.property] = clean(r.human_readable?.flowchart ?? r.property);
        }
    }
    if (pv.ok) {
      const raw = (await pv.json()) as Record<string, { value: string; human_readable?: { barchart?: string } }[]>;
      for (const [k, arr] of Object.entries(raw)) {
        const m: Record<string, string> = {};
        for (const it of arr) m[String(it.value)] = clean(it.human_readable?.barchart ?? String(it.value));
        maps.values[k] = m;
      }
    }
  } catch (e) {
    console.warn("[solverApi] label maps fetch failed:", (e as Error).message);
  }
  _labelMaps = maps;
  return maps;
}
const propLabel = (maps: LabelMaps, property: string) => maps.props[property] ?? prettyCategory(property);

// Exposed for the editor's property dropdown (human-readable property names).
export async function fetchPropertyLabels(): Promise<Record<string, string>> {
  if (!config.explorerSessionSecret || !config.explorerLoginEmail) return {};
  return (await labelMaps()).props;
}


export async function fetchPropertyValueOptions(): Promise<Record<string, { value: string; label: string }[]>> {
  if (!config.explorerSessionSecret || !config.explorerLoginEmail) return {};
  const maps = await labelMaps();
  return Object.fromEntries(
    Object.entries(maps.values).map(([property, values]) => [
      property,
      Object.entries(values).map(([value, label]) => ({ value, label })),
    ])
  );
}
// Flowchart-variant property labels (feature → human name) for the decision tree.
export async function fetchFlowchartPropertyLabels(): Promise<Record<string, string>> {
  if (!config.explorerSessionSecret || !config.explorerLoginEmail) return {};
  return (await labelMaps()).propsFlowchart;
}

function parseAggregate(rows: AggregateRow[], valueLabels?: Record<string, string>): CategoryStrategy[] {
  return rows.map((row) => {
    const raw = String(row.category);
    return {
      category: valueLabels?.[raw] ?? prettyCategory(raw),
      actions: sortActions(
        Object.entries(row.strategy)
          .filter(([, freq]) => freq != null)
          .map(([action, freq]) => ({ action: prettyAction(action), freq: Math.round(freq * 1000) / 10, kind: actionKind(action) }))
      ),
    };
  });
}

function isRankAggregate(category: string): boolean {
  return category.endsWith("_card_rank") || category === "turn_rank" || category === "river_rank";
}

function orderAggregateCategories(category: string, cats: CategoryStrategy[]): CategoryStrategy[] {
  if (!isRankAggregate(category)) return cats;
  return cats
    .map((c, i) => ({ c, i, v: rankSortValue(c.category) }))
    .sort((a, b) => {
      if (a.v < 0 && b.v < 0) return a.i - b.i;
      if (a.v < 0) return 1;
      if (b.v < 0) return -1;
      return a.v === b.v ? a.i - b.i : b.v - a.v;
    })
    .map(({ c }) => c);
}

async function fetchAggregate(brief: Brief, category: string): Promise<CategoryStrategy[] | null> {
  const street = brief.street ?? "flop";
  const res = await authGet(`/loads/${brief.loadId}/strategies/hand_properties/${street}/aggregate/${category}/`);
  if (!res.ok) return null;
  const rows = (await res.json()) as AggregateRow[];
  const maps = await labelMaps();
  const cats = orderAggregateCategories(category, parseAggregate(rows, maps.values[category]));
  return cats.length ? cats : null;
}

// Fetch one aggregate property's bars for a load (used by the editor's property
// picker). Rank properties use high-to-low card order; other properties keep API order.
export async function fetchCategoryStrategies(
  loadId: number,
  street: string,
  category: string,
  filters: SceneFilter[] = []
): Promise<{ categories: CategoryStrategy[]; label: string } | null> {
  if (!config.explorerSessionSecret || !config.explorerLoginEmail) return null;
  const parts = filterQueryParts(filters, category);
  const query = parts.length ? `?${parts.join("&")}` : "";
  const res = await authGet(`/loads/${loadId}/strategies/hand_properties/${street}/aggregate/${category}/${query}`);
  if (!res.ok) return null;
  const maps = await labelMaps();
  const cats = orderAggregateCategories(category, parseAggregate((await res.json()) as AggregateRow[], maps.values[category]));
  if (!cats.length) return null;
  // Cap after ordering, so rank charts keep the full Ace -> 2 sequence.
  return { categories: cats.slice(0, MAX_BARS), label: propLabel(maps, category) };
}

type WizardNode = {
  player_node?: { player?: string };
  solutions?: {
    next_actions?: Record<string, { postflop_id?: unknown }>;
    hand_solutions?: Record<string, { strategy: Record<string, number> }>;
  };
};

type LoadExitMatch = {
  line: string[];
  nodeKey: string;
  exitActionId: string;
};

function sortGameIds(games: { id: string }[]): string[] {
  return games.map((g) => g.id).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function gridFromSolutions(handSolutions: Record<string, { strategy: Record<string, number> }>): RangeCell[] {
  const grid: RangeCell[] = [];
  for (let i = 0; i < 13; i++) {
    for (let j = 0; j < 13; j++) {
      const combo = comboLabel(i, j);
      const strat = handSolutions[combo]?.strategy ?? {};
      let raise = 0, call = 0, fold = 0;
      for (const [key, freq] of Object.entries(strat)) {
        const k = rawActionKind(key);
        if (k === "fold") fold += freq;
        else if (k === "call" || k === "check") call += freq;
        else raise += freq;
      }
      const total = raise + call + fold || 1;
      grid.push({ combo, raise: raise / total, call: call / total, fold: fold / total });
    }
  }
  return grid;
}

async function preflopGameIds(gameId?: string): Promise<string[]> {
  if (gameId) return [gameId];
  const gamesRes = await authGet(`/games/`);
  if (!gamesRes.ok) return [];
  return sortGameIds((await gamesRes.json()) as { id: string }[]);
}

function normalizeActionLabel(label: string): string {
  return label.toLowerCase().replace(/\s+/g, " ").trim();
}

function findActionId(next: Record<string, unknown>, label: string): string | undefined {
  const needle = normalizeActionLabel(label);
  return Object.keys(next).find((key) => {
    return normalizeActionLabel(actionDisplayName(key)) === needle || normalizeActionLabel(key) === needle;
  });
}

function resolvePreflopPath(strategies: Record<string, WizardNode>, line: string[]): string[] | null {
  const path: string[] = [];
  for (const label of line) {
    const key = path.length ? path.join("-") : "0";
    const next = strategies[key]?.solutions?.next_actions;
    if (!next) return null;
    const aid = findActionId(next, label);
    if (!aid) return null;
    path.push(aid);
  }
  return path;
}

function matrixPathForSelectedPath(strategies: Record<string, WizardNode>, path: string[]): string[] {
  if (path.length === 0) return path;
  const last = path[path.length - 1];
  const parent = path.slice(0, -1);
  const parentKey = parent.length ? parent.join("-") : "0";
  return strategies[parentKey]?.solutions?.next_actions?.[last]?.postflop_id ? parent : path;
}

function labelForPreflopMatrix(node: WizardNode | undefined, line: string[], matrixPath: string[]): string | undefined {
  const player = node?.player_node?.player;
  if (!player) return undefined;
  const endedAtPostflopExit = matrixPath.length < line.length;
  const action = endedAtPostflopExit ? line[line.length - 1] : undefined;
  return action ? `${positionName(player)} ${action} Range` : `${positionName(player)} Range`;
}

// Native preflop range matrix from the exact preflop action sequence selected in
// the wizard. This mirrors Explorer's PreflopRangeMatrix: use the selected path,
// except when the last action exits to a postflop load, where the parent decision
// node contains the visible matrix.
export async function fetchPreflopMatrixForLine(
  line: string[],
  gameId?: string
): Promise<{ grid: RangeCell[]; label?: string; line: string[]; gameId: string } | null> {
  if (!config.explorerSessionSecret || !config.explorerLoginEmail) return null;
  try {
    for (const gid of await preflopGameIds(gameId)) {
      const res = await authGet(`/preflop_wizard_strats/${gid}`);
      if (!res.ok) continue;
      const strategies = (await res.json()) as Record<string, WizardNode>;
      const selectedPath = resolvePreflopPath(strategies, line);
      if (!selectedPath) continue;
      const matrixPath = matrixPathForSelectedPath(strategies, selectedPath);
      const key = matrixPath.length ? matrixPath.join("-") : "0";
      const node = strategies[key];
      const handSolutions = node?.solutions?.hand_solutions;
      if (!handSolutions) continue;
      return {
        grid: gridFromSolutions(handSolutions),
        label: labelForPreflopMatrix(node, line, matrixPath),
        line,
        gameId: gid,
      };
    }
    return null;
  } catch (e) {
    console.warn("[solverApi] preflop matrix for line failed:", (e as Error).message);
    return null;
  }
}

// Reverse of the line→load mapping: given a postflop load id, walk the preflop
// wizard tree to the action whose `postflop_id` matches, then read the path of
// action ids that reaches it back out as display labels (the preflop line). The
// tree node keys ARE the action path ("0" = root, "F-F-F-F", …); each node's
// next_actions[aid].postflop_id is the load that taking that action produces.
function findLoadExitInTree(strategies: Record<string, WizardNode>, loadId: number): LoadExitMatch | null {
  const matches: LoadExitMatch[] = [];
  for (const nodeKey of Object.keys(strategies).sort((a, b) => a.localeCompare(b))) {
    const node = strategies[nodeKey];
    const next = node.solutions?.next_actions;
    if (!next) continue;
    for (const [aid, info] of Object.entries(next).sort(([a], [b]) => a.localeCompare(b))) {
      if (Number((info as { postflop_id?: unknown }).postflop_id) === loadId) {
        const prefix = nodeKey === "0" ? [] : nodeKey.split("-");
        const lineIds = [...prefix, aid];
        matches.push({
          line: lineIds.map(actionDisplayName),
          nodeKey,
          exitActionId: aid,
        });
      }
    }
  }
  return matches.sort((a, b) => `${a.nodeKey}/${a.exitActionId}`.localeCompare(`${b.nodeKey}/${b.exitActionId}`))[0] ?? null;
}

async function findLoadExit(
  loadId: number,
  gameId?: string
): Promise<{ match: LoadExitMatch; gameId: string; strategies: Record<string, WizardNode> } | null> {
  let gameIds: string[] = [];
  if (gameId) {
    gameIds = [gameId];
  } else {
    const gamesRes = await authGet(`/games/`);
    if (!gamesRes.ok) return null;
    gameIds = sortGameIds((await gamesRes.json()) as { id: string }[]);
  }

  for (const gid of gameIds) {
    const res = await authGet(`/preflop_wizard_strats/${gid}`);
    if (!res.ok) continue;
    const strategies = (await res.json()) as Record<string, WizardNode>;
    const match = findLoadExitInTree(strategies, loadId);
    if (match) return { match, gameId: gid, strategies };
  }
  return null;
}

export async function lineFromLoadId(
  loadId: number,
  gameId?: string
): Promise<{ line: string[]; gameId: string } | null> {
  if (!config.explorerSessionSecret || !config.explorerLoginEmail) return null;
  try {
    // A load lives in exactly one game's tree, but we don't know which — search
    // every game (most loads resolve in the first one or two).
    const found = await findLoadExit(loadId, gameId);
    return found ? { line: found.match.line, gameId: found.gameId } : null;
  } catch (e) {
    console.warn("[solverApi] lineFromLoadId failed:", (e as Error).message);
    return null;
  }
}

export async function fetchPreflopMatrixForLoad(
  loadId: number,
  gameId?: string
): Promise<{ grid: RangeCell[]; label?: string; line: string[]; gameId: string } | null> {
  if (!config.explorerSessionSecret || !config.explorerLoginEmail) return null;
  try {
    const found = await findLoadExit(loadId, gameId);
    if (!found) return null;

    // Match the Explorer: when the selected preflop action exits to a postflop
    // load, the visible preflop matrix is the parent decision node.
    const node = found.strategies[found.match.nodeKey];
    const handSolutions = node?.solutions?.hand_solutions;
    if (!handSolutions) return null;

    const player = node?.player_node?.player;
    const action = actionDisplayName(found.match.exitActionId);
    const label = player ? `${positionName(player)} ${action} Range` : `${action} Range`;
    return {
      grid: gridFromSolutions(handSolutions),
      label,
      line: found.match.line,
      gameId: found.gameId,
    };
  } catch (e) {
    console.warn("[solverApi] preflop matrix for load failed:", (e as Error).message);
    return null;
  }
}

// Forward lookup: navigate the wizard tree along a display-label line and return
// the postflop load id its closing action produces. Searches every game.
export async function loadIdFromLine(line: string[], gameId?: string): Promise<{ loadId: number; gameId: string } | null> {
  if (!config.explorerSessionSecret || !config.explorerLoginEmail || !line.length) return null;
  try {
    let gameIds: string[] = [];
    if (gameId) gameIds = [gameId];
    else {
      const gamesRes = await authGet(`/games/`);
      if (!gamesRes.ok) return null;
      gameIds = sortGameIds((await gamesRes.json()) as { id: string }[]);
    }
    for (const gid of gameIds) {
      const res = await authGet(`/preflop_wizard_strats/${gid}`);
      if (!res.ok) continue;
      const strategies = (await res.json()) as Record<string, WizardNode>;
      const path: string[] = [];
      let loadId: number | undefined;
      let ok = true;
      for (const label of line) {
        const key = path.length ? path.join("-") : "0";
        const next = strategies[key]?.solutions?.next_actions;
        if (!next) { ok = false; break; }
        const aid = Object.keys(next).find((k) => actionDisplayName(k) === label);
        if (!aid) { ok = false; break; }
        const pid = Number((next[aid] as { postflop_id?: unknown }).postflop_id);
        if (pid) loadId = pid;
        path.push(aid);
      }
      if (ok && loadId) return { loadId, gameId: gid };
    }
    return null;
  } catch (e) {
    console.warn("[solverApi] loadIdFromLine failed:", (e as Error).message);
    return null;
  }
}

// Pulls real solver data when configured, otherwise returns a deterministic mock.
export async function fetchSpotData(brief: Brief): Promise<SpotData> {
  if (!config.explorerSessionSecret || !config.explorerLoginEmail || !brief.loadId) {
    console.log("[solverApi] no session/loadId — using mock spot data");
    return mockSpot(brief);
  }
  const category = brief.category ?? "sdv";
  const categories = await fetchAggregate(brief, category);
  if (!categories) {
    console.warn("[solverApi] aggregate unavailable — falling back to mock");
    return mockSpot(brief);
  }
  const label = brief.board ? `${brief.topic} — ${brief.board}` : brief.topic;
  const spot = buildSpot(label, categories, brief);

  // Native preflop matrix + board-selection bars (best-effort; mock on failure).
  const boardCat = brief.boardCategory ?? (brief.street === "turn" ? "turn_top_card_rank" : "flop_top_card_rank");
  const [pre, boardCats] = await Promise.all([
    brief.preflopLine?.length
      ? fetchPreflopMatrixForLine(brief.preflopLine, brief.gameId)
      : brief.loadId
        ? fetchPreflopMatrixForLoad(brief.loadId, brief.gameId)
        : null,
    fetchAggregate(brief, boardCat),
  ]);
  spot.preflopGrid = pre?.grid ?? buildMockGrid();
  spot.preflopLabel = pre?.label;
  // Card-rank properties were already normalized by fetchAggregate.
  spot.boardCategories = boardCats ? boardCats.slice(0, MAX_BARS) : buildMockCategories();
  spot.boardLabel = propLabel(await labelMaps(), boardCat);
  return spot;
}
