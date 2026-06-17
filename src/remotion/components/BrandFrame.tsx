import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme.js";

// Persistent brand chrome: the real GTO Central wordmark (from the webapp)
// top-centre + a thin gold progress bar.
export const BrandFrame: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress = Math.min(1, frame / Math.max(1, durationInFrames - 1));

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", top: 92, width: "100%", display: "flex", justifyContent: "center" }}>
        <Img src={staticFile("brand/gto-inline.svg")} style={{ height: 58, width: "auto" }} />
      </div>

      <div style={{ position: "absolute", bottom: 64, left: 80, right: 80, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.12)" }}>
        <div style={{ height: "100%", width: `${progress * 100}%`, borderRadius: 3, backgroundColor: theme.accent }} />
      </div>
    </AbsoluteFill>
  );
};
