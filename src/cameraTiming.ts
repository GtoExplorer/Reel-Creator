import type { CameraStep, WordTimestamp } from "./types.js";
import { alignReferenceTokens } from "./wordAlign.js";
import { stripAnimationTags } from "./drawingAnimations.js";

// True if this camera path drives a per-node script (some waypoint has a line).
export function hasPerNodeLines(camera: CameraStep[] = []): boolean {
  return camera.some((w) => w.line && w.line.trim().length > 0);
}

// The scene voiceover for a per-node camera = the lines joined in order.
export function voiceoverFromLines(camera: CameraStep[] = []): string {
  return camera.map((w) => (w.line ?? "").trim()).filter(Boolean).join(" ");
}

// Assign each waypoint a start time (atSec) so the camera lands on each node as
// its narration line begins. Uses the same forced-alignment `words` timestamps
// that drawing-tag overlays are timed to (resolveDrawingTimings), so the pan
// lands on the real word rather than an estimate — speech rate is never quite
// constant (punctuation pauses, longer poker terms), so a word-count share of
// the total duration drifts further out of sync with every waypoint. Falls
// back to a char-proportional estimate only when there's no alignment yet
// (e.g. the silent draft preview before voicing).
export function timeCameraToLines(camera: CameraStep[] = [], words: WordTimestamp[] = [], durationSec = 0): CameraStep[] {
  // `words` is aligned against the tag-stripped voiceover (stages.ts strips <a1>
  // markers before synthesizing), so offsets here must be computed on the same
  // stripped text or they'll drift whenever a line carries a drawing tag.
  const cleanLines = camera.map((w) => stripAnimationTags((w.line ?? "").trim()).trim());

  const lineStarts: (number | null)[] = [];
  let charCursor = 0;
  let seenFirst = false;
  for (const line of cleanLines) {
    if (!line) {
      lineStarts.push(null);
      continue;
    }
    if (seenFirst) charCursor += 1; // the joining space in voiceoverFromLines
    lineStarts.push(charCursor);
    charCursor += line.length;
    seenFirst = true;
  }
  const totalChars = charCursor;
  if (!totalChars || !durationSec) return camera;

  const fullText = cleanLines.filter(Boolean).join(" ");
  const matches = words.length ? alignReferenceTokens(fullText, words) : [];

  let lastAtSec = 0;
  return camera.map((w, i) => {
    const startChar = lineStarts[i];
    if (startChar == null) return { ...w, atSec: lastAtSec };

    const firstToken = matches.find((m) => m.token.start >= startChar);
    const atSec = firstToken ? words[firstToken.wordIndex]?.start ?? lastAtSec : (startChar / totalChars) * durationSec;
    lastAtSec = atSec;
    return { ...w, atSec };
  });
}
