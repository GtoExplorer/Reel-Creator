"use client";
import { useState } from "react";
import type { DraftScene } from "@/src/types";

// AI-rescript a bar-chart scene's voiceover + subtext from its current data —
// use after changing the property so the script matches the new bars.
export function BarRescriptButton({
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

  async function rescript() {
    if (!scene.categories?.length) {
      alert("No bar data yet — pick a property first");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/rescript-bars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, concept, property: scene.category, categories: scene.categories }),
      }).then((res) => res.json());
      const patch: Partial<DraftScene> = {};
      if (r.voiceover) patch.voiceover = r.voiceover;
      if (typeof r.subtext === "string") patch.subtext = r.subtext;
      if (Object.keys(patch).length) onChange(patch);
      else alert("Rescript failed");
    } catch {
      alert("Rescript failed");
    }
    setBusy(false);
  }

  return (
    <button className="btn-ghost btn-mini" onClick={rescript} disabled={busy} style={{ marginTop: 8 }}>
      {busy ? "Writing…" : "↻ Rescript voiceover + subtext from data"}
    </button>
  );
}
