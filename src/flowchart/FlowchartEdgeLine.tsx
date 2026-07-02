import React, { createContext, useContext, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Position,
  useInternalNode,
  useStore,
  type EdgeProps,
  type InternalNode,
} from "@xyflow/react";

// Ported from gto-central-next FlowchartEdge.tsx — smooth-step connector + the
// branch-condition chip near where the edge enters the target node. Inline styles
// (no Tailwind) so it matches in the headless export.
export const EdgeHighlightContext = createContext<Set<string>>(new Set());

function splitLabel(s: string): [string, string] | null {
  if (s.length <= 12) return null;
  const mid = s.length / 2;
  let best = -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === " " && (best === -1 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  }
  if (best === -1) return null;
  return [s.slice(0, best), s.slice(best + 1)];
}

// Anchor point on a node's bounding box for the given side. Edges anchor off the
// live node geometry rather than ReactFlow's handle bounds: handle offsets are
// captured once at internals-update time, so when a card later grows (fonts load,
// legend rows render) the stale offsets leave arrows hitting above centre.
function nodeAnchor(node: InternalNode, side: Position): { x: number; y: number } {
  const { x, y } = node.internals.positionAbsolute;
  const w = node.measured?.width ?? 0;
  const h = node.measured?.height ?? 0;
  switch (side) {
    case Position.Left:
      return { x, y: y + h / 2 };
    case Position.Right:
      return { x: x + w, y: y + h / 2 };
    case Position.Top:
      return { x: x + w / 2, y };
    default:
      return { x: x + w / 2, y: y + h };
  }
}

export function FlowchartEdgeLine({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
  selected,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const s = sourceNode?.measured?.width ? nodeAnchor(sourceNode, sourcePosition) : { x: sourceX, y: sourceY };
  const t = targetNode?.measured?.width ? nodeAnchor(targetNode, targetPosition) : { x: targetX, y: targetY };
  const [edgePath] = getSmoothStepPath({
    sourceX: s.x,
    sourceY: s.y,
    targetX: t.x,
    targetY: t.y,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
  });
  const d = data as { label?: string; active?: boolean } | undefined;
  const label = d?.label;
  const onPath = useContext(EdgeHighlightContext).has(id);
  const active = hovered || Boolean(selected) || Boolean(d?.active) || onPath;
  const zoom = useStore((s) => s.transform[2]);
  const lr = targetPosition === Position.Left;
  const labelX = lr ? t.x - 105 : t.x;
  const labelY = lr ? t.y : t.y - 80;
  const lines = lr ? splitLabel(label ?? "") : null;
  const chipScale = active ? Math.min(6, Math.max(1.25, 0.575 / zoom)) : 1;

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={{ stroke: active ? "#d0ab1d" : "#454545", strokeWidth: active ? 2 : 1.5 }} />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "none",
              zIndex: active ? 1000 : 1,
            }}
          >
            <div
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                borderRadius: 9999,
                border: `1px solid ${active ? "rgba(208,171,29,0.7)" : "#292929"}`,
                background: active ? "#242526" : "rgba(36,37,38,0.95)",
                padding: "6px 12px",
                fontSize: 20,
                fontWeight: 600,
                color: active ? "#ededed" : "#a3a3a3",
                whiteSpace: "nowrap",
                pointerEvents: "auto",
                transform: `scale(${chipScale})`,
                transformOrigin: "center",
                transition: "transform 100ms ease, color 100ms ease, border-color 100ms ease",
                boxShadow: active ? "0 0 0 1px rgba(208,171,29,0.25), 0 4px 6px -1px rgba(0,0,0,0.45)" : "0 4px 6px -1px rgba(0,0,0,0.3)",
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 9999, background: active ? "#d0ab1d" : "#858585", flexShrink: 0, display: "block" }} />
              {lines ? (
                <span style={{ display: "flex", flexDirection: "column", textAlign: "center", lineHeight: 1.05 }}>
                  <span>{lines[0]}</span>
                  <span>{lines[1]}</span>
                </span>
              ) : (
                label
              )}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
