import type { CameraStep, DraftManifest, DraftPool, DraftScene, FlowNode, RenderManifest, RenderScene, SceneType } from "@/src/types";
import { hasPerNodeLines, voiceoverFromLines, timeCameraToLines } from "@/src/cameraTiming";
import { resolveDrawingTimings, stripAnimationTags } from "@/src/drawingAnimations";

// Keep camera stops aimed at nodes that survived a tree edit (expand/collapse/
// direction flip): match each stop to its old node by position, then follow the
// node id to its new position. Stops whose node disappeared are dropped; free
// stops (zoom-outs) are kept as-is.
export function remapCamera(camera: CameraStep[], oldNodes: FlowNode[], newNodes: FlowNode[]): CameraStep[] {
  const near = (n: FlowNode, wp: CameraStep) => Math.abs(n.cx - wp.cx) < 1e-3 && Math.abs(n.cy - wp.cy) < 1e-3;
  return camera
    .map((wp) => {
      const oldN = oldNodes.find((n) => near(n, wp));
      if (!oldN) return wp;
      const newN = newNodes.find((n) => n.id === oldN.id && n.kind === oldN.kind);
      return newN ? { ...wp, cx: newN.cx, cy: newN.cy } : null;
    })
    .filter((wp): wp is CameraStep => wp !== null);
}

// Build a fresh scene of any type, pulling its data from the draft's asset pool
// so add-scene needs no new draft generation. Pure + client-safe.
export function makeScene(t: SceneType, pool?: DraftPool, loadId?: number, gameId?: string, preflopLine?: string[]): DraftScene {
  const p = pool ?? {};
  const base: DraftScene = { type: t, headline: "", subtext: "", voiceover: "" };
  const barCategories = p.boardCategories ?? p.categories;
  const focusBar = barCategories?.[Math.floor((barCategories.length - 1) / 2)];
  switch (t) {
    case "preflopMatrix":
      return { ...base, gameId, preflopLine, rangeGrid: p.preflopGrid, headline: p.preflopLabel ?? "Preflop Range" };
    case "flowchart":
      return {
        ...base,
        loadId,
        gameId,
        flowchart: p.flowchart,
        tree: p.tree,
        nodes: p.nodes ?? [],
        camera: [
          { cx: 0.5, cy: 0.5, zoom: 1 },
          { cx: 0.5, cy: 0.5, zoom: 1.2 },
        ],
        headline: "Decision Tree",
      };
    case "barCharts":
      return { ...base, loadId, gameId, categories: barCategories, category: p.boardCategories ? "flop_top_card_rank" : "sdv", headline: p.boardLabel ?? "Bar Charts" };
    case "freqBars":
      return {
        ...base,
        loadId,
        gameId,
        category: p.boardCategories ? "flop_top_card_rank" : "sdv",
        categories: barCategories,
        barValue: focusBar?.category ?? p.highlightLabel,
        freqBars: focusBar?.actions ?? p.freqBars,
        headline: focusBar?.category ?? p.highlightLabel ?? "Frequencies",
      };
    case "hook":
      return { ...base, headline: "New hook" };
    case "cta":
      return { ...base, headline: "Explore on GTOCentral" };
  }
}

// Estimated render manifest for the live Player before voicing exists: derive a
// duration from the voiceover word count, no audio, no caption timings.
export function draftToPreview(draft: DraftManifest): RenderManifest {
  const scenes: RenderScene[] = draft.scenes.map((s) => {
    const perNode = s.type === "flowchart" && hasPerNodeLines(s.camera);
    const taggedVo = perNode ? voiceoverFromLines(s.camera) : s.voiceover ?? "";
    const vo = stripAnimationTags(taggedVo);
    const words = vo.trim().split(/\s+/).filter(Boolean).length;
    // Camera/caption timing runs against the speech estimate; the end-of-scene
    // hold is appended on top so the final frame lingers.
    const speechSec = Math.max(2.5, words / 2.6);
    const durationSec = speechSec + Math.max(0, s.holdSec ?? 0);
    const camera = perNode ? timeCameraToLines(s.camera ?? [], [], speechSec) : s.camera;
    return { ...s, camera, voiceover: vo, audioFile: "", durationSec, words: [], drawings: [] };
  });
  return { briefId: draft.briefId, title: draft.title, hashtags: draft.hashtags, scenes };
}

function sameVoiceSource(draftScene: DraftScene, previewScene: RenderScene, voicedScene?: RenderScene): voicedScene is RenderScene {
  if (!voicedScene?.audioFile) return false;
  if (voicedScene.type !== draftScene.type) return false;
  if ((draftScene.customAudio ?? "") !== (voicedScene.customAudio ?? "")) return false;
  return previewScene.voiceover.trim() === voicedScene.voiceover.trim();
}

// Live editor preview after voices exist: keep generated audio/captions for any
// scene whose spoken text has not changed, while reflecting current visual edits.
// Edited scenes fall back to silent timing until voices are regenerated.
export function draftToPreviewWithVoices(draft: DraftManifest, voiced: RenderManifest | null): RenderManifest {
  const preview = draftToPreview(draft);
  if (!voiced) return preview;

  return {
    ...preview,
    music: voiced.music,
    scenes: preview.scenes.map((scene, i) => {
      const draftScene = draft.scenes[i];
      const voicedScene = voiced.scenes[i];
      if (!draftScene || !sameVoiceSource(draftScene, scene, voicedScene)) return scene;

      const perNode = draftScene.type === "flowchart" && hasPerNodeLines(draftScene.camera);
      // Rebuild the duration from the voiced SPEECH length + the draft's CURRENT
      // hold, so hold edits preview live without re-voicing.
      const speechSec = Math.max(0, voicedScene.durationSec - (voicedScene.holdSec ?? 0));
      return {
        ...scene,
        audioFile: voicedScene.audioFile,
        durationSec: speechSec + Math.max(0, draftScene.holdSec ?? 0),
        words: voicedScene.words,
        camera: perNode ? timeCameraToLines(draftScene.camera ?? [], voicedScene.words, speechSec) : scene.camera,
        drawings: resolveDrawingTimings(draftScene.drawings, draftScene.voiceover, voicedScene.words, speechSec),
      };
    }),
  };
}
