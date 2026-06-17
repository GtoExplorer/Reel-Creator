import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { RenderScene } from "../../types.js";
import { theme } from "../theme.js";

const center: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  textAlign: "center",
};

export const HookScene: React.FC<{ scene: RenderScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame, fps, config: { damping: 200 } });
  const y = interpolate(rise, [0, 1], [40, 0]);
  const barW = interpolate(spring({ frame: frame - 8, fps, config: { damping: 200 } }), [0, 1], [0, 220]);

  return (
    <div style={center}>
      <div style={{ transform: `translateY(${y}px)`, opacity: rise }}>
        {scene.subtext ? (
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: 8, textTransform: "uppercase", color: theme.accent, marginBottom: 30 }}>
            {scene.subtext}
          </div>
        ) : null}
        <div style={{ fontSize: 118, fontWeight: 900, color: theme.text, lineHeight: 1.02, letterSpacing: -2 }}>
          {scene.headline}
        </div>
        <div style={{ width: barW, height: 10, borderRadius: 5, backgroundColor: theme.accent, margin: "44px auto 0" }} />
      </div>
    </div>
  );
};
