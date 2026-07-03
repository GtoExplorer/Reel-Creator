"use client";
import { useState } from "react";
import type { CameraStep, DraftScene, FlowNode } from "@/src/types";
import { hasPerNodeLines, voiceoverFromLines } from "@/src/cameraTiming";
import { FlowchartPicker } from "./FlowchartPicker";

const DEFAULT_WP: CameraStep = { cx: 0.5, cy: 0.5, zoom: 1 };

function KindBadge({ kind }: { kind: "split" | "strategy" | "edge" }) {
  const cls =
    kind === "split"
      ? "bg-accent/20 text-accent"
      : kind === "edge"
      ? "bg-sky-500/20 text-sky-300"
      : "bg-emerald-500/20 text-emerald-300";
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${cls}`}>
      {kind === "edge" ? "decision" : kind}
    </span>
  );
}

export function CameraPathEditor({
  scene,
  onChange,
  topic,
  concept,
}: {
  scene: DraftScene;
  onChange: (patch: Partial<DraftScene>) => void;
  topic: string;
  concept: string;
}) {
  const [rescripting, setRescripting] = useState(false);
  const [autoing, setAutoing] = useState(false);
  const nodes = scene.nodes ?? [];
  const camera = scene.camera ?? [];
  const perNode = hasPerNodeLines(camera);

  // Commit a new camera path. When per-node lines are in play, keep the scene
  // voiceover mirrored to the lines (in order) so it's what actually gets spoken.
  const commit = (next: CameraStep[]) => {
    const cam = next.length ? next : [DEFAULT_WP];
    const patch: Partial<DraftScene> = { camera: cam };
    if (hasPerNodeLines(cam)) patch.voiceover = voiceoverFromLines(cam);
    onChange(patch);
  };

  const addNode = (n: FlowNode) => commit([...camera, { cx: n.cx, cy: n.cy, zoom: n.kind === "edge" ? 2.2 : 1.6 }]);
  const addZoomOut = () => commit([...camera, { cx: 0.5, cy: 0.5, zoom: 1 }]);
  const updateWp = (k: number, patch: Partial<CameraStep>) => commit(camera.map((w, i) => (i === k ? { ...w, ...patch } : w)));
  const delWp = (k: number) => commit(camera.filter((_, i) => i !== k));
  const moveWp = (k: number, dir: -1 | 1) => {
    const j = k + dir;
    if (j < 0 || j >= camera.length) return;
    const next = camera.slice();
    [next[k], next[j]] = [next[j], next[k]];
    commit(next);
  };
  const nodeFor = (wp: CameraStep) => nodes.find((o) => Math.abs(o.cx - wp.cx) < 1e-3 && Math.abs(o.cy - wp.cy) < 1e-3);
  const camNodes = () =>
    camera.map((wp) => {
      const n = nodeFor(wp);
      return n
        ? { label: n.label, summary: n.summary, edge: n.edge }
        : { label: "The full decision tree", summary: "", edge: undefined };
    });

  // Generate one narration line per waypoint → camera syncs each zoom to its line.
  async function autoLines() {
    if (!camera.length) return;
    setAutoing(true);
    try {
      const r = await fetch("/api/flowchart-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, concept, nodes: camNodes() }),
      }).then((res) => res.json());
      const lines: string[] = Array.isArray(r.lines) ? r.lines : [];
      commit(camera.map((w, i) => ({ ...w, line: lines[i] ?? w.line ?? "" })));
    } catch {
      alert("Couldn't write per-node lines");
    } finally {
      setAutoing(false);
    }
  }

  // Single voiceover for the whole move (legacy even-easing): clears per-node lines.
  async function rescript() {
    setRescripting(true);
    try {
      const r = await fetch("/api/rescript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, concept, nodes: camNodes() }),
      }).then((res) => res.json());
      if (r.voiceover) onChange({ voiceover: r.voiceover, camera: camera.map((w) => ({ ...w, line: undefined })) });
    } catch {
      alert("Rescript failed");
    } finally {
      setRescripting(false);
    }
  }

  return (
    <div className="mt-2">
      <FlowchartPicker scene={scene} onAddNode={addNode} onAddZoomOut={addZoomOut} />

      <div className="label">Camera path — {camera.length} stop{camera.length === 1 ? "" : "s"}, played in order</div>
      <p className="mb-2 text-[11px] text-muted">
        Give each stop a line to <b className="text-text">sync its zoom to when it's spoken</b>. Leave lines empty to use one
        voiceover that eases across the whole move.
      </p>

      <div className="flex flex-col gap-2.5">
        {camera.map((wp, k) => {
          const n = nodeFor(wp);
          return (
            <div key={k} className="rounded-lg border border-line p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-4 text-sm text-muted">{k + 1}.</span>
                <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
                  {n?.edge && n.kind !== "edge" && (
                    <span className="shrink-0 rounded bg-line px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted">
                      via {n.edge}
                    </span>
                  )}
                  <span className="truncate">{n ? n.label : "Full tree (zoom out)"}</span>
                  {n?.kind && <KindBadge kind={n.kind} />}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <button className="btn-ghost btn-mini" disabled={k === 0} onClick={() => moveWp(k, -1)}>
                    ↑
                  </button>
                  <button className="btn-ghost btn-mini" disabled={k === camera.length - 1} onClick={() => moveWp(k, 1)}>
                    ↓
                  </button>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-sm text-muted">
                  zoom
                  <input type="range" min={1} max={10} step={0.1} value={wp.zoom} onChange={(e) => updateWp(k, { zoom: +e.target.value })} />
                  <b className="text-text">{wp.zoom.toFixed(1)}x</b>
                </span>
                <button className="btn-ghost btn-mini shrink-0" onClick={() => delWp(k)}>
                  ✕
                </button>
              </div>
              <textarea
                className="input mt-1.5"
                rows={2}
                placeholder="Line spoken while on this node (optional)…"
                value={wp.line ?? ""}
                onChange={(e) => updateWp(k, { line: e.target.value })}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button className="btn-ghost btn-mini" onClick={addZoomOut}>
          + Full tree stop (zoom out)
        </button>
        <button className="btn-ghost btn-mini" onClick={autoLines} disabled={autoing}>
          {autoing ? "Writing…" : "✨ Auto-write per-node lines"}
        </button>
        <button className="btn-ghost btn-mini" onClick={rescript} disabled={rescripting}>
          {rescripting ? "Writing…" : "↻ One voiceover (even pan)"}
        </button>
      </div>
      {perNode && (
        <p className="mt-1 text-[11px] text-muted">
          Per-node mode on — the scene voiceover is built from these lines and each zoom is timed to its line.
        </p>
      )}
    </div>
  );
}
