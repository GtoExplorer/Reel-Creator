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

export function defaultTreeProperties(street: string): string {
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
export type RawTreeNode = {
  node_id: number;
  feature?: string;
  prediction?: { action: string; frequency: number }[];
  children?: RawChild[];
  parent_edge?: { parent_node_id: number; parent_edge_description: string };
};

// Fetch a decision (sub)tree. `q` is the Explorer-style path description
// (~feature-op-value~...) that conditions a node-expansion subtree on the
// branch decisions above it. The endpoint 500s without a properties list.
export async function fetchTree(
  loadId: number,
  street: string,
  leafs: number | string,
  propertiesCsv?: string,
  filters: SceneFilter[] = [],
  q?: string
): Promise<RawTreeNode[] | null> {
  const properties = propertiesCsv || defaultTreeProperties(street);
  const parts = [...filterQueryParts(filters), `properties=${properties}`, "pred_on_split=true"];
  if (q) parts.push(`q=${q}`);
  const res = await authGet(`/tree/${loadId}/${street}/${leafs}/?${parts.join("&")}`);
  if (!res.ok) return null;
  const body = await res.json();
  const raw = (Array.isArray(body) ? body : Object.values(body ?? {})) as RawTreeNode[];
  return raw.length > 0 ? raw : null;
}

// ---- tree-edit helpers (ported from the Explorer's Flowchart/ApiHandler) ----

const OPERATOR: Record<string, string> = {
  "==": "-eq-",
  "<=": "-le-",
  ">=": "-ge-",
  "<": "-lt-",
  ">": "-gt-",
  "!=": "-ne-",
};

function descriptionClause(description: string, feature: string): string {
  const conv = (v: string): string | number => {
    if (!isNaN(Number(v))) return parseInt(v);
    if (v.toLowerCase() === "yes") return "True";
    if (v.toLowerCase() === "no") return "False";
    return v;
  };
  const arr = description.split(" ");
  if (arr.length === 1) return `~${feature}-eq-${conv(arr[0])}`;
  if (arr.length === 2) return `~${feature}${OPERATOR[arr[0]]}${conv(arr[1])}`;
  if (arr.length === 3 && arr[1] === "-")
    return `~${feature}-ge-${conv(arr[0])}~${feature}-le-${conv(arr[2])}`;
  return "";
}

// The `q=` filter expression describing a node's position in the tree — every
// branch decision on the path from the root, built by walking parent edges.
export function nodeDescription(raw: RawTreeNode[], nodeId: number): string {
  let node = raw.find((n) => n.node_id === nodeId);
  let description = "";
  let parent = node?.parent_edge?.parent_node_id;
  while (parent !== undefined && parent !== -1) {
    const parentNode = raw.find((n) => n.node_id === parent);
    if (!parentNode || !node?.parent_edge) break;
    description = descriptionClause(node.parent_edge.parent_edge_description, parentNode.feature as string) + description;
    node = parentNode;
    parent = parentNode.parent_edge?.parent_node_id;
  }
  return description.substring(1);
}

// Collapse: drop every descendant of the node and clear its children, so the
// graph rebuild can't resurrect the subtree and a re-click re-fetches fresh.
export function pruneSubtree(raw: RawTreeNode[], nodeId: number): RawTreeNode[] {
  const byId = new Map(raw.map((n) => [n.node_id, n]));
  const toRemove = new Set<number>();
  const stack = (byId.get(nodeId)?.children ?? []).map((c) => c.to_node_id);
  while (stack.length) {
    const id = stack.pop()!;
    if (toRemove.has(id)) continue;
    toRemove.add(id);
    for (const c of byId.get(id)?.children ?? []) stack.push(c.to_node_id);
  }
  return raw
    .filter((n) => !toRemove.has(n.node_id))
    .map((n) => (n.node_id === nodeId ? { ...n, children: undefined } : n));
}

// Expand: splice a freshly-fetched subtree in at the clicked node. The fetched
// tree's ids start at 0, so re-id them past the current max; its root takes the
// clicked node's id, parent edge and prediction, so the join is seamless.
export function mergeSubtree(raw: RawTreeNode[], nodeId: number, fetched: RawTreeNode[]): RawTreeNode[] {
  const current = raw.find((n) => n.node_id === nodeId);
  if (!current) return raw;
  let working = current.children ? pruneSubtree(raw, nodeId) : [...raw];
  const lastNodeID = working.reduce((m, n) => (n.node_id > m ? n.node_id : m), 0);
  const parentEdge = current.parent_edge;
  const prediction = current.prediction;
  working = working.filter((n) => n.node_id !== nodeId);

  const updated = fetched.map((node) => {
    const u: RawTreeNode = { ...node };
    if (node.node_id === 0) {
      u.parent_edge = parentEdge ? { ...parentEdge } : u.parent_edge;
      u.prediction = prediction;
      u.node_id = nodeId;
    } else {
      u.node_id = node.node_id + lastNodeID;
      if (node.parent_edge) {
        u.parent_edge = {
          ...node.parent_edge,
          parent_node_id:
            node.parent_edge.parent_node_id === 0
              ? nodeId
              : node.parent_edge.parent_node_id === -1
                ? node.parent_edge.parent_node_id
                : node.parent_edge.parent_node_id + lastNodeID,
        };
      }
    }
    if (node.children) u.children = node.children.map((c) => ({ ...c, to_node_id: c.to_node_id + lastNodeID }));
    return u;
  });
  return [...working, ...updated];
}

// Fetch the decision tree for a load and lay it out natively (no browser). Returns
// the render layout plus the normalised FlowNode[] (nodes + edge stopovers) that
// the camera/picker already consume, and the raw tree (for later edits).
export async function buildFlowchart(
  loadId: number,
  street = "flop",
  leafs: number | string = 5,
  filters: SceneFilter[] = [],
  direction: FlowchartDirection = "TB",
  propertiesCsv?: string
): Promise<{ layout: FlowchartLayout; nodes: FlowNode[]; raw: RawTreeNode[] } | null> {
  const raw = await fetchTree(loadId, street, leafs, propertiesCsv, filters);
  if (!raw) return null;
  const laid = await layoutTree(raw, direction);
  return { ...laid, raw };
}

// Lay out a raw tree with dagre (deterministic node sizes, no browser).
export async function layoutTree(
  raw: RawTreeNode[],
  direction: FlowchartDirection = "TB"
): Promise<{ layout: FlowchartLayout; nodes: FlowNode[] }> {
  const labels = await fetchFlowchartPropertyLabels();

  // Decision (edge) label leading INTO each node.
  const edgeInto: Record<number, string> = {};
  for (const n of raw) for (const c of n.children ?? []) if (c.description_human_readable) edgeInto[c.to_node_id] = c.description_human_readable;

  type M = { id: string; kind: "split" | "strategy"; label: string; edge?: string; preds: FreqBar[]; w: number; h: number };
  const model: M[] = raw.map((n) => {
    // Like the Explorer, the card style follows the node's CURRENT state: a
    // collapsed split (children pruned) renders as a strategy/leaf card again.
    const kind: "split" | "strategy" = n.feature && (n.children?.length ?? 0) > 0 ? "split" : "strategy";
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
