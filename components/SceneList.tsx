"use client";
import { useState } from "react";
import type { DraftManifest, DraftScene, SceneType } from "@/src/types";
import { SceneCard } from "./SceneCard";

const TYPES: SceneType[] = [
  "hook",
  "preflopMatrix",
  "flowchart",
  "boardSelections",
  "strategyBars",
  "freqBars",
  "cta",
];

export function SceneList({
  draft,
  topic,
  concept,
  clips,
  onSceneChange,
  onMove,
  onDelete,
  onAdd,
  onClip,
}: {
  draft: DraftManifest;
  topic: string;
  concept: string;
  clips: (string | null)[];
  // (loadId/street read off the draft below)
  onSceneChange: (i: number, patch: Partial<DraftScene>) => void;
  onMove: (i: number, dir: -1 | 1) => void;
  onDelete: (i: number) => void;
  onAdd: (t: SceneType) => void;
  onClip: (i: number, path: string) => void;
}) {
  const [addType, setAddType] = useState<SceneType>("hook");

  return (
    <div>
      <div className="flex flex-col gap-3">
        {draft.scenes.map((s, i) => (
          <SceneCard
            key={i}
            scene={s}
            index={i}
            total={draft.scenes.length}
            briefId={draft.briefId}
            topic={topic}
            concept={concept}
            loadId={draft.loadId}
            street={draft.street}
            clip={clips[i] ?? null}
            onChange={(patch) => onSceneChange(i, patch)}
            onMove={(dir) => onMove(i, dir)}
            onDelete={() => onDelete(i)}
            onClip={(path) => onClip(i, path)}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <select className="input w-auto" value={addType} onChange={(e) => setAddType(e.target.value as SceneType)}>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button className="btn-ghost" onClick={() => onAdd(addType)}>
          + Add scene
        </button>
      </div>
    </div>
  );
}
