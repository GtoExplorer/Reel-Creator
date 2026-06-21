import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  Background,
  BackgroundVariant,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  useStore,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { continueRender, delayRender, getRemotionEnvironment } from "remotion";
import type { FlowchartLayout } from "../types.js";
import { FlowchartNodeCard } from "./FlowchartNodeCard.js";
import { FlowchartEdgeLine } from "./FlowchartEdgeLine.js";

// Renders the decision tree with the SAME react-flow setup as the Explorer (our
// ported node/edge components + the dagre layout from build.ts). The whole layout
// box is mapped 1:1 onto the pane, so the normalised cx/cy used by the camera and
// the picker markers line up exactly. Shared by Remotion (CaptureScene) and the
// editor picker — both run in a browser/Chromium, so xyflow works in both.

const nodeTypes = { customNode: FlowchartNodeCard };
const edgeTypes = { flowchartEdge: FlowchartEdgeLine };

type FlowchartCamera = { cx: number; cy: number; zoom: number };

function buildNodes(layout: FlowchartLayout): Node[] {
  const tb = layout.direction !== "LR";
  return layout.nodes.map((n) => ({
    id: n.id,
    type: "customNode",
    position: { x: n.x, y: n.y },
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
        zIndex: active.has(id) ? 10 : 0,
      };
    });
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
  const nodes = useMemo(() => buildNodes(layout), [layout]);
  const edges = useMemo(() => buildEdges(layout, active), [layout, active]);
  const init = useNodesInitialized();
  const paneW = useStore((s) => s.width);
  const paneH = useStore((s) => s.height);
  const { setViewport } = useReactFlow();

  // Drive ReactFlow's viewport directly. The camera's normalised focus point is
  // transformed in layout/world coordinates, so it remains centred even when the
  // pane is letterboxed or constrained by the reel frame.
  useLayoutEffect(() => {
    if (paneW <= 0 || paneH <= 0) return;
    const baseZoom = Math.min(paneW / layout.width, paneH / layout.height);
    const cam = camera ?? { cx: 0.5, cy: 0.5, zoom: 1 };
    const zoom = baseZoom * Math.max(0.05, cam.zoom || 1);
    const focusX = Math.max(0, Math.min(1, cam.cx)) * layout.width;
    const focusY = Math.max(0, Math.min(1, cam.cy)) * layout.height;
    setViewport({
      x: paneW / 2 - focusX * zoom,
      y: paneH / 2 - focusY * zoom,
      zoom,
    });
  }, [paneW, paneH, layout.width, layout.height, camera?.cx, camera?.cy, camera?.zoom, setViewport]);

  // Headless render only: hold the frame until nodes are measured (so edges draw).
  const rendering = getRemotionEnvironment().isRendering;
  const [handle] = useState<number | null>(() => (rendering ? delayRender("flowchart-init") : null));
  const done = useRef(false);
  useEffect(() => {
    if (handle != null && !done.current && init && paneW > 0 && paneH > 0) {
      done.current = true;
      continueRender(handle);
    }
  }, [init, paneW, paneH, handle]);
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
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#2e2f30" />
    </ReactFlow>
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
