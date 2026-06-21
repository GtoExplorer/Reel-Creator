import React from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, Position, type EdgeProps } from "@xyflow/react";

// Ported from gto-central-next FlowchartEdge.tsx — smooth-step connector + the
// branch-condition chip near where the edge enters the target node. Inline styles
// (no Tailwind) so it matches in the headless export.
export function FlowchartEdgeLine({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 12 });
  const d = data as { label?: string; active?: boolean } | undefined;
  const label = d?.label;
  const active = Boolean(d?.active);
  const lr = targetPosition === Position.Left;
  const labelX = lr ? targetX - 105 : targetX;
  const labelY = lr ? targetY : targetY - 80;

  return (
    <>
      {active && <path d={edgePath} fill="none" stroke="#d0ab1d" strokeOpacity={0.28} strokeWidth={10} />}
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={{ stroke: active ? "#d0ab1d" : "#454545", strokeWidth: active ? 2.5 : 1.5 }} />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan"
            style={{ position: "absolute", transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "none" }}
          >
            <div
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
                boxShadow: active ? "0 0 0 1px rgba(208,171,29,0.25), 0 4px 6px -1px rgba(0,0,0,0.4)" : "0 4px 6px -1px rgba(0,0,0,0.3)",
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: 9999, background: active ? "#d0ab1d" : "#858585", flexShrink: 0, display: "block" }} />
              {label}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
