"use client";
import type { DraftScene, FlowNode } from "@/src/types";

// Renders the captured flowchart image with a clickable marker on every node, so
// the camera path is built by clicking the actual nodes (not guessing from names).
export function FlowchartPicker({
  scene,
  onAddNode,
  onAddZoomOut,
}: {
  scene: DraftScene;
  onAddNode: (n: FlowNode) => void;
  onAddZoomOut: () => void;
}) {
  if (!scene.image) return null;
  const nodes = scene.nodes ?? [];
  const camera = scene.camera ?? [];

  // The 1-based camera positions (if any) that target this node.
  const orderOf = (n: FlowNode) =>
    camera
      .map((wp, i) => (Math.abs(wp.cx - n.cx) < 1e-3 && Math.abs(wp.cy - n.cy) < 1e-3 ? i + 1 : 0))
      .filter(Boolean);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="label !mb-0">Click a node to add a camera stop</span>
        <button className="btn-ghost btn-mini" onClick={onAddZoomOut}>
          + Full tree (zoom out)
        </button>
      </div>
      <div className="max-h-[440px] overflow-auto rounded-lg border border-line bg-black">
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/${scene.image}`} alt="flowchart" draggable={false} className="block w-full select-none" />
          <div className="absolute inset-0">
            {nodes.map((n, i) => {
              const ord = orderOf(n);
              const inPath = ord.length > 0;
              const ring =
                n.kind === "split"
                  ? "border-accent text-accent"
                  : n.kind === "edge"
                  ? "border-sky-400 text-sky-300"
                  : "border-emerald-400 text-emerald-300";
              const kindColor =
                n.kind === "split" ? "text-accent" : n.kind === "edge" ? "text-sky-300" : "text-emerald-300";
              return (
                <button
                  key={i}
                  onClick={() => onAddNode(n)}
                  title={`${n.label}${n.kind ? ` · ${n.kind}` : ""}`}
                  style={{ left: `${n.cx * 100}%`, top: `${n.cy * 100}%` }}
                  className={`group absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center border-2 text-[10px] font-bold shadow transition hover:z-20 hover:scale-125 ${
                    n.kind === "edge" ? "h-5 w-5 rotate-45" : "h-6 w-6 rounded-full"
                  } ${inPath ? "border-white bg-accent text-black" : `bg-black/70 ${ring}`}`}
                >
                  <span className={n.kind === "edge" ? "-rotate-45" : ""}>{inPath ? ord.join(",") : ""}</span>
                  <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-black/95 px-2 py-1 text-[11px] font-normal text-white group-hover:block">
                    <span className={kindColor}>{n.kind === "edge" ? "decision" : n.kind ?? "node"}</span>
                    {n.kind !== "edge" && n.edge ? ` · via ${n.edge}` : ""}
                    {" — "}
                    {n.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-accent" /> split (feature)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-emerald-400" /> strategy (action mix)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rotate-45 border-2 border-sky-400" /> decision (edge)
        </span>
      </div>
    </div>
  );
}
