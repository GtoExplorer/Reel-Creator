"use client";
import { useEffect, useMemo, useState } from "react";
import type { CameraStep, DraftScene, FlowNode } from "@/src/types";
import { FlowchartCanvas } from "./FlowchartCanvas";
import { hasPerNodeLines, voiceoverFromLines } from "@/src/cameraTiming";
import { remapCamera } from "@/lib/scenes";
import { defaultTreePropertySelection, prettyProperty, treePropertyGroups } from "@/lib/properties";

// Dashboard-style tree editor: click a leaf node to expand it into a deeper
// subtree (fetched with the chosen depth/properties, conditioned on the node's
// branch path), click an expanded node to collapse it. The server round-trips
// the raw tree (scene.tree) and returns a fresh layout each edit.

const DEFAULT_CAMERA: CameraStep[] = [
  { cx: 0.5, cy: 0.5, zoom: 1 },
  { cx: 0.5, cy: 0.5, zoom: 1.2 },
];

// Client-side view of the raw tree — just enough to know what's expanded.
type TreeNode = { node_id: number; children?: { to_node_id: number }[] };

export function FlowchartTreeEditor({
  scene,
  defaultLoadId,
  street,
  onChange,
}: {
  scene: DraftScene;
  defaultLoadId?: number;
  street?: string;
  onChange: (patch: Partial<DraftScene>) => void;
}) {
  const loadId = scene.loadId ?? defaultLoadId;
  const effectiveStreet = scene.street ?? street;
  const direction = scene.flowchart?.direction ?? "TB";
  const tree = (scene.tree as TreeNode[] | undefined) ?? null;
  const nodes = useMemo(() => (scene.nodes ?? []).filter((n) => n.kind !== "edge"), [scene.nodes]);

  const [leafs, setLeafs] = useState<number | string>(scene.treeLeafs ?? 7);
  const [properties, setProperties] = useState<string[]>(
    () => scene.treeProperties ?? defaultTreePropertySelection(effectiveStreet)
  );
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setProperties(defaultTreePropertySelection(effectiveStreet));
  }, [effectiveStreet]);

  useEffect(() => {
    fetch("/api/properties")
      .then((r) => r.json())
      .then((j) => j && typeof j === "object" && setLabels(j))
      .catch(() => {});
  }, []);

  const groups = treePropertyGroups(effectiveStreet);
  const labelFor = (p: string) => labels[p] || prettyProperty(p);
  const expanded = useMemo(
    () => new Set((tree ?? []).filter((n) => n.children?.length).map((n) => String(n.node_id))),
    [tree]
  );

  const depthValue = () => Number(leafs) || 5;

  // Apply a tree change: swap in the new tree/layout/nodes, carry surviving
  // camera stops to their nodes' new positions, and persist the depth/property
  // choices with the scene.
  function commitTree(r: { tree: unknown[]; flowchart: DraftScene["flowchart"]; nodes: FlowNode[] }, resetCamera = false) {
    const camera = resetCamera ? DEFAULT_CAMERA : remapCamera(scene.camera ?? [], scene.nodes ?? [], r.nodes);
    const patch: Partial<DraftScene> = {
      tree: r.tree,
      flowchart: r.flowchart,
      nodes: r.nodes,
      camera: camera.length ? camera : DEFAULT_CAMERA,
      treeLeafs: depthValue(),
      treeProperties: properties,
    };
    if (hasPerNodeLines(patch.camera)) patch.voiceover = voiceoverFromLines(patch.camera!);
    onChange(patch);
  }

  async function toggleNode(n: FlowNode) {
    if (!tree || busy || !n.id) return;
    const isExpanded = expanded.has(n.id);
    if (!isExpanded && !loadId) {
      alert("Set a load ID first (Camera & settings tab)");
      return;
    }
    setBusy(true);
    try {
      const body = isExpanded
        ? { op: "collapse", tree, nodeId: Number(n.id), direction }
        : {
            op: "expand",
            tree,
            nodeId: Number(n.id),
            loadId,
            street: effectiveStreet,
            leafs: depthValue(),
            properties,
            filters: scene.filters ?? [],
            direction,
          };
      const r = await fetch("/api/flowchart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((res) => res.json());
      if (r.flowchart && r.nodes && r.tree) commitTree(r);
      else alert(r.error || "Tree update failed");
    } catch {
      alert("Tree update failed");
    } finally {
      setBusy(false);
    }
  }

  async function rebuild() {
    if (!loadId) {
      alert("Set a load ID first (Camera & settings tab)");
      return;
    }
    setBusy(true);
    try {
      const propParam = properties.length ? `&properties=${encodeURIComponent(properties.join(","))}` : "";
      const filtersParam = encodeURIComponent(JSON.stringify(scene.filters ?? []));
      const r = await fetch(
        `/api/flowchart?loadId=${loadId}&direction=${direction}&leafs=${depthValue()}${propParam}&filters=${filtersParam}`
      ).then((res) => res.json());
      if (r.flowchart && r.nodes && r.tree) {
        onChange({ street: r.street });
        commitTree(r, true);
      }
      else alert(r.error || "No flowchart for that load/depth/properties");
    } catch {
      alert("Flowchart fetch failed");
    } finally {
      setBusy(false);
    }
  }

  function toggleProperty(p: string) {
    setProperties((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));
  }

  function setGroup(categories: string[], on: boolean) {
    setProperties((cur) => {
      const rest = cur.filter((p) => !categories.includes(p));
      return on ? [...rest, ...categories] : rest;
    });
  }

  return (
    <div className="mt-3 rounded-lg border border-line p-2.5">
      <div className="mb-2 flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="label">Depth (leafs)</span>
          <input
            type="number"
            min={1}
            className="input !w-20"
            value={leafs}
            onChange={(e) => {
              const v = e.target.value;
              setLeafs(/^[1-9]\d*$/.test(v) ? Number(v) : "");
            }}
          />
        </label>
        <div className="flex-1" />
        <button className="btn-ghost btn-mini mb-0.5" disabled={busy} onClick={rebuild}>
          {busy ? "Working..." : "Rebuild tree"}
        </button>
      </div>

      <div className="label">Split properties ({properties.length} selected)</div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {groups.map((g) => {
          const onCount = g.categories.filter((c) => properties.includes(c)).length;
          return (
            <details key={g.label} className="relative">
              <summary className="btn-ghost btn-mini cursor-pointer list-none select-none">
                {g.label} {onCount}/{g.categories.length}
              </summary>
              <div className="absolute left-0 top-full z-30 mt-1 max-h-56 w-60 overflow-auto rounded-lg border border-line bg-elevated p-2 shadow-xl">
                <div className="mb-1 flex gap-1">
                  <button className="btn-ghost btn-mini" onClick={() => setGroup(g.categories, true)}>
                    All
                  </button>
                  <button className="btn-ghost btn-mini" onClick={() => setGroup(g.categories, false)}>
                    None
                  </button>
                </div>
                {g.categories.map((c) => (
                  <label key={c} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-black/30">
                    <input type="checkbox" checked={properties.includes(c)} onChange={() => toggleProperty(c)} />
                    {labelFor(c)}
                  </label>
                ))}
              </div>
            </details>
          );
        })}
      </div>

      {!scene.flowchart || !tree ? (
        <div className="rounded-lg border border-line bg-black/40 p-4 text-center text-xs text-muted">
          {scene.flowchart
            ? "This draft predates tree editing — rebuild the tree once to enable expanding/collapsing nodes."
            : "No tree yet — set a load ID in Camera & settings, then rebuild."}
          <div className="mt-2">
            <button className="btn-ghost btn-mini" disabled={busy || !loadId} onClick={rebuild}>
              {busy ? "Working..." : "Rebuild tree"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-1 text-[11px] text-muted">
            Click <span className="text-accent">+</span> to expand a node into a deeper subtree (uses the depth +
            properties above) · <span className="text-accent">−</span> to collapse it. Camera stops follow surviving
            nodes.
          </div>
          <div className="relative">
            <FlowchartCanvas
              layout={scene.flowchart}
              overlay={nodes.map((n) => {
                const isExpanded = n.id ? expanded.has(n.id) : false;
                const ring = n.kind === "split" ? "border-accent text-accent" : "border-emerald-400 text-emerald-300";
                return (
                  <button
                    key={n.id}
                    onClick={() => toggleNode(n)}
                    disabled={busy}
                    title={`${isExpanded ? "Collapse" : "Expand"} — ${n.label}`}
                    style={{ left: `${n.cx * 100}%`, top: `${n.cy * 100}%` }}
                    className={`absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-sm font-bold shadow transition hover:z-20 hover:scale-125 ${
                      isExpanded ? "bg-black/70 border-rose-400 text-rose-300" : `bg-black/70 ${ring}`
                    }`}
                  >
                    {isExpanded ? "−" : "+"}
                  </button>
                );
              })}
            />
            {busy && (
              <div className="absolute inset-0 z-30 flex items-center justify-center rounded-lg bg-black/60 text-xs text-muted">
                Updating tree...
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
