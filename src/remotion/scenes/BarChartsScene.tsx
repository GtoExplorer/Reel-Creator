import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { RenderScene, FreqBar, TimedDrawingAnimation } from "../../types.js";
import { theme } from "../theme.js";
import { KIND_ORDER, actionColor, sortActions } from "../../poker/ranges.js";
import { orderCategoryRows } from "../../barRows.js";
import { type DrawingBox, TimedDrawingOverlay } from "../components/DrawingOverlay.js";

const ROW_H = 52;
const ROW_GAP = 24;
const CHART_W = 1080;
const BAR_W = 540;
const COLUMN_GAP = 24;
// The bar column is centered between two equal-width flex columns (label + spacer),
// so its x offset depends on the surrounding column widths, not a fixed margin.
const HIGHLIGHT_X = (CHART_W - BAR_W) / 2;
const HIGHLIGHT_W = BAR_W;

const KIND_LABEL: Record<FreqBar["kind"], string> = {
  raise: "Raise",
  bet: "Bet",
  call: "Call",
  check: "Check",
  fold: "Fold",
};

const Legend: React.FC<{ kinds: FreqBar["kind"][] }> = ({ kinds }) => (
  <div style={{ display: "flex", gap: 30, marginTop: 44, justifyContent: "center", flexWrap: "wrap" }}>
    {kinds.map((k) => (
      <div key={k} style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: theme.action[k] }} />
        <span style={{ fontSize: 30, fontWeight: 700, color: theme.muted }}>{KIND_LABEL[k]}</span>
      </div>
    ))}
  </div>
);

export const BarChartsScene: React.FC<{ scene: RenderScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Rank series render high-to-low so Ace appears at the top of the chart.
  const cats = orderCategoryRows(scene.categories ?? [], scene.category);
  const kindsPresent = KIND_ORDER.filter((k) => cats.some((c) => c.actions.some((a) => a.kind === k)));
  const chartHeight = Math.max(ROW_H, cats.length * ROW_H + Math.max(0, cats.length - 1) * ROW_GAP);

  function resolveBox(drawing: TimedDrawingAnimation): DrawingBox | null {
    const target = drawing.target;
    if (target.kind !== "barRange") return null;
    const from = cats.findIndex((c) => c.category === target.from);
    const to = cats.findIndex((c) => c.category === target.to);
    if (from === -1 || to === -1) return null;
    const top = Math.min(from, to);
    const bottom = Math.max(from, to);
    return {
      x: HIGHLIGHT_X,
      y: top * (ROW_H + ROW_GAP),
      w: HIGHLIGHT_W,
      h: (bottom - top + 1) * ROW_H + (bottom - top) * ROW_GAP,
    };
  }

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ fontSize: 52, fontWeight: 800, color: theme.text, textAlign: "center", marginBottom: 56, letterSpacing: -1 }}>
        {scene.headline || "Bar Charts"}
      </div>
      <div style={{ position: "relative", width: CHART_W, height: chartHeight, display: "flex", flexDirection: "column", gap: ROW_GAP }}>
        {cats.map((c, i) => {
          const grow = spring({ frame, fps, delay: 4 + i * 4, config: { damping: 200 } });
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)", alignItems: "center", columnGap: COLUMN_GAP }}>
              <div style={{ textAlign: "right", whiteSpace: "nowrap", fontSize: 34, fontWeight: 700, color: theme.text }}>
                {c.category}
              </div>
              <div style={{ width: BAR_W, height: 52, borderRadius: 12, backgroundColor: theme.surface, border: `1px solid ${theme.surfaceBorder}`, overflow: "hidden" }}>
                <div style={{ display: "flex", height: "100%", width: "100%", transform: `scaleX(${grow})`, transformOrigin: "left" }}>
                  {sortActions(c.actions).map((a, j) => (
                    <div key={j} style={{ width: `${a.freq}%`, height: "100%", backgroundColor: actionColor(a.action) }} />
                  ))}
                </div>
              </div>
              <div />
            </div>
          );
        })}
        <TimedDrawingOverlay width={CHART_W} height={chartHeight} drawings={scene.drawings} resolveBox={resolveBox} />
      </div>
      <Legend kinds={kindsPresent} />
      {scene.subtext ? (
        <div style={{ marginTop: 30, textAlign: "center", fontSize: 30, fontWeight: 600, color: theme.muted }}>
          {scene.subtext}
        </div>
      ) : null}
    </div>
  );
};
