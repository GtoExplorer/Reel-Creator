import type { DraftManifest, DraftPool, DraftScene, RenderManifest, RenderScene, SceneType } from "@/src/types";
import { hasPerNodeLines, voiceoverFromLines, timeCameraToLines } from "@/src/cameraTiming";
import { resolveDrawingTimings, stripAnimationTags } from "@/src/drawingAnimations";

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
    const durationSec = Math.max(2.5, words / 2.6);
    const camera = perNode ? timeCameraToLines(s.camera ?? [], [], durationSec) : s.camera;
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
      return {
        ...scene,
        audioFile: voicedScene.audioFile,
        durationSec: voicedScene.durationSec,
        words: voicedScene.words,
        camera: perNode ? timeCameraToLines(draftScene.camera ?? [], voicedScene.words, voicedScene.durationSec) : scene.camera,
        drawings: resolveDrawingTimings(draftScene.drawings, draftScene.voiceover, voicedScene.words, voicedScene.durationSec),
      };
    }),
  };
}
