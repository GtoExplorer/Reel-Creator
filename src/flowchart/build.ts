import dagre from "@dagrejs/dagre";
import { authGet, fetchFlowchartPropertyLabels } from "../data/solverApi.js";
import { filterQueryParts } from "../data/filters.js";
import { actionKind, prettyAction, prettyCategory, sortActions } from "../poker/ranges.js";
import type { FlowNode, FlowchartDirection, FlowchartLayout, FreqBar, LaidEdge, LaidNode, SceneFilter } from "../types.js";

// Ports the Explorer's default-subtree properties (lib/explorerParams.ts). The
// tree endpoint 500s without these + pred_on_split (which puts a strategy on
// split nodes too, so we can draw the thin bar).
const SUBTREE_BASE =
  "sdv,sdv_n,flop_tone,flop_paired,flop_n_to_flush,flop_top_card_rank,flop_second_card_rank,flop_third_card_rank,flop_top_gap,flop_second_gap";
const FLOP_DRAWS =
  "draw_2c_backdoor_flush_draw,draw_1c_backdoor_flush_draw,draw_backdoor_straight_draw,draw_2c_flush_draw,draw_1c_flush_draw,draw_straight_outs";
const TURN_PROPS =
  "turn_tone,turn_paired,turn_n_to_flush,turn_top_card_rank,turn_second_card_rank,turn_third_card_rank,turn_fourth_card_rank,turn_top_gap,turn_second_gap,turn_third_gap,turn_rank,turn_double_flush_draw,turn_front_door_flush_hit,turn_back_door_flush_draw,turn_adds_pair,turn_pairs_top_card,turn_pairs_second_card,turn_pairs_third_card";

function treeProperties(street: string): string {
  if (street === "turn") return `${SUBTREE_BASE},draw_2c_flush_draw,draw_1c_flush_draw,draw_straight_outs,${TURN_PROPS}`;
  return `${SUBTREE_BASE},${FLOP_DRAWS}`;
}

const NODE_W = 300;
const NODE_SEP = 130;
const RANK_SEP = 300;
const RANK_SEP_LR = 400;

// Deterministic node heights — we render the cards at exactly these sizes, so
// dagre lays out with no measurement error.
function nodeHeight(kind: "split" | "strategy", label: string, preds: FreqBar[]): number {
  if (kind === "split") {
    const lines = label.length > 22 ? 2 : 1;
    return 34 + lines * 40 + 16 + 28; // header + feature title + thin bar + padding
  }
  const rows = Math.max(1, preds.filter((p) => p.freq > 0.5).length);
  return 30 + 72 + rows * 28 + 26; // header + bar + legend rows + padding
}

type RawChild = { to_node_id: number; description_human_readable?: string };
type RawNode = {
  node_id: number;
  feature?: string;
  prediction?: { action: string; frequency: number }[];
  children?: RawChild[];
};

// Fetch the decision tree for a load and lay it out natively (no browser). Returns
// the render layout plus the normalised FlowNode[] (nodes + edge stopovers) that
// the camera/picker already consume.
export async function buildFlowchart(
  loadId: number,
  street = "flop",
  leafs: number | string = 5,
  filters: SceneFilter[] = [],
  direction: FlowchartDirection = "TB"
): Promise<{ layout: FlowchartLayout; nodes: FlowNode[] } | null> {
  const parts = [...filterQueryParts(filters), `properties=${treeProperties(street)}`, "pred_on_split=true"];
  const res = await authGet(`/tree/${loadId}/${street}/${leafs}/?${parts.join("&")}`);
  if (!res.ok) return null;
  const raw = (await res.json()) as RawNode[];
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const labels = await fetchFlowchartPropertyLabels();

  // Decision (edge) label leading INTO each node.
  const edgeInto: Record<number, string> = {};
  for (const n of raw) for (const c of n.children ?? []) if (c.description_human_readable) edgeInto[c.to_node_id] = c.description_human_readable;

  type M = { id: string; kind: "split" | "strategy"; label: string; edge?: string; preds: FreqBar[]; w: number; h: number };
  const model: M[] = raw.map((n) => {
    const kind: "split" | "strategy" = n.feature ? "split" : "strategy";
    const preds = sortActions(
      (n.prediction ?? []).map((p) => ({ action: prettyAction(p.action), freq: Math.round(p.frequency * 1000) / 10, kind: actionKind(p.action) }))
    );
    const label = kind === "split" ? labels[n.feature as string] ?? prettyCategory(n.feature as string) : "Strategy";
    return { id: String(n.node_id), kind, label, edge: edgeInto[n.node_id], preds, w: NODE_W, h: nodeHeight(kind, label, preds) };
  });

  // ---- dagre layout ----
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: NODE_SEP, ranksep: direction === "LR" ? RANK_SEP_LR : RANK_SEP });
  for (const m of model) g.setNode(m.id, { width: m.w, height: m.h });
  const rawEdges: { id: string; source: string; target: string; label?: string }[] = [];
  for (const n of raw)
    for (const c of n.children ?? []) {
      const source = String(n.node_id);
      const target = String(c.to_node_id);
      g.setEdge(source, target);
      rawEdges.push({ id: `edge-${source}-${target}`, source, target, label: c.description_human_readable });
    }
  dagre.layout(g, { disableOptimalOrderHeuristic: true, ranker: "longest-path" });

  // top-left positions + bounding box
  const pos = new Map<string, { x: number; y: number }>();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const m of model) {
    const p = g.node(m.id);
    const x = p.x - m.w / 2;
    const y = p.y - m.h / 2;
    pos.set(m.id, { x, y });
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + m.w);
    maxY = Math.max(maxY, y + m.h);
  }
  const PAD = 80;
  minX -= PAD; minY -= PAD; maxX += PAD; maxY += PAD;
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const nx = (x: number) => x - minX;
  const ny = (y: number) => y - minY;

  const laidNodes: LaidNode[] = model.map((m) => {
    const p = pos.get(m.id)!;
    return { id: m.id, x: nx(p.x), y: ny(p.y), w: m.w, h: m.h, kind: m.kind, label: m.label, edge: m.edge, predictions: m.preds };
  });
  const byId = new Map(model.map((m) => [m.id, m]));
  const laidEdges: LaidEdge[] = rawEdges.map((e) => {
    const source = byId.get(e.source)!;
    const target = byId.get(e.target)!;
    const sp = pos.get(e.source)!;
    const tp = pos.get(e.target)!;
    const tb = direction === "TB";
    const sourceX = nx(sp.x + (tb ? source.w / 2 : source.w));
    const sourceY = ny(sp.y + (tb ? source.h : source.h / 2));
    const targetX = nx(tp.x + (tb ? target.w / 2 : 0));
    const targetY = ny(tp.y + (tb ? 0 : target.h / 2));
    const midX = sourceX + (targetX - sourceX) / 2;
    const midY = sourceY + (targetY - sourceY) / 2;
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      points: tb
        ? [
            { x: sourceX, y: sourceY },
            { x: sourceX, y: midY },
            { x: targetX, y: midY },
            { x: targetX, y: targetY },
          ]
        : [
            { x: sourceX, y: sourceY },
            { x: midX, y: sourceY },
            { x: midX, y: targetY },
            { x: targetX, y: targetY },
          ],
      label: e.label,
      // Match FlowchartEdgeLine's chip placement so picker edge-markers line up.
      labelX: tb ? targetX : targetX - 105,
      labelY: tb ? targetY - 80 : targetY,
    };
  });

  const layout: FlowchartLayout = { direction, width, height, nodes: laidNodes, edges: laidEdges };

  // ---- normalised FlowNode[] for the camera + picker ----
  const summary = (preds: FreqBar[]) => preds.map((p) => `${p.action} ${Math.round(p.freq)}%`).join(", ");
  const fnodes: FlowNode[] = laidNodes.map((n) => ({
    id: n.id,
    label: n.kind === "split" ? n.label : `Strategy · ${summary(n.predictions.filter((p) => p.freq > 0.5)).slice(0, 40)}`,
    kind: n.kind,
    edge: n.edge,
    summary: summary(n.predictions),
    cx: +((n.x + n.w / 2) / width).toFixed(4),
    cy: +((n.y + n.h / 2) / height).toFixed(4),
  }));
  const enodes: FlowNode[] = laidEdges
    .filter((e) => e.label)
    .map((e) => ({
      id: e.id,
      label: e.label as string,
      kind: "edge" as const,
      edge: e.label,
      source: e.source,
      target: e.target,
      summary: `Decision branch: ${e.label}`,
      cx: +(e.labelX / width).toFixed(4),
      cy: +(e.labelY / height).toFixed(4),
    }));

  return { layout, nodes: [...fnodes, ...enodes] };
}
