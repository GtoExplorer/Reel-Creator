import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import dagre from "@dagrejs/dagre";
import {
  Background,
  BackgroundVariant,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useNodesInitialized,
  useReactFlow,
  useStore,
  useUpdateNodeInternals,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { continueRender, delayRender, getRemotionEnvironment } from "remotion";
import type { FlowchartLayout } from "../types.js";
import { FlowchartNodeCard } from "./FlowchartNodeCard.js";
import { EdgeHighlightContext, FlowchartEdgeLine } from "./FlowchartEdgeLine.js";

// Renders the decision tree with the same ReactFlow + measured dagre layout model
// as Explorer. build.ts still fetches/serialises the tree for the draft, but the
// visual layout is finalised here after xyflow has measured the real card DOM.

const nodeTypes = { customNode: FlowchartNodeCard };
const edgeTypes = { flowchartEdge: FlowchartEdgeLine };
const NODE_W = 300;
const NODE_H = 150;
const NODE_SEP = 130;
const RANK_SEP = 300;
const RANK_SEP_LR = 400;
const PAD = 80;
const rankSep = (dir: FlowchartLayout["direction"]) => (dir === "LR" ? RANK_SEP_LR : RANK_SEP);

type FlowchartCamera = { cx: number; cy: number; zoom: number };
type Bounds = { width: number; height: number };

function buildNodes(layout: FlowchartLayout): Node[] {
  const tb = layout.direction !== "LR";
  return layout.nodes.map((n) => ({
    id: n.id,
    type: "customNode",
    position: { x: 0, y: 0 },
    data: { kind: n.kind, label: n.label, predictions: n.predictions, isRoot: n.id === "0" },
    targetPosition: tb ? Position.Top : Position.Left,
    sourcePosition: tb ? Position.Bottom : Position.Right,
    draggable: false,
    selectable: false,
    connectable: false,
  }));
}

function buildEdges(layout: FlowchartLayout, active: Set<string>): Edge[] {
  return layout.edges
    .filter((e) => e.source && e.target)
    .map((e) => {
      const id = e.id ?? `edge-${e.source}-${e.target}`;
      return {
        id,
        source: e.source as string,
        target: e.target as string,
        type: "flowchartEdge",
        data: { label: e.label, active: active.has(id) },
        markerEnd: { type: MarkerType.ArrowClosed, color: active.has(id) ? "#d0ab1d" : "#454545", width: 16, height: 16 },
      };
    });
}

function measuredSize(n: Node): { width: number; height: number } {
  const measured = (n as Node & { measured?: { width?: number; height?: number } }).measured;
  return {
    width: measured?.width ?? NODE_W,
    height: measured?.height ?? NODE_H,
  };
}

function layoutGraph(nodes: Node[], edges: Edge[], direction: FlowchartLayout["direction"]): { nodes: Node[]; bounds: Bounds } {
  const tb = direction !== "LR";
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: NODE_SEP, ranksep: rankSep(direction) });
  nodes.forEach((n) => {
    const s = measuredSize(n);
    g.setNode(n.id, { width: s.width, height: s.height });
  });
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g, { disableOptimalOrderHeuristic: true, ranker: "longest-path" });

  const rankTop = new Map<number, number>();
  if (tb) {
    nodes.forEach((n) => {
      const p = g.node(n.id);
      if (!p) return;
      const s = measuredSize(n);
      const top = p.y - s.height / 2;
      const key = Math.round(p.y);
      const cur = rankTop.get(key);
      if (cur === undefined || top < cur) rankTop.set(key, top);
    });
  }

  const positioned = nodes.map((n) => {
    const p = g.node(n.id);
    if (!p) return n;
    const s = measuredSize(n);
    return {
      ...n,
      position: {
        x: p.x - s.width / 2,
        y: tb ? rankTop.get(Math.round(p.y)) ?? p.y - s.height / 2 : p.y - s.height / 2,
      },
      targetPosition: tb ? Position.Top : Position.Left,
      sourcePosition: tb ? Position.Bottom : Position.Right,
    };
  });

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  positioned.forEach((n) => {
    const s = measuredSize(n);
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + s.width);
    maxY = Math.max(maxY, n.position.y + s.height);
  });
  if (!Number.isFinite(minX)) return { nodes: positioned, bounds: { width: 1, height: 1 } };
  minX -= PAD; minY -= PAD; maxX += PAD; maxY += PAD;

  return {
    nodes: positioned.map((n) => ({ ...n, position: { x: n.position.x - minX, y: n.position.y - minY } })),
    bounds: { width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) },
  };
}

function Inner({
  layout,
  highlightedEdges,
  camera,
}: {
  layout: FlowchartLayout;
  highlightedEdges?: Iterable<string>;
  camera?: FlowchartCamera;
}) {
  const active = useMemo(() => new Set(highlightedEdges ?? []), [highlightedEdges]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [bounds, setBounds] = useState<Bounds>({ width: layout.width, height: layout.height });
  const [layoutReady, setLayoutReady] = useState(false);
  const layoutSig = useRef("");
  const init = useNodesInitialized();
  const paneW = useStore((s) => s.width);
  const paneH = useStore((s) => s.height);
  const { setViewport } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    const builtNodes = buildNodes(layout);
    const builtEdges = buildEdges(layout, active);
    const laid = layoutGraph(builtNodes, builtEdges, layout.direction);
    layoutSig.current = "";
    setLayoutReady(false);
    setBounds(laid.bounds);
    setNodes(laid.nodes);
    setEdges(builtEdges);
    requestAnimationFrame(() => builtNodes.forEach((n) => updateNodeInternals(n.id)));
    // Only rebuild the graph structure when the layout itself changes. Active
    // route highlighting is updated in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  useEffect(() => {
    setEdges((cur) =>
      cur.map((e) => {
        const on = active.has(e.id);
        return {
          ...e,
          data: { ...(e.data ?? {}), active: on },
          markerEnd: { type: MarkerType.ArrowClosed, color: on ? "#d0ab1d" : "#454545", width: 16, height: 16 },
        };
      })
    );
  }, [active, setEdges]);

  useLayoutEffect(() => {
    if (!init || nodes.length === 0) return;
    if (!nodes.every((n) => (n as Node & { measured?: { height?: number } }).measured?.height)) return;
    const sig =
      layout.direction +
      "|" +
      nodes
        .map((n) => {
          const s = measuredSize(n);
          return `${n.id}:${Math.round(s.width)}x${Math.round(s.height)}`;
        })
        .sort()
        .join("|");
    if (sig === layoutSig.current) return;
    layoutSig.current = sig;
    const laid = layoutGraph(nodes, edges, layout.direction);
    setBounds(laid.bounds);
    setNodes(laid.nodes);
    setLayoutReady(true);
  }, [init, nodes, edges, layout.direction, setNodes]);

  // Drive ReactFlow's viewport directly. The camera's normalised focus point is
  // transformed in layout/world coordinates, so it remains centred even when the
  // pane is letterboxed or constrained by the reel frame.
  useLayoutEffect(() => {
    if (!layoutReady || paneW <= 0 || paneH <= 0) return;
    const baseZoom = Math.min(paneW / bounds.width, paneH / bounds.height);
    const cam = camera ?? { cx: 0.5, cy: 0.5, zoom: 1 };
    const zoom = baseZoom * Math.max(0.05, cam.zoom || 1);
    const focusX = Math.max(0, Math.min(1, cam.cx)) * bounds.width;
    const focusY = Math.max(0, Math.min(1, cam.cy)) * bounds.height;
    setViewport({
      x: paneW / 2 - focusX * zoom,
      y: paneH / 2 - focusY * zoom,
      zoom,
    });
  }, [layoutReady, paneW, paneH, bounds.width, bounds.height, camera?.cx, camera?.cy, camera?.zoom, setViewport]);

  // Headless render only: hold the frame until nodes are measured (so edges draw).
  const rendering = getRemotionEnvironment().isRendering;
  const [handle] = useState<number | null>(() => (rendering ? delayRender("flowchart-init") : null));
  const done = useRef(false);
  useEffect(() => {
    if (handle != null && !done.current && init && layoutReady && paneW > 0 && paneH > 0) {
      done.current = true;
      continueRender(handle);
    }
  }, [init, layoutReady, paneW, paneH, handle]);
  useEffect(() => {
    if (handle == null) return;
    const t = setTimeout(() => {
      if (!done.current) {
        done.current = true;
        continueRender(handle);
      }
    }, 8000);
    return () => clearTimeout(t);
  }, [handle]);

  return (
    <EdgeHighlightContext.Provider value={active}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView={false}
        minZoom={0.01}
        maxZoom={10}
        panOnDrag={false}
        panOnScroll={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#2e2f30" />
      </ReactFlow>
    </EdgeHighlightContext.Provider>
  );
}

export const FlowchartView: React.FC<{
  layout: FlowchartLayout;
  highlightedEdges?: Iterable<string>;
  camera?: FlowchartCamera;
  style?: CSSProperties;
  className?: string;
}> = ({ layout, highlightedEdges, camera, style, className }) => (
  <div className={className} style={{ width: "100%", height: "100%", ...style }}>
    <ReactFlowProvider>
      <Inner layout={layout} highlightedEdges={highlightedEdges} camera={camera} />
    </ReactFlowProvider>
  </div>
);
