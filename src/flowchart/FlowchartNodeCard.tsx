import React from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { FreqBar } from "../types.js";
import { actionColor } from "../poker/ranges.js";

// Ported from gto-central-next FlowchartNode.tsx — same two card variants (split /
// strategy), styled with inline styles (so it renders identically in Remotion's
// headless export where the webapp's Tailwind isn't present). Redux/interactivity
// stripped; the reel only needs the static look.

export interface FlowCardData {
  kind: "split" | "strategy";
  label: string; // feature name (split) or "Strategy"
  predictions: FreqBar[]; // freq 0-100, sorted
  isRoot?: boolean;
  [key: string]: unknown;
}

const C = {
  surface: "#242526",
  surface2: "#333443",
  line: "#292929",
  text: "#ededed",
  muted: "#a3a3a3",
  muted2: "#858585",
  accent: "#d0ab1d",
};
const handleStyle: React.CSSProperties = { width: 8, height: 8, border: 0, background: "#6b7280", opacity: 0 };

const Segments: React.FC<{ preds: FreqBar[] }> = ({ preds }) => (
  <>
    {preds
      .filter((p) => p.freq > 0)
      .map((p, i) => (
        <div key={i} style={{ width: `${p.freq}%`, backgroundColor: actionColor(p.action) }} />
      ))}
  </>
);

export function FlowchartNodeCard({ data, targetPosition, sourcePosition }: NodeProps) {
  const d = data as FlowCardData;
  const split = d.kind === "split";
  const hasStrategy = d.predictions.some((p) => p.freq > 0);

  return (
    <>
      <Handle type="target" position={targetPosition ?? Position.Top} style={handleStyle} isConnectable={false} />
      {split ? (
        <div
          style={{
            width: 300,
            boxSizing: "border-box",
            borderRadius: 12,
            border: `1px solid rgba(208,171,29,0.3)`,
            background: C.surface2,
            padding: "12px 16px",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.2), 0 10px 15px -3px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 15, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: C.accent }}>
              Deciding on:
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.muted2} strokeWidth="3">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
          <div style={{ marginTop: 4, fontSize: 28, fontWeight: 600, lineHeight: 1.2, color: C.text }}>{d.label}</div>
          {hasStrategy && (
            <div
              style={{
                marginTop: 10,
                display: "flex",
                height: 8,
                gap: 1,
                overflow: "hidden",
                borderRadius: 9999,
                background: "rgba(0,0,0,0.4)",
                opacity: 0.8,
                boxShadow: "0 0 0 1px rgba(0,0,0,0.3)",
              }}
            >
              <Segments preds={d.predictions} />
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            width: 300,
            boxSizing: "border-box",
            borderRadius: 12,
            border: `1px solid ${C.line}`,
            background: C.surface,
            padding: "10px 12px",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.2), 0 10px 15px -3px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 11, height: 11 }}>
              <span style={{ width: 9, height: 9, borderRadius: 9999, background: C.accent, display: "block" }} />
            </span>
            <span style={{ fontSize: 15, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: C.muted2 }}>
              Strategy
            </span>
          </div>
          <div style={{ display: "flex", height: 72, gap: 1, overflow: "hidden", borderRadius: 6, background: "rgba(0,0,0,0.4)", boxShadow: "0 0 0 1px rgba(0,0,0,0.3)" }}>
            <Segments preds={d.predictions} />
          </div>
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column" }}>
            {d.predictions
              .filter((p) => p.freq > 0.5)
              .map((p, i) => (
                <span key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 15, lineHeight: 1.25, color: C.muted }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: actionColor(p.action), flexShrink: 0, display: "block" }} />
                    {p.action}
                  </span>
                  <span style={{ flexShrink: 0 }}>{p.freq.toFixed(0)}%</span>
                </span>
              ))}
          </div>
        </div>
      )}
      <Handle type="source" position={sourcePosition ?? Position.Bottom} style={handleStyle} isConnectable={false} />
    </>
  );
}
