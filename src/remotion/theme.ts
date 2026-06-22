import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont("normal", { weights: ["400", "600", "700", "800", "900"] });

// Brand tokens mirrored from the Next.js app (gto-central-next/app/globals.css).
// Keep these in sync with the webapp so reels match the product exactly.
export const theme = {
  bg: "#18191a", // --color-background
  bgGlow: "rgba(208,171,29,0.12)", // subtle gold hero glow (12% accent)
  surface: "#242526", // --color-surface (strategy nodes)
  surface2: "#333443", // --color-surface-2 (split nodes)
  surfaceBorder: "#292929", // --color-line
  text: "#ededed", // --color-foreground
  muted: "#a3a3a3", // --color-muted
  muted2: "#858585", // --color-muted-2
  accent: "#d0ab1d", // --color-accent (gold)
  accentDeep: "#e0bc2e", // --color-accent-hover
  // Matches the webapp's RangeMatrix palette (lib/poker.ts actionColor): fold
  // indigo, check/call green, bet/raise red (these are representative shades —
  // the bars colour each segment by exact size via actionColor()).
  action: {
    raise: "#c0291f",
    bet: "#e35a4d",
    call: "#47ba45",
    check: "#47ba45",
    fold: "#4646e1",
  },
  font: fontFamily,
};

// Instagram Reels UI overlays the edges. Keep meaningful content inside these.
export const SAFE = {
  top: 320,
  bottom: 470,
  side: 80,
  rightRail: 150,
};
