"use client";
import { useEffect, useState } from "react";
import type { DraftManifest, DraftScene, SceneType } from "@/src/types";
import { SceneCard } from "./SceneCard";

const TYPES: { type: SceneType; label: string; description: string }[] = [
  { type: "hook", label: "Hook", description: "Stop the scroll" },
  { type: "preflopMatrix", label: "Range", description: "Show a preflop range" },
  { type: "flowchart", label: "Decision tree", description: "Explain a strategy path" },
  { type: "barCharts", label: "Comparison", description: "Compare strategy groups" },
  { type: "freqBars", label: "Frequencies", description: "Focus on one category" },
  { type: "cta", label: "Call to action", description: "Close the reel" },
];
const LABELS = Object.fromEntries(TYPES.map((item) => [item.type, item.label])) as Record<SceneType, string>;

export function SceneList({ draft, topic, concept, clips, onSceneChange, onMove, onDelete, onAdd, onClip }: {
  draft: DraftManifest; topic: string; concept: string; clips: (string | null)[];
  onSceneChange: (i: number, patch: Partial<DraftScene>) => void;
  onMove: (i: number, dir: -1 | 1) => void; onDelete: (i: number) => void;
  onAdd: (t: SceneType) => void; onClip: (i: number, path: string) => void;
}) {
  const [selected, setSelected] = useState(0);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    if (selected >= draft.scenes.length) setSelected(Math.max(0, draft.scenes.length - 1));
  }, [draft.scenes.length, selected]);
  const scene = draft.scenes[selected];
  const add = (type: SceneType) => {
    setSelected(draft.scenes.length);
    onAdd(type);
    setAdding(false);
  };

  return (
    <div className="grid min-h-[680px] grid-cols-1 overflow-hidden rounded-2xl border border-line bg-surface xl:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="border-b border-line bg-[#1d1e20] p-3 xl:border-b-0 xl:border-r">
        <div className="mb-3 flex items-center justify-between px-1">
          <div><div className="text-sm font-semibold">Scenes</div><div className="text-[11px] text-muted">{draft.scenes.length} in this reel</div></div>
          <button className="creator-icon-button" title="Add scene" onClick={() => setAdding((v) => !v)}>+</button>
        </div>
        {adding && <div className="mb-3 rounded-xl border border-line bg-elevated p-2 shadow-xl">
          <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted">Add a scene</div>
          {TYPES.map((item) => <button key={item.type} className="w-full rounded-lg px-2 py-2 text-left hover:bg-white/5" onClick={() => add(item.type)}>
            <div className="text-xs font-semibold">{item.label}</div><div className="text-[10px] text-muted">{item.description}</div>
          </button>)}
        </div>}
        <div className="flex gap-2 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible">
          {draft.scenes.map((item, i) => <button key={`${item.type}-${i}`} onClick={() => setSelected(i)}
            className={`group min-w-[172px] rounded-xl border p-2.5 text-left transition xl:min-w-0 ${selected === i ? "border-accent/60 bg-accent/10 shadow-[inset_3px_0_0_#d0ab1d]" : "border-transparent hover:border-line hover:bg-white/[0.03]"}`}>
            <div className="flex items-start gap-2.5">
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${selected === i ? "bg-accent text-black" : "bg-elevated text-muted"}`}>{i + 1}</span>
              <span className="min-w-0"><span className="block text-xs font-semibold">{LABELS[item.type]}</span><span className="mt-0.5 block truncate text-[10px] text-muted">{item.headline || "Untitled scene"}</span></span>
            </div>
          </button>)}
        </div>
      </aside>
      <section className="min-w-0 bg-elevated/40">
        {scene && <SceneCard scene={scene} index={selected} total={draft.scenes.length} briefId={draft.briefId} topic={topic} concept={concept}
          loadId={draft.loadId} gameId={draft.gameId} preflopLine={draft.preflopLine} street={draft.street} clip={clips[selected] ?? null}
          onChange={(patch) => onSceneChange(selected, patch)}
          onMove={(dir) => { onMove(selected, dir); setSelected(selected + dir); }}
          onDelete={() => onDelete(selected)} onClip={(path) => onClip(selected, path)} />}
      </section>
    </div>
  );
}
