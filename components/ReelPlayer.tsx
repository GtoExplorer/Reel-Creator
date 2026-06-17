"use client";
import { Player } from "@remotion/player";
import { ReelComposition } from "@/src/remotion/ReelComposition";
import { VIDEO } from "@/src/videoSpec";
import type { RenderManifest } from "@/src/types";

export function ReelPlayer({ manifest }: { manifest: RenderManifest }) {
  const totalSec = manifest.scenes.reduce((a, s) => a + (s.durationSec || 0), 0);
  const durationInFrames = Math.max(1, Math.round(totalSec * VIDEO.fps));

  return (
    <Player
      // ReelComposition is typed as FC<RenderManifest>; Player wants a generic
      // props record, so loosen the component type and pass the manifest as props.
      component={ReelComposition as unknown as React.ComponentType<Record<string, unknown>>}
      inputProps={manifest as unknown as Record<string, unknown>}
      durationInFrames={durationInFrames}
      compositionWidth={VIDEO.width}
      compositionHeight={VIDEO.height}
      fps={VIDEO.fps}
      controls
      acknowledgeRemotionLicense
      style={{ width: "100%", borderRadius: 12, overflow: "hidden", background: "#000" }}
    />
  );
}
