import type { DraftManifest, DraftPool, DraftScene, RenderManifest, RenderScene, SceneType } from "@/src/types";
import { hasPerNodeLines, voiceoverFromLines, timeCameraToLines } from "@/src/cameraTiming";

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
    const vo = perNode ? voiceoverFromLines(s.camera) : s.voiceover ?? "";
    const words = vo.trim().split(/\s+/).filter(Boolean).length;
    const durationSec = Math.max(2.5, words / 2.6);
    const camera = perNode ? timeCameraToLines(s.camera ?? [], durationSec) : s.camera;
    return { ...s, camera, voiceover: vo, audioFile: "", durationSec, words: [] };
  });
  return { briefId: draft.briefId, title: draft.title, hashtags: draft.hashtags, scenes };
}
