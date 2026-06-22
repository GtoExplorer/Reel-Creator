import React from "react";
import { AbsoluteFill, Sequence, Audio, staticFile, useVideoConfig } from "remotion";
import type { RenderManifest, RenderScene } from "../types.js";
import { theme } from "./theme.js";
import { Background } from "./components/Background.js";
import { BrandFrame } from "./components/BrandFrame.js";
import { Captions } from "./components/Captions.js";
import { SceneShell } from "./components/SceneShell.js";
import { HookScene } from "./scenes/HookScene.js";
import { CaptureScene } from "./scenes/CaptureScene.js";
import { RangeGridScene } from "./scenes/RangeGridScene.js";
import { BarChartsScene } from "./scenes/BarChartsScene.js";
import { FreqBarsScene } from "./scenes/FreqBarsScene.js";
import { CtaScene } from "./scenes/CtaScene.js";

const SceneBody: React.FC<{ scene: RenderScene }> = ({ scene }) => {
  switch (scene.type) {
    case "hook":
      return <HookScene scene={scene} />;
    case "flowchart":
      return <CaptureScene scene={scene} />; // native decision tree camera
    case "preflopMatrix":
      return <RangeGridScene scene={scene} />; // native 13x13
    case "barCharts":
      return <BarChartsScene scene={scene} />; // native stacked bars
    case "freqBars":
      return <FreqBarsScene scene={scene} />;
    case "cta":
      return <CtaScene scene={scene} />;
  }
};

export const ReelComposition: React.FC<RenderManifest> = (manifest) => {
  const { fps } = useVideoConfig();
  let from = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bg, fontFamily: theme.font }}>
      <Background />
      {manifest.scenes.map((scene, i) => {
        const durationInFrames = Math.max(1, Math.round(scene.durationSec * fps));
        const seq = (
          <Sequence key={i} from={from} durationInFrames={durationInFrames}>
            {scene.audioFile ? <Audio src={staticFile(scene.audioFile)} /> : null}
            <SceneShell durationInFrames={durationInFrames}>
              <SceneBody scene={scene} />
            </SceneShell>
            <Captions words={scene.words} />
          </Sequence>
        );
        from += durationInFrames;
        return seq;
      })}
      {manifest.music ? <Audio src={staticFile(manifest.music)} volume={0.16} loop /> : null}
      <BrandFrame />
    </AbsoluteFill>
  );
};
