import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { WordTimestamp } from "../../types.js";
import { theme, SAFE } from "../theme.js";

const CHUNK = 3;
const CAPTION_BOTTOM = SAFE.bottom - 170;

function captionFontSize(words: WordTimestamp[]): number {
  const chars = words.map((w) => w.word).join(" ").length;
  if (chars <= 18) return 64;
  if (chars <= 26) return 58;
  if (chars <= 34) return 50;
  return 44;
}

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
  const fontSize = captionFontSize(chunk);

  return (
    <div
      style={{
        position: "absolute",
        bottom: CAPTION_BOTTOM,
        left: SAFE.side,
        right: SAFE.side,
        display: "flex",
        flexWrap: "nowrap",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        height: 104,
        whiteSpace: "nowrap",
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
              fontSize,
              fontWeight: 900,
              lineHeight: 1.08,
              letterSpacing: 0,
              transform: `scale(${scale})`,
              transformOrigin: "center",
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
