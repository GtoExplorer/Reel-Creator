"use client";
import { useState } from "react";
import type { DraftScene } from "@/src/types";

export function SceneScriptButton({
  scene,
  topic,
  concept,
  onChange,
}: {
  scene: DraftScene;
  topic: string;
  concept: string;
  onChange: (patch: Partial<DraftScene>) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const r = await fetch("/api/scene-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, concept, scene }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Script generation failed");

      const patch: Partial<DraftScene> = {};
      if (typeof j.voiceover === "string") patch.voiceover = j.voiceover;
      if (typeof j.subtext === "string") patch.subtext = j.subtext;
      if (Array.isArray(j.camera)) patch.camera = j.camera;
      if (Object.keys(patch).length) onChange(patch);
      else alert("Script generation returned no changes");
    } catch (e) {
      alert((e as Error).message || "Script generation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn-ghost btn-mini mt-2" onClick={generate} disabled={busy}>
      {busy ? "Writing..." : "Generate script"}
    </button>
  );
}
