import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { WordTimestamp } from "../../types.js";
import { theme, SAFE } from "../theme.js";

const CHUNK = 3;

function chunkWords(words: WordTimestamp[]): WordTimestamp[][] {
  const out: WordTimestamp[][] = [];
  for (let i = 0; i < words.length; i += CHUNK) out.push(words.slice(i, i + CHUNK));
  return out;
}

// Karaoke captions: shows ~3 words at a time, the active word pops + highlights.
// Sits in the Instagram-safe band above the bottom UI.
export const Captions: React.FC<{ words: WordTimestamp[] }> = ({ words }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (!words.length) return null;

  const chunks = chunkWords(words);
  let active = chunks.findIndex((c) => t >= c[0].start && t < c[c.length - 1].end);
  if (active === -1) {
    active = chunks.filter((c) => c[0].start <= t).length - 1;
    if (active < 0) active = 0;
  }
  const chunk = chunks[active];

  return (
    <div
      style={{
        position: "absolute",
        bottom: SAFE.bottom - 120,
        left: SAFE.side,
        right: SAFE.side,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "10px 16px",
      }}
    >
      {chunk.map((w, i) => {
        const isActive = t >= w.start && t < w.end;
        const startFrame = w.start * fps;
        const pop = spring({ frame: frame - startFrame, fps, config: { damping: 12, mass: 0.5 }, durationInFrames: 12 });
        const scale = isActive ? 1 + 0.12 * pop : 1;
        return (
          <span
            key={i}
            style={{
              fontSize: 64,
              fontWeight: 900,
              lineHeight: 1.08,
              letterSpacing: -1,
              transform: `scale(${scale})`,
              color: isActive ? theme.bg : theme.text,
              backgroundColor: isActive ? theme.accent : "transparent",
              padding: isActive ? "2px 16px" : "2px 0",
              borderRadius: 14,
              textShadow: isActive ? "none" : "0 3px 14px rgba(0,0,0,0.7)",
              textTransform: "uppercase",
            }}
          >
            {w.word}
          </span>
        );
      })}
    </div>
  );
};
