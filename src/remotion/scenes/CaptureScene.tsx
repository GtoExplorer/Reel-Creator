import React from "react";
import { Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { RenderScene, CameraStep } from "../../types.js";
import { theme } from "../theme.js";

const smoothstep = (f: number) => f * f * (3 - 2 * f);
const lerp = (a: CameraStep, b: CameraStep, f: number): CameraStep => ({
  cx: a.cx + (b.cx - a.cx) * f,
  cy: a.cy + (b.cy - a.cy) * f,
  zoom: a.zoom + (b.zoom - a.zoom) * f,
});

const GLIDE_SEC = 0.7; // time to ease into each node when its line begins

// Samples the camera at time `tSec` (scene total = totalSec).
//   - If waypoints carry `atSec` (per-node script), the camera holds on each node
//     and glides to the next as its narration line begins.
//   - Otherwise it eases evenly across the whole scene (legacy behaviour).
function sampleCamera(cam: CameraStep[], tSec: number, totalSec: number): CameraStep {
  if (cam.length === 0) return { cx: 0.5, cy: 0.5, zoom: 1 };
  if (cam.length === 1) return cam[0];

  if (cam.some((c) => typeof c.atSec === "number")) {
    let k = 0;
    for (let i = 0; i < cam.length; i++) if ((cam[i].atSec ?? 0) <= tSec) k = i;
    const cur = cam[k];
    const prev = cam[k - 1] ?? cur;
    const start = cur.atSec ?? 0;
    const f = smoothstep(Math.min(1, Math.max(0, (tSec - start) / GLIDE_SEC)));
    return lerp(prev, cur, f);
  }

  const t = totalSec > 0 ? tSec / totalSec : 0;
  const seg = t * (cam.length - 1);
  const i = Math.min(cam.length - 2, Math.floor(seg));
  return lerp(cam[i], cam[i + 1], smoothstep(seg - i));
}

// Displays the captured flowchart and flies a camera through node waypoints
// (centre on each node, zoom in/out). Falls back to a label if no capture.
export const CaptureScene: React.FC<{ scene: RenderScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const cam = scene.camera?.length
    ? scene.camera
    : [{ cx: 0.5, cy: 0.5, zoom: 1 }, { cx: 0.5, cy: 0.5, zoom: scene.zoom ?? 1.2 }];
  const { cx, cy, zoom } = sampleCamera(cam, frame / fps, durationInFrames / fps);
  const aspect = `${scene.imageW ?? 780} / ${scene.imageH ?? 1198}`;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ fontSize: 52, fontWeight: 800, color: theme.text, textAlign: "center", marginBottom: 28, letterSpacing: -1 }}>
        {scene.headline || "Live on GTOCentral"}
      </div>
      <div style={{ flex: 1, display: "flex", justifyContent: "center", minHeight: 0 }}>
        <div
          style={{
            height: "100%",
            aspectRatio: aspect,
            maxWidth: "100%",
            borderRadius: 24,
            overflow: "hidden",
            border: `1px solid ${theme.surfaceBorder}`,
            backgroundColor: "#0e0f10",
            position: "relative",
          }}
        >
          {scene.image ? (
            <Img
              src={staticFile(scene.image)}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                transform: `translate(${(0.5 - cx) * 100}%, ${(0.5 - cy) * 100}%) scale(${zoom})`,
                transformOrigin: `${cx * 100}% ${cy * 100}%`,
              }}
            />
          ) : (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: theme.muted, fontSize: 34, fontWeight: 600, textAlign: "center", padding: 60 }}>
              Captured view goes here
              <br />
              (run with the Explorer dev server)
            </div>
          )}
        </div>
      </div>
      {scene.subtext ? (
        <div style={{ marginTop: 26, textAlign: "center", fontSize: 32, fontWeight: 600, color: theme.muted }}>
          {scene.subtext}
        </div>
      ) : null}
    </div>
  );
};
