import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { RenderScene } from "../../types.js";
import { theme } from "../theme.js";
import { actionColor } from "../../poker/ranges.js";

export const FreqBarsScene: React.FC<{ scene: RenderScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bars = scene.freqBars ?? [];

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ fontSize: 56, fontWeight: 800, color: theme.text, textAlign: "center", marginBottom: 80, letterSpacing: -1 }}>
        {scene.headline || scene.barValue || "Action frequencies"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 52 }}>
        {bars.map((b, i) => {
          const grow = spring({ frame, fps, delay: 6 + i * 7, config: { damping: 200 } });
          const value = interpolate(grow, [0, 1], [0, b.freq]);
          const color = actionColor(b.action);
          return (
            <div key={i}>
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
      </div>
    </div>
  );
};
