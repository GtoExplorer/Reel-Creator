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

export function SceneCard({ scene, index, total, briefId, topic, concept, loadId, gameId, preflopLine, street, clip, onChange, onMove, onDelete, onClip }: {
  scene: DraftScene; index: number; total: number; briefId: string; topic: string; concept: string;
  loadId?: number; gameId?: string; preflopLine?: string[]; street?: string; clip: string | null;
  onChange: (patch: Partial<DraftScene>) => void; onMove: (dir: -1 | 1) => void; onDelete: () => void; onClip: (path: string) => void;
}) {
  const hasCam = Array.isArray(scene.nodes);
  const isBars = scene.type === "barCharts";
  const isFlowchart = scene.type === "flowchart";
  const hasDataControls = isBars || scene.type === "freqBars" || isFlowchart || scene.type === "preflopMatrix";
  const [tab, setTab] = useState<"tree" | "settings">("tree");

  return <div className="p-4 sm:p-6">
    <div className="mb-5 flex items-start justify-between gap-3 border-b border-line pb-4">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Scene {index + 1} of {total}</div>
        <h3 className="mt-1 text-xl font-semibold capitalize">{scene.type.replace(/([A-Z])/g, " $1")}</h3>
        <p className="mt-1 text-xs text-muted">Shape what viewers see and hear in this moment.</p>
      </div>
      <div className="flex gap-1">
        <button title="Move earlier" className="creator-icon-button" disabled={index === 0} onClick={() => onMove(-1)}>←</button>
        <button title="Move later" className="creator-icon-button" disabled={index === total - 1} onClick={() => onMove(1)}>→</button>
        <button title="Delete scene" className="creator-icon-button creator-icon-danger" disabled={total <= 1} onClick={onDelete}>×</button>
      </div>
    </div>

    <div className="creator-section-title">Content</div>
    <div className="label">On-screen headline</div>
    <input className="input" value={scene.headline} onChange={(e) => onChange({ headline: e.target.value })} />
    <div className="label">Supporting text</div>
    <input className="input" value={scene.subtext} onChange={(e) => onChange({ subtext: e.target.value })} />
    <div className="label">Voiceover script</div>
    <textarea className="input min-h-28" value={scene.voiceover} onChange={(e) => onChange({ voiceover: e.target.value })} placeholder="What should be said during this scene?" />
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
      <span className="text-xs font-medium">End hold</span>
      <SecondsInput value={scene.holdSec ?? 0} onCommit={(holdSec) => onChange({ holdSec: holdSec || undefined })} />
      <span className="text-[11px]">seconds before the next scene</span>
    </div>
    <SceneScriptButton scene={scene} topic={topic} concept={concept} onChange={onChange} />

    <details className="creator-disclosure">
      <summary>Visual emphasis <span>Highlights and drawing animations</span></summary>
      <DrawingAnimationControls scene={scene} onChange={onChange} />
    </details>

    {isFlowchart && <div className="mt-5 flex overflow-hidden rounded-lg border border-line text-xs">
      {([{ id: "tree", label: "Build tree" }, { id: "settings", label: "Camera & settings" }] as const).map((item) =>
        <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`flex-1 px-3 py-2 font-medium transition-colors ${tab === item.id ? "bg-accent/20 text-accent" : "text-muted hover:text-text"}`}>{item.label}</button>)}
    </div>}

    {isFlowchart && tab === "tree" && <FlowchartTreeEditor scene={scene} defaultLoadId={loadId} street={street} onChange={onChange} />}

    {hasDataControls && (!isFlowchart || tab === "settings") && <details className="creator-disclosure" open>
      <summary>Poker data <span>Load, properties and filters</span></summary>
      <SceneDataControls scene={scene} defaultLoadId={loadId} defaultGameId={gameId} defaultPreflopLine={preflopLine} street={street} onChange={onChange} />
    </details>}

    {hasCam && (!isFlowchart || tab === "settings") && <details className="creator-disclosure">
      <summary>Camera movement <span>Framing, zoom and timing</span></summary>
      <CameraPathEditor scene={scene} onChange={onChange} topic={topic} concept={concept} />
    </details>}

    <details className="creator-disclosure">
      <summary>Custom audio <span>Record or upload your own voice</span></summary>
      <VoicePicker briefId={briefId} index={index} clip={clip} onSaved={onClip} />
    </details>
  </div>;
}
