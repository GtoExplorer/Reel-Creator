"use client";
import type { DraftScene } from "@/src/types";
import { CameraPathEditor } from "./CameraPathEditor";
import { VoicePicker } from "./VoicePicker";
import { PropertyPicker } from "./PropertyPicker";
import { BarRescriptButton } from "./BarRescriptButton";

export function SceneCard({
  scene,
  index,
  total,
  briefId,
  topic,
  concept,
  loadId,
  street,
  clip,
  onChange,
  onMove,
  onDelete,
  onClip,
}: {
  scene: DraftScene;
  index: number;
  total: number;
  briefId: string;
  topic: string;
  concept: string;
  loadId?: number;
  street?: string;
  clip: string | null;
  onChange: (patch: Partial<DraftScene>) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onClip: (path: string) => void;
}) {
  const hasCam = Array.isArray(scene.nodes);
  const isBars = scene.type === "strategyBars" || scene.type === "boardSelections";
  return (
    <div className="rounded-xl border border-line bg-elevated p-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="m-0 text-xs font-semibold uppercase tracking-wider text-accent">
          {index + 1}. {scene.type}
        </h3>
        <div className="flex gap-1">
          <button className="btn-ghost btn-mini" disabled={index === 0} onClick={() => onMove(-1)}>
            ↑
          </button>
          <button className="btn-ghost btn-mini" disabled={index === total - 1} onClick={() => onMove(1)}>
            ↓
          </button>
          <button className="btn-ghost btn-mini" disabled={total <= 1} onClick={onDelete}>
            ✕
          </button>
        </div>
      </div>

      <div className="label">Headline</div>
      <input className="input" value={scene.headline} onChange={(e) => onChange({ headline: e.target.value })} />
      <div className="label">Subtext</div>
      <input className="input" value={scene.subtext} onChange={(e) => onChange({ subtext: e.target.value })} />
      <div className="label">Voiceover</div>
      <textarea className="input" value={scene.voiceover} onChange={(e) => onChange({ voiceover: e.target.value })} />

      {isBars && loadId && (
        <PropertyPicker
          loadId={loadId}
          street={street}
          value={scene.category}
          onPick={(categories, category, label) => onChange({ categories, category, headline: label })}
        />
      )}
      {isBars && <BarRescriptButton scene={scene} topic={topic} concept={concept} onChange={onChange} />}

      {hasCam && <CameraPathEditor scene={scene} onChange={onChange} topic={topic} concept={concept} />}

      <VoicePicker briefId={briefId} index={index} clip={clip} onSaved={onClip} />
    </div>
  );
}
