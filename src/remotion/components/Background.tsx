import React from "react";
import { AbsoluteFill } from "remotion";
import { theme } from "../theme.js";

// Persistent, subtle backdrop: deep base, an off-centre accent glow, and a faint
// dot grid for texture. Stays stable across scenes so content reads as the thing
// that moves.
export const Background: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(1100px 1100px at 50% 18%, ${theme.bgGlow}, rgba(0,0,0,0) 60%)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.05) 1.5px, transparent 1.5px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(circle at 50% 40%, black 35%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(circle at 50% 40%, black 35%, transparent 75%)",
        }}
      />
    </AbsoluteFill>
  );
};
