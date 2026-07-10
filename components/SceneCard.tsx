"use client";
import { useState } from "react";
import type { DraftScene } from "@/src/types";
import { CameraPathEditor } from "./CameraPathEditor";
import { FlowchartTreeEditor } from "./FlowchartTreeEditor";
import { SecondsInput } from "./SecondsInput";
import { VoicePicker } from "./VoicePicker";
import { SceneDataControls } from "./SceneDataControls";
import { SceneScriptButton } from "./SceneScriptButton";
import { DrawingAnimationControls } from "./DrawingAnimationControls";

export function SceneCard({
  scene,
  index,
  total,
  briefId,
  topic,
  concept,
  loadId,
  gameId,
  preflopLine,
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
  gameId?: string;
  preflopLine?: string[];
  street?: string;
  clip: string | null;
  onChange: (patch: Partial<DraftScene>) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onClip: (path: string) => void;
}) {
  const hasCam = Array.isArray(scene.nodes);
  const isBars = scene.type === "barCharts";
  const isFlowchart = scene.type === "flowchart";
  const hasDataControls = isBars || scene.type === "freqBars" || isFlowchart || scene.type === "preflopMatrix";
  // Flowchart scenes split their controls across two tabs: build the exact tree
  // first (expand/collapse like the dashboard Explorer), then camera + settings.
  const [tab, setTab] = useState<"tree" | "settings">("tree");
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
      <div className="mt-1 flex items-center gap-2 text-sm text-muted">
        <span className="label !mb-0">Hold at end</span>
        <SecondsInput value={scene.holdSec ?? 0} onCommit={(holdSec) => onChange({ holdSec: holdSec || undefined })} />
        <span className="text-[11px]">s — linger on the last frame before the next scene</span>
      </div>
      <SceneScriptButton scene={scene} topic={topic} concept={concept} onChange={onChange} />
      <DrawingAnimationControls scene={scene} onChange={onChange} />

      {isFlowchart && (
        <div className="mt-3 flex overflow-hidden rounded-lg border border-line text-xs">
          {(
            [
              { id: "tree", label: "Tree editor" },
              { id: "settings", label: "Camera & settings" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 px-3 py-1.5 font-medium transition-colors ${
                tab === t.id ? "bg-accent/20 text-accent" : "text-muted hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {isFlowchart && tab === "tree" && (
        <FlowchartTreeEditor scene={scene} defaultLoadId={loadId} street={street} onChange={onChange} />
      )}

      {hasDataControls && (!isFlowchart || tab === "settings") && (
        <SceneDataControls
          scene={scene}
          defaultLoadId={loadId}
          defaultGameId={gameId}
          defaultPreflopLine={preflopLine}
          street={street}
          onChange={onChange}
        />
      )}

      {hasCam && (!isFlowchart || tab === "settings") && (
        <CameraPathEditor scene={scene} onChange={onChange} topic={topic} concept={concept} />
      )}

      <VoicePicker briefId={briefId} index={index} clip={clip} onSaved={onClip} />
    </div>
  );
}
