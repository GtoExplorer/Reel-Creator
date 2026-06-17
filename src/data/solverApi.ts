import { config } from "../config.js";
import { mintSession } from "../capture/session.js";
import type { Brief, SpotData, CategoryStrategy, FreqBar, RangeCell } from "../types.js";
import {
  actionDisplayName,
  actionKind,
  aggression,
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

const MAX_ROWS = 9;

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
async function authGet(pathStr: string): Promise<Response> {
  return fetch(`${proxyBase()}${pathStr}`, { headers: { Cookie: await authCookie() } });
}

function buildSpot(label: string, categories: CategoryStrategy[], brief: Brief): SpotData {
  // Order strong -> weak (more bet/raise = stronger). If there are more classes
  // than fit, downsample evenly so the chart keeps the full gradient.
  const sorted = [...categories].sort((a, b) => aggression(b) - aggression(a));
  const ranked =
    sorted.length <= MAX_ROWS
      ? sorted
      : Array.from({ length: MAX_ROWS }, (_, i) => sorted[Math.round((i * (sorted.length - 1)) / (MAX_ROWS - 1))]);

  const fallback = ranked[Math.floor(ranked.length / 2)] ?? ranked[0];
  const highlight =
    (brief.highlightCategory
      ? ranked.find((c) => c.category.toLowerCase() === brief.highlightCategory!.toLowerCase())
      : undefined) ?? fallback;

  return {
    label,
    categories: ranked,
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

function parseAggregate(rows: AggregateRow[]): CategoryStrategy[] {
  return rows.map((row) => ({
    category: prettyCategory(String(row.category)),
    actions: sortActions(
      Object.entries(row.strategy)
        .filter(([, freq]) => freq != null)
        .map(([action, freq]) => ({ action: prettyAction(action), freq: Math.round(freq * 1000) / 10, kind: actionKind(action) }))
    ),
  }));
}

async function fetchAggregate(brief: Brief, category: string): Promise<CategoryStrategy[] | null> {
  const street = brief.street ?? "flop";
  const res = await authGet(`/loads/${brief.loadId}/strategies/hand_properties/${street}/aggregate/${category}/`);
  if (!res.ok) return null;
  const rows = (await res.json()) as AggregateRow[];
  const cats = parseAggregate(rows);
  return cats.length ? cats : null;
}

// Fetch one aggregate property's bars for a load (used by the editor's property
// picker). Sorted strong→weak like the strategy-bars scene, capped at 9 rows.
export async function fetchCategoryStrategies(
  loadId: number,
  street: string,
  category: string
): Promise<{ categories: CategoryStrategy[]; label: string } | null> {
  if (!config.explorerSessionSecret || !config.explorerLoginEmail) return null;
  const res = await authGet(`/loads/${loadId}/strategies/hand_properties/${street}/aggregate/${category}/`);
  if (!res.ok) return null;
  const cats = parseAggregate((await res.json()) as AggregateRow[]);
  if (!cats.length) return null;
  const sorted = [...cats].sort((a, b) => aggression(b) - aggression(a)).slice(0, 9);
  return { categories: sorted, label: prettyCategory(category) };
}

type WizardNode = {
  player_node?: { player?: string };
  solutions?: {
    next_actions?: Record<string, { postflop_id?: unknown }>;
    hand_solutions?: Record<string, { strategy: Record<string, number> }>;
  };
};

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

// Native preflop range matrix: walk the preflop-wizard tree along the line to the
// LAST raiser's decision node — i.e. the range that player is opening/3-betting —
// and bucket each combo into raise/call/fold proportions. Falls back to root.
async function fetchPreflopRange(brief: Brief): Promise<{ grid: RangeCell[]; label?: string } | null> {
  try {
    let gameId = brief.gameId;
    if (!gameId) {
      const gamesRes = await authGet(`/games/`);
      if (!gamesRes.ok) return null;
      const games = (await gamesRes.json()) as { id: string }[];
      gameId = games[0]?.id;
    }
    if (!gameId) return null;

    const res = await authGet(`/preflop_wizard_strats/${gameId}`);
    if (!res.ok) return null;
    const strategies = (await res.json()) as Record<string, WizardNode>;

    // Navigate the display-label line into an action-id path.
    const path: string[] = [];
    for (const label of brief.preflopLine ?? []) {
      const key = path.length ? path.join("-") : "0";
      const next = strategies[key]?.solutions?.next_actions;
      if (!next) break;
      const aid = Object.keys(next).find((k) => actionDisplayName(k) === label);
      if (!aid) break;
      path.push(aid);
    }

    // The node BEFORE the last raise = that player's opening/3-bet decision range.
    let raiserIdx = -1;
    path.forEach((a, i) => {
      if (rawActionKind(a) === "raise") raiserIdx = i;
    });
    const nodePath = raiserIdx >= 0 ? path.slice(0, raiserIdx) : [];
    const key = nodePath.length ? nodePath.join("-") : "0";
    const node = strategies[key];
    const handSolutions = node?.solutions?.hand_solutions ?? strategies["0"]?.solutions?.hand_solutions;
    if (!handSolutions) return null;

    let label: string | undefined;
    const player = node?.player_node?.player;
    if (player && raiserIdx >= 0) {
      const priorRaise = path.slice(0, raiserIdx).some((a) => rawActionKind(a) === "raise");
      label = `${positionName(player)} ${priorRaise ? "3-Bet Range" : "Opening Range"}`;
    }

    return { grid: gridFromSolutions(handSolutions), label };
  } catch (e) {
    console.warn("[solverApi] preflop range fetch failed:", (e as Error).message);
    return null;
  }
}

// Reverse of the line→load mapping: given a postflop load id, walk the preflop
// wizard tree to the action whose `postflop_id` matches, then read the path of
// action ids that reaches it back out as display labels (the preflop line). The
// tree node keys ARE the action path ("0" = root, "F-F-F-F", …); each node's
// next_actions[aid].postflop_id is the load that taking that action produces.
function findLineInTree(strategies: Record<string, WizardNode>, loadId: number): string[] | null {
  for (const [nodeKey, node] of Object.entries(strategies)) {
    const next = node.solutions?.next_actions;
    if (!next) continue;
    for (const [aid, info] of Object.entries(next)) {
      if (Number((info as { postflop_id?: unknown }).postflop_id) === loadId) {
        const prefix = nodeKey === "0" ? [] : nodeKey.split("-");
        return [...prefix, aid].map(actionDisplayName);
      }
    }
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
    let gameIds: string[] = [];
    if (gameId) {
      gameIds = [gameId];
    } else {
      const gamesRes = await authGet(`/games/`);
      if (!gamesRes.ok) return null;
      gameIds = ((await gamesRes.json()) as { id: string }[]).map((g) => g.id).filter(Boolean);
    }

    for (const gid of gameIds) {
      const res = await authGet(`/preflop_wizard_strats/${gid}`);
      if (!res.ok) continue;
      const strategies = (await res.json()) as Record<string, WizardNode>;
      const line = findLineInTree(strategies, loadId);
      if (line) return { line, gameId: gid };
    }
    return null;
  } catch (e) {
    console.warn("[solverApi] lineFromLoadId failed:", (e as Error).message);
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
  const boardCat = brief.boardCategory ?? "flop_top_card_rank";
  const [pre, boardCats] = await Promise.all([fetchPreflopRange(brief), fetchAggregate(brief, boardCat)]);
  spot.preflopGrid = pre?.grid ?? buildMockGrid();
  spot.preflopLabel = pre?.label;
  spot.boardCategories = boardCats
    ? [...boardCats].sort((a, b) => rankSortValue(b.category) - rankSortValue(a.category)).slice(0, 9)
    : buildMockCategories();
  spot.boardLabel = prettyCategory(boardCat);
  return spot;
}
