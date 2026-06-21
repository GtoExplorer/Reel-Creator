import React from "react";
import { Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { CameraStep, FlowNode, FlowchartLayout, RenderScene } from "../../types.js";
import { theme } from "../theme.js";
import { FlowchartView } from "../../flowchart/FlowchartView.js";

type CameraSample = CameraStep & { activeIndex: number };

const smoothstep = (f: number) => f * f * (3 - 2 * f);
const lerp = (a: CameraStep, b: CameraStep, f: number): CameraStep => ({
  cx: a.cx + (b.cx - a.cx) * f,
  cy: a.cy + (b.cy - a.cy) * f,
  zoom: a.zoom + (b.zoom - a.zoom) * f,
});
const withActive = (step: CameraStep, activeIndex: number): CameraSample => ({ ...step, activeIndex });

const GLIDE_SEC = 0.7; // time to ease into each node when its line begins
const WAYPOINT_EPS = 1e-3;

// Samples the camera at time `tSec` (scene total = totalSec).
//   - If waypoints carry `atSec` (per-node script), the camera holds on each node
//     and glides to the next as its narration line begins.
//   - Otherwise it eases evenly across the whole scene (legacy behaviour).
function sampleCamera(cam: CameraStep[], tSec: number, totalSec: number): CameraSample {
  if (cam.length === 0) return withActive({ cx: 0.5, cy: 0.5, zoom: 1 }, -1);
  if (cam.length === 1) return withActive(cam[0], 0);

  if (cam.some((c) => typeof c.atSec === "number")) {
    let k = 0;
    for (let i = 0; i < cam.length; i++) if ((cam[i].atSec ?? 0) <= tSec) k = i;
    const cur = cam[k];
    const prev = cam[k - 1] ?? cur;
    const start = cur.atSec ?? 0;
    const f = smoothstep(Math.min(1, Math.max(0, (tSec - start) / GLIDE_SEC)));
    return withActive(lerp(prev, cur, f), k);
  }

  const t = totalSec > 0 ? tSec / totalSec : 0;
  const seg = t * (cam.length - 1);
  const i = Math.min(cam.length - 2, Math.floor(seg));
  const activeIndex = seg <= 0 ? 0 : i + 1;
  return withActive(lerp(cam[i], cam[i + 1], smoothstep(seg - i)), activeIndex);
}

function edgeKey(layout: FlowchartLayout, index: number): string {
  const e = layout.edges[index];
  return e.id ?? (e.source && e.target ? `edge-${e.source}-${e.target}` : `edge-${index}`);
}

function nodeForWaypoint(nodes: FlowNode[] | undefined, wp: CameraStep | undefined): FlowNode | undefined {
  if (!wp) return undefined;
  return nodes?.find((n) => Math.abs(n.cx - wp.cx) < WAYPOINT_EPS && Math.abs(n.cy - wp.cy) < WAYPOINT_EPS);
}

function layoutNodeIdForFlowNode(layout: FlowchartLayout, node: FlowNode): string | undefined {
  if (node.id && layout.nodes.some((n) => n.id === node.id)) return node.id;
  return layout.nodes.find((n) => {
    const cx = (n.x + n.w / 2) / layout.width;
    const cy = (n.y + n.h / 2) / layout.height;
    return Math.abs(cx - node.cx) < WAYPOINT_EPS && Math.abs(cy - node.cy) < WAYPOINT_EPS;
  })?.id;
}

function edgeForFlowNode(layout: FlowchartLayout, node: FlowNode) {
  const bySourceTarget = node.source && node.target
    ? layout.edges.findIndex((e) => e.source === node.source && e.target === node.target)
    : -1;
  if (bySourceTarget >= 0) {
    const edge = layout.edges[bySourceTarget];
    return { id: edgeKey(layout, bySourceTarget), source: edge.source, target: edge.target };
  }

  const byId = node.id ? layout.edges.findIndex((_, i) => edgeKey(layout, i) === node.id) : -1;
  if (byId >= 0) {
    const edge = layout.edges[byId];
    return { id: edgeKey(layout, byId), source: edge.source, target: edge.target };
  }

  const byLabel = layout.edges.findIndex((e) => {
    if (!e.label || e.label !== node.edge) return false;
    return Math.abs(e.labelX / layout.width - node.cx) < WAYPOINT_EPS && Math.abs(e.labelY / layout.height - node.cy) < WAYPOINT_EPS;
  });
  if (byLabel >= 0) {
    const edge = layout.edges[byLabel];
    return { id: edgeKey(layout, byLabel), source: edge.source, target: edge.target };
  }

  return undefined;
}

function highlightedRouteEdges(layout: FlowchartLayout, node: FlowNode | undefined): string[] {
  if (!node) return [];

  const highlighted = new Set<string>();
  const parentByTarget = new Map<string, { id: string; source: string; target: string }>();
  layout.edges.forEach((edge, i) => {
    if (edge.source && edge.target) parentByTarget.set(edge.target, { id: edgeKey(layout, i), source: edge.source, target: edge.target });
  });

  let cursor: string | undefined;
  if (node.kind === "edge") {
    const edge = edgeForFlowNode(layout, node);
    if (edge?.id) highlighted.add(edge.id);
    cursor = edge?.source;
  } else {
    cursor = layoutNodeIdForFlowNode(layout, node);
  }

  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const parent = parentByTarget.get(cursor);
    if (!parent) break;
    highlighted.add(parent.id);
    cursor = parent.source;
  }

  return [...highlighted];
}

// Displays the native flowchart and flies a camera through node waypoints.
// Falls back to the legacy captured image shape if an old draft is loaded.
export const CaptureScene: React.FC<{ scene: RenderScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const cam = scene.camera?.length
    ? scene.camera
    : [{ cx: 0.5, cy: 0.5, zoom: 1 }, { cx: 0.5, cy: 0.5, zoom: scene.zoom ?? 1.2 }];
  const cameraSample = sampleCamera(cam, frame / fps, durationInFrames / fps);
  const { cx, cy, zoom } = cameraSample;
  const activeWaypoint = cameraSample.activeIndex >= 0 ? cam[Math.min(cameraSample.activeIndex, cam.length - 1)] : undefined;
  const activeNode = nodeForWaypoint(scene.nodes, activeWaypoint);
  const highlightedEdges = scene.flowchart ? highlightedRouteEdges(scene.flowchart, activeNode) : [];
  const aspect = scene.flowchart
    ? `${scene.flowchart.width} / ${scene.flowchart.height}`
    : `${scene.imageW ?? 780} / ${scene.imageH ?? 1198}`;
  // Camera pan/zoom applied to whichever fills the frame (flowchart or image).
  const camStyle = {
    position: "absolute" as const,
    inset: 0,
    width: "100%",
    height: "100%",
    transform: `translate(${(0.5 - cx) * 100}%, ${(0.5 - cy) * 100}%) scale(${zoom})`,
    transformOrigin: `${cx * 100}% ${cy * 100}%`,
  };

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
          {scene.flowchart ? (
            <FlowchartView layout={scene.flowchart} highlightedEdges={highlightedEdges} camera={{ cx, cy, zoom }} />
          ) : scene.image ? (
            <Img src={staticFile(scene.image)} style={{ ...camStyle, objectFit: "cover" }} />
          ) : (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: theme.muted, fontSize: 34, fontWeight: 600, textAlign: "center", padding: 60 }}>
              Captured view goes here
              <br />
              (create a draft with a load ID)
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
