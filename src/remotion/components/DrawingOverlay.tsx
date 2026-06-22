import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { TimedDrawingAnimation } from "../../types.js";

export type DrawingBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export const TimedDrawingOverlay: React.FC<{
  width: number;
  height: number;
  drawings?: TimedDrawingAnimation[];
  resolveBox: (drawing: TimedDrawingAnimation) => DrawingBox | null;
}> = ({ width, height, drawings = [], resolveBox }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sec = frame / fps;

  if (!drawings.length) return null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}
    >
      {drawings.map((drawing, i) => {
        const box = resolveBox(drawing);
        if (!box) return null;
        const visible = sec >= drawing.startSec - 0.08 && sec <= drawing.endSec + 0.18;
        if (!visible) return null;

        const drawSec = Math.max(0.05, drawing.drawSec || 0.35);
        const progress = interpolate(sec, [drawing.startSec, drawing.startSec + drawSec], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const opacity = Math.min(
          interpolate(sec, [drawing.startSec - 0.08, drawing.startSec + 0.08], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          interpolate(sec, [drawing.endSec, drawing.endSec + 0.18], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        );
        const pad = drawing.padding ?? 12;
        const x = box.x - pad;
        const y = box.y - pad;
        const w = box.w + pad * 2;
        const h = box.h + pad * 2;
        const strokeDashoffset = 1 - progress;

        if (drawing.shape === "circle") {
          return (
            <g key={`${drawing.id}:${i}`} opacity={opacity}>
              <ellipse
                cx={x + w / 2}
                cy={y + h / 2}
                rx={w / 2}
                ry={h / 2}
                fill="none"
                stroke="#facc15"
                strokeWidth={14}
                opacity={0.24}
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
              />
              <ellipse
                cx={x + w / 2}
                cy={y + h / 2}
                rx={w / 2}
                ry={h / 2}
                fill="none"
                stroke="#fde047"
                strokeWidth={6}
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
              />
            </g>
          );
        }

        return (
          <g key={`${drawing.id}:${i}`} opacity={opacity}>
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              rx={18}
              fill="none"
              stroke="#facc15"
              strokeWidth={14}
              opacity={0.24}
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
            />
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              rx={18}
              fill="none"
              stroke="#fde047"
              strokeWidth={6}
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
            />
          </g>
        );
      })}
    </svg>
  );
};
