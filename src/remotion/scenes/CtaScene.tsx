import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { RenderScene } from "../../types.js";
import { theme } from "../theme.js";

export const CtaScene: React.FC<{ scene: RenderScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14, mass: 0.6 } });
  const scale = interpolate(pop, [0, 1], [0.82, 1]);
  const btn = spring({ frame: frame - 12, fps, config: { damping: 12, mass: 0.5 } });

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
      <div style={{ transform: `scale(${scale})`, opacity: pop }}>
        <div style={{ fontSize: 92, fontWeight: 900, color: theme.text, lineHeight: 1.06, letterSpacing: -2 }}>
          {scene.headline || "See the full solution"}
        </div>
        {scene.subtext ? (
          <div style={{ fontSize: 46, fontWeight: 600, color: theme.muted, marginTop: 28 }}>{scene.subtext}</div>
        ) : null}
      </div>
      <div
        style={{
          marginTop: 72,
          transform: `scale(${interpolate(btn, [0, 1], [0.6, 1])})`,
          opacity: btn,
          padding: "32px 64px",
          borderRadius: 999,
          backgroundColor: theme.accent,
          color: theme.bg,
          fontSize: 56,
          fontWeight: 900,
          letterSpacing: -1,
          boxShadow: `0 0 60px ${theme.accent}55`,
        }}
      >
        gtocentral.com
      </div>
    </div>
  );
};
