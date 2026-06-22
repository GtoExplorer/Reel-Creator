import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { RenderScene, TimedDrawingAnimation } from "../../types.js";
import { theme } from "../theme.js";
import { actionColor } from "../../poker/ranges.js";
import { type DrawingBox, TimedDrawingOverlay } from "../components/DrawingOverlay.js";

const ROW_H = 136;
const ROW_GAP = 52;
const CHART_W = 1080;
const HIGHLIGHT_X = 48;
const HIGHLIGHT_W = CHART_W - HIGHLIGHT_X * 2;

export const FreqBarsScene: React.FC<{ scene: RenderScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bars = scene.freqBars ?? [];
  const chartHeight = Math.max(ROW_H, bars.length * ROW_H + Math.max(0, bars.length - 1) * ROW_GAP);

  function resolveBox(drawing: TimedDrawingAnimation): DrawingBox | null {
    const target = drawing.target;
    if (target.kind !== "freqRange") return null;
    const from = bars.findIndex((b) => b.action === target.from);
    const to = bars.findIndex((b) => b.action === target.to);
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
      <div style={{ fontSize: 56, fontWeight: 800, color: theme.text, textAlign: "center", marginBottom: 80, letterSpacing: -1 }}>
        {scene.headline || scene.barValue || "Action frequencies"}
      </div>
      <div style={{ position: "relative", width: CHART_W, height: chartHeight, display: "flex", flexDirection: "column", gap: ROW_GAP }}>
        {bars.map((b, i) => {
          const grow = spring({ frame, fps, delay: 6 + i * 7, config: { damping: 200 } });
          const value = interpolate(grow, [0, 1], [0, b.freq]);
          const color = actionColor(b.action);
          return (
            <div key={i} style={{ height: ROW_H }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
                <span style={{ fontSize: 46, fontWeight: 700, color: theme.text }}>{b.action}</span>
                <span style={{ fontSize: 56, fontWeight: 900, color }}>{Math.round(value)}%</span>
              </div>
              <div style={{ height: 60, borderRadius: 16, backgroundColor: theme.surface, border: `1px solid ${theme.surfaceBorder}`, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${value}%`,
                    borderRadius: 16,
                    backgroundColor: color,
                    boxShadow: `0 0 28px ${color}66`,
                  }}
                />
              </div>
            </div>
          );
        })}
        <TimedDrawingOverlay width={CHART_W} height={chartHeight} drawings={scene.drawings} resolveBox={resolveBox} />
      </div>
    </div>
  );
};
