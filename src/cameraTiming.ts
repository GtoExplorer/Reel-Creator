import type { CameraStep } from "./types.js";

// Pure, dependency-free (browser + node safe).

const wordCount = (s?: string) => (s ? s.trim().split(/\s+/).filter(Boolean).length : 0);

// True if this camera path drives a per-node script (some waypoint has a line).
export function hasPerNodeLines(camera: CameraStep[] = []): boolean {
  return camera.some((w) => w.line && w.line.trim().length > 0);
}

// The scene voiceover for a per-node camera = the lines joined in order.
export function voiceoverFromLines(camera: CameraStep[] = []): string {
  return camera.map((w) => (w.line ?? "").trim()).filter(Boolean).join(" ");
}

// Assign each waypoint a start time (atSec) so the camera lands on each node as
// its narration line begins — by each line's share of the total word count
// (speech rate is ~constant, so this tracks the audio without needing per-word
// alignment). No-op if there are no per-node lines.
export function timeCameraToLines(camera: CameraStep[] = [], durationSec: number): CameraStep[] {
  const counts = camera.map((w) => wordCount(w.line));
  const total = counts.reduce((s, n) => s + n, 0);
  if (!total || !durationSec) return camera;
  let cum = 0;
  return camera.map((w, i) => {
    const atSec = (cum / total) * durationSec;
    cum += counts[i];
    return { ...w, atSec };
  });
}
