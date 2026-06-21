import type { FreqBar, CategoryStrategy, RangeCell } from "../types.js";

type Kind = FreqBar["kind"];

export const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const RANK_VALUE: Record<string, number> = Object.fromEntries(RANKS.map((r, i) => [r, 13 - i]));
const RANK_WORD_VALUE: Record<string, number> = {
  ACE: 14,
  KING: 13,
  QUEEN: 12,
  JACK: 11,
  TEN: 10,
  NINE: 9,
  EIGHT: 8,
  SEVEN: 7,
  SIX: 6,
  FIVE: 5,
  FOUR: 4,
  THREE: 3,
  TWO: 2,
};

// Legend order, matching the webapp's stacked bars (aggressive -> passive).
export const KIND_ORDER: Kind[] = ["raise", "bet", "call", "check", "fold"];

// Maps a solver action LABEL (e.g. "Bet 75%", "Raise 2.5x", "Allin") to a kind.
export function actionKind(action: string): Kind {
  const a = action.toLowerCase();
  if (a.startsWith("fold")) return "fold";
  if (a.startsWith("check")) return "check";
  if (a.startsWith("call")) return "call";
  if (a.startsWith("raise") || a.includes("allin") || a.startsWith("all-in")) return "raise";
  if (a.startsWith("bet")) return "bet";
  return "bet";
}

// Maps a RAW preflop action key (F/C/X/B/R/RAI/R<n>) to a kind.
export function rawActionKind(key: string): Kind {
  if (key === "F") return "fold";
  if (key === "X") return "check";
  if (key === "C") return "call";
  return "raise"; // B, R, RAI, R<n>
}

// --- Colours, ported verbatim from gto-central-next/lib/poker.ts so the reel
// matches the webapp exactly: Fold indigo, Check/Call green, and a size-driven
// red ramp for bets/raises (bigger sizing = hotter/deeper red).
function mix(from: string, to: string, t: number): string {
  const clamp = Math.max(0, Math.min(1, t));
  const chan = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * clamp);
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hex(lerp(chan(from, 1), chan(to, 1)))}${hex(lerp(chan(from, 3), chan(to, 3)))}${hex(lerp(chan(from, 5), chan(to, 5)))}`;
}

export function actionColor(action: string): string {
  const base = action.split(" ")[0];
  if (base === "Fold") return "#4646e1";
  if (base === "Check" || base === "Call") return "#47ba45";
  if (base === "Bet" || base === "Raise") {
    const isAllIn = /all[\s-]?in/i.test(action);
    const num = parseFloat(action.match(/[\d.]+/)?.[0] ?? "0") || 0;
    const pct = isAllIn ? 1 : Math.min(1, num / 125);
    return base === "Bet" ? mix("#e35a4d", "#a31d15", pct) : mix("#c0291f", "#7c1417", pct);
  }
  return "#858585";
}

// Raw preflop action key -> display label (ported from gto-central-next/lib/poker.ts).
export function actionDisplayName(key: string): string {
  if (key === "RAI") return "Raise All-In";
  if (key === "X") return "Check";
  if (key === "C") return "Call";
  if (key === "F") return "Fold";
  if (key === "B") return "Bet";
  if (key.startsWith("R") && key.length > 1 && !isNaN(Number(key.substring(1)))) return `Raise ${key.substring(1)}bb`;
  if (key === "R") return "Raise";
  return key;
}

export function positionName(p: string): string {
  const map: Record<string, string> = {
    UTG: "UTG", LJ: "Lojack", HJ: "Hijack", CO: "Cutoff", BTN: "Button", SB: "Small Blind", BB: "Big Blind",
  };
  return map[p] ?? p;
}

export function prettyCategory(c: string): string {
  return c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

// Rounds solver bet-size labels for display, e.g. "Bet 25.45%" -> "Bet 25%".
export function prettyAction(action: string): string {
  return action.replace(/(\d+(?:\.\d+)?)%/, (_, n) => `${Math.round(parseFloat(n))}%`);
}

export function aggression(c: CategoryStrategy): number {
  return c.actions.filter((a) => a.kind === "bet" || a.kind === "raise").reduce((s, a) => s + a.freq, 0);
}

// Matches gto-central-next/lib/poker.ts sortActions: order Raise, Bet, Call,
// Check, Fold; within a base action the larger size comes first (All-In biggest).
const ACTION_ORDER: Record<string, number> = { Raise: 0, Bet: 1, Call: 2, Check: 3, Fold: 4 };
export function sortActions(actions: FreqBar[]): FreqBar[] {
  const size = (a: string) => (/all[\s-]?in/i.test(a) ? 1e9 : parseFloat(a.split(" ")[1] ?? "") || 0);
  return [...actions].sort((a, b) => {
    const oa = ACTION_ORDER[a.action.split(" ")[0]] ?? 999;
    const ob = ACTION_ORDER[b.action.split(" ")[0]] ?? 999;
    return oa !== ob ? oa - ob : size(b.action) - size(a.action);
  });
}

// Single-rank category labels (e.g. flop_top_card_rank). Understands raw solver
// ranks (A/K/Q/J/T), numbers, and human labels from property_values (Ace/Ten).
export function rankSortValue(label: string): number {
  const s = label.trim().toUpperCase();
  if (RANK_VALUE[s] != null) return RANK_VALUE[s];
  if (RANK_WORD_VALUE[s] != null) return RANK_WORD_VALUE[s];
  const n = Number(s);
  return Number.isFinite(n) && n >= 2 && n <= 14 ? n : -1;
}

// Grid label for cell (row i, col j): pair / suited (upper) / offsuit (lower).
export function comboLabel(i: number, j: number): string {
  const hi = RANKS[Math.min(i, j)];
  const lo = RANKS[Math.max(i, j)];
  if (i === j) return `${hi}${hi}`;
  return i < j ? `${hi}${lo}s` : `${hi}${lo}o`;
}

function seeded(n: number): number {
  const x = Math.sin(n * 999) * 10000;
  return x - Math.floor(x);
}

// Plausible mock 169-cell range used for the studio preview / fallback.
export function buildMockGrid(): RangeCell[] {
  const grid: RangeCell[] = [];
  for (let i = 0; i < 13; i++) {
    for (let j = 0; j < 13; j++) {
      const strength = (26 - (i + j)) / 26;
      const r = seeded(i * 13 + j);
      const raise = Math.max(0, Math.min(1, strength * 1.2 - r * 0.3));
      const fold = Math.max(0, Math.min(1, (1 - strength) * 1.1 - r * 0.2));
      const call = Math.max(0, 1 - raise - fold);
      grid.push({ combo: comboLabel(i, j), raise, call, fold });
    }
  }
  return grid;
}

// Mock hand-strength categories for the strategy-bars preview / fallback.
export function buildMockCategories(): CategoryStrategy[] {
  const raw: [string, Partial<Record<string, number>>][] = [
    ["Set", { "Bet 75%": 86, Check: 14 }],
    ["Top Pair", { "Bet 75%": 61, Check: 34, Fold: 5 }],
    ["Overpair", { "Bet 75%": 72, Check: 25, Fold: 3 }],
    ["Middle Pair", { "Bet 75%": 38, Check: 52, Fold: 10 }],
    ["Ace High", { "Bet 75%": 22, Check: 49, Fold: 29 }],
    ["Low Card", { Check: 33, Fold: 67 }],
  ];
  return raw.map(([category, dist]) => ({
    category,
    actions: sortActions(
      Object.entries(dist).map(([action, freq]) => ({ action, freq: freq as number, kind: actionKind(action) }))
    ),
  }));
}
