import React from "react";
import { Composition } from "remotion";
import { VIDEO } from "../videoSpec.js";
import type { RenderManifest, RenderScene, WordTimestamp } from "../types.js";
import { buildMockGrid, buildMockCategories } from "../poker/ranges.js";
import { ReelComposition } from "./ReelComposition.js";

// Evenly-timed fake words so captions animate in the studio/preview without
// running the OpenAI pipeline.
function fakeWords(text: string, durationSec: number): WordTimestamp[] {
  const parts = text.split(" ");
  const per = (durationSec - 0.3) / parts.length;
  return parts.map((word, i) => ({ word, start: +(i * per).toFixed(2), end: +((i + 1) * per).toFixed(2) }));
}

function scene(s: Omit<RenderScene, "words" | "voiceover"> & { vo: string }): RenderScene {
  return { ...s, voiceover: s.vo, words: fakeWords(s.vo, s.durationSec) };
}

const sampleProps: RenderManifest = {
  briefId: "sample",
  title: "Sample reel",
  hashtags: ["poker", "gto", "pokerstrategy"],
  scenes: [
    scene({ type: "hook", headline: "You fold this way too much", subtext: "3-bet pots", vo: "Most players fold this spot far too often.", audioFile: "", durationSec: 3 }),
    scene({ type: "preflopMatrix", headline: "Start before the flop", subtext: "The opening range", vo: "It starts with the right preflop range.", audioFile: "", durationSec: 4, rangeGrid: buildMockGrid() }),
    scene({ type: "flowchart", headline: "The solver's decision tree", subtext: "Live on GTOCentral", vo: "Then the solver decides street by street.", audioFile: "", durationSec: 5, image: undefined }),
    scene({ type: "boardSelections", headline: "Every board texture", subtext: "By flop high card", vo: "And it adapts to every board texture.", audioFile: "", durationSec: 4, categories: buildMockCategories() }),
    scene({ type: "cta", headline: "Explore it yourself", subtext: "Free on GTOCentral", vo: "Run the spot yourself on GTOCentral.", audioFile: "", durationSec: 3 }),
  ],
};

function totalFrames(props: RenderManifest): number {
  const sec = props.scenes.reduce((a, s) => a + s.durationSec, 0) || 1;
  return Math.round(sec * VIDEO.fps);
}

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Reel"
      component={ReelComposition}
      width={VIDEO.width}
      height={VIDEO.height}
      fps={VIDEO.fps}
      durationInFrames={totalFrames(sampleProps)}
      defaultProps={sampleProps}
      calculateMetadata={({ props }) => ({ durationInFrames: totalFrames(props) })}
    />
  );
};
