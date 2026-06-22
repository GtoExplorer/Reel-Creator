import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import type { RenderScene, TimedDrawingAnimation } from "../../types.js";
import { theme } from "../theme.js";
import { type DrawingBox, TimedDrawingOverlay } from "../components/DrawingOverlay.js";

const GRID = 13;
const CELL = 64;
const GAP = 3;
const PAD = 16;
const GRID_SIZE = GRID * CELL + (GRID - 1) * GAP + PAD * 2;

const Legend: React.FC = () => (
  <div style={{ display: "flex", gap: 36, marginTop: 36, justifyContent: "center" }}>
    {[
      ["Raise", theme.action.raise],
      ["Call", theme.action.call],
      ["Fold", theme.action.fold],
    ].map(([label, color]) => (
      <div key={label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: color }} />
        <span style={{ fontSize: 32, fontWeight: 700, color: theme.muted }}>{label}</span>
      </div>
    ))}
  </div>
);

// Native 13x13 preflop range chart — crisper/more legible than a screenshot.
export const RangeGridScene: React.FC<{ scene: RenderScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const cells = scene.rangeGrid ?? [];

  function resolveBox(drawing: TimedDrawingAnimation): DrawingBox | null {
    const target = drawing.target;
    if (target.kind !== "preflopHand") return null;
    const index = cells.findIndex((c) => c.combo.toLowerCase() === target.hand.toLowerCase());
    if (index === -1) return null;
    const row = Math.floor(index / GRID);
    const col = index % GRID;
    return { x: PAD + col * (CELL + GAP), y: PAD + row * (CELL + GAP), w: CELL, h: CELL };
  }

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
      <div style={{ fontSize: 52, fontWeight: 800, color: theme.text, marginBottom: 30, letterSpacing: -1 }}>
        {scene.headline || "Preflop range"}
      </div>
      <div style={{ position: "relative", width: GRID_SIZE, height: GRID_SIZE }}>
        <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${GRID}, ${CELL}px)`,
          gridTemplateRows: `repeat(${GRID}, ${CELL}px)`,
          gap: GAP,
          padding: PAD,
          borderRadius: 22,
          backgroundColor: theme.surface,
          border: `1px solid ${theme.surfaceBorder}`,
        }}
      >
        {cells.map((c, i) => {
          const reveal = interpolate(frame, [(i % GRID) + Math.floor(i / GRID), (i % GRID) + Math.floor(i / GRID) + 9], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div key={i} style={{ position: "relative", overflow: "hidden", borderRadius: 7, backgroundColor: theme.bg, opacity: reveal, transform: `scale(${0.6 + 0.4 * reveal})` }}>
              {/* Action segments left-to-right (raise → call → fold), matching the
                  Explorer's range matrix (vertical stripes), not top-to-bottom. */}
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "row" }}>
                <div style={{ width: `${c.raise * 100}%`, backgroundColor: theme.action.raise }} />
                <div style={{ width: `${c.call * 100}%`, backgroundColor: theme.action.call }} />
                <div style={{ width: `${c.fold * 100}%`, backgroundColor: theme.action.fold }} />
              </div>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, fontWeight: 800, color: theme.text, textShadow: "0 1px 3px rgba(0,0,0,0.85)" }}>
                {c.combo}
              </div>
            </div>
          );
        })}
        </div>
        <TimedDrawingOverlay width={GRID_SIZE} height={GRID_SIZE} drawings={scene.drawings} resolveBox={resolveBox} />
      </div>
      <Legend />
    </div>
  );
};
