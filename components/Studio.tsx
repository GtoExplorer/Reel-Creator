"use client";
import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { DraftManifest, DraftScene, RenderManifest, SceneType } from "@/src/types";
import type { ReelSummary } from "@/src/pipeline/library";
import type { SceneEdit } from "@/src/pipeline/stages";
import { parseStreamMarkerJson, streamFetch } from "@/lib/clientStream";
import { makeScene, draftToPreview } from "@/lib/scenes";
import { Sidebar } from "./Sidebar";
import { BriefForm } from "./BriefForm";
import { SceneList } from "./SceneList";
import { LogConsole } from "./LogConsole";

// The Remotion Player (and the whole composition import chain) is browser-only —
// load it client-side to keep it out of SSR entirely.
const ReelPlayer = dynamic(() => import("./ReelPlayer").then((m) => m.ReelPlayer), { ssr: false });

type Health = "ok" | "error" | "checking";

export function Studio() {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<"brief" | "edit">("brief");
  const [draft, setDraft] = useState<DraftManifest | null>(null);
  const [clips, setClips] = useState<(string | null)[]>([]);
  const [manifest, setManifest] = useState<RenderManifest | null>(null); // voiced
  const [reels, setReels] = useState<ReelSummary[]>([]);
  const [health, setHealth] = useState<Health>("checking");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [buildLog, setBuildLog] = useState("");
  const [voicing, setVoicing] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [finalUrl, setFinalUrl] = useState<string | null>(null);

  const busy = voicing || rendering;

  const loadReels = useCallback(async () => {
    try {
      setReels(await (await fetch("/api/reels")).json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    loadReels();
    fetch("/api/health")
      .then((r) => r.json())
      .then((j) => setHealth(j.api === "ok" ? "ok" : "error"))
      .catch(() => setHealth("error"));
  }, [loadReels]);

  function loadDraftIntoEditor(d: DraftManifest, id: string) {
    setDraft(d);
    setClips(d.scenes.map(() => null));
    setManifest(null);
    setFinalUrl(null);
    setBuildLog("");
    setActiveId(id);
    setStep("edit");
    loadReels(); // a freshly-drafted reel writes draft.json → show it in the sidebar now
  }

  function newReel() {
    setStep("brief");
    setDraft(null);
    setClips([]);
    setManifest(null);
    setFinalUrl(null);
    setBuildLog("");
    setActiveId(null);
  }

  async function deleteReel(id: string) {
    if (!confirm(`Delete "${id}"? This permanently removes its files (video, draft, generated assets).`)) return;
    const res = await fetch(`/api/reels/${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("Delete failed");
      return;
    }
    if (activeId === id) newReel(); // it was open in the editor — reset
    loadReels();
  }

  async function editReel(id: string) {
    const res = await fetch(`/api/draft/${id}`);
    if (!res.ok) {
      alert("No editable draft for this reel");
      return;
    }
    loadDraftIntoEditor(await res.json(), id);
    window.scrollTo(0, 0);
  }

  // ---- scene ops (keep clips in sync; any change invalidates the voiced mix) --
  const invalidate = () => setManifest(null);

  function updateScene(i: number, patch: Partial<DraftScene>) {
    setDraft((d) => (d ? { ...d, scenes: d.scenes.map((s, j) => (j === i ? { ...s, ...patch } : s)) } : d));
    invalidate();
  }
  function moveScene(i: number, dir: -1 | 1) {
    const j = i + dir;
    setDraft((d) => {
      if (!d || j < 0 || j >= d.scenes.length) return d;
      const scenes = d.scenes.slice();
      [scenes[i], scenes[j]] = [scenes[j], scenes[i]];
      return { ...d, scenes };
    });
    setClips((c) => {
      if (j < 0 || j >= c.length) return c;
      const next = c.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    invalidate();
  }
  function delScene(i: number) {
    setDraft((d) => (d && d.scenes.length > 1 ? { ...d, scenes: d.scenes.filter((_, j) => j !== i) } : d));
    setClips((c) => (c.length > 1 ? c.filter((_, j) => j !== i) : c));
    invalidate();
  }
  function addScene(t: SceneType) {
    setDraft((d) => (d ? { ...d, scenes: [...d.scenes, makeScene(t, d.pool, d.loadId)] } : d));
    setClips((c) => [...c, null]);
    invalidate();
  }
  function setClip(i: number, path: string) {
    setClips((c) => c.map((x, j) => (j === i ? path : x)));
    invalidate();
  }

  // ---- voice + render --------------------------------------------------------
  async function voiceNow(): Promise<RenderManifest | null> {
    if (!draft) return null;
    setVoicing(true);
    setBuildLog("Generating voiceovers…\n");
    const edits: SceneEdit[] = clips.map((c) => (c ? { customAudio: c } : {}));
    let buf = "";
    try {
      buf = await streamFetch("/api/voice", { draft, edits }, setBuildLog);
    } catch (e) {
      setBuildLog(String(e));
    }
    setVoicing(false);
    const mf = parseStreamMarkerJson<RenderManifest>(buf, "__MANIFEST__");
    if (!mf) {
      alert("Voicing failed - see logs");
      return null;
    }
    setManifest(mf);
    return mf;
  }

  async function render() {
    const mf = manifest ?? (await voiceNow());
    if (!mf) return;
    setRendering(true);
    setFinalUrl(null);
    let buf = "";
    try {
      buf = await streamFetch("/api/render", { manifest: mf }, setBuildLog);
    } catch (e) {
      setBuildLog(String(e));
    }
    setRendering(false);
    const m = buf.match(/__DONE__ (\S+)/);
    if (m) {
      setFinalUrl(`${m[1]}?t=${Date.now()}`);
      loadReels();
    } else {
      alert("Render failed — see logs");
    }
  }

  const previewManifest = manifest ?? (draft ? draftToPreview(draft) : null);

  return (
    <div className="flex">
      <Sidebar reels={reels} health={health} activeId={activeId} onNew={newReel} onEdit={editReel} onDelete={deleteReel} />

      <main className="min-w-0 flex-1 p-6">
        {step === "brief" || !draft ? (
          <BriefForm onDraft={(d) => loadDraftIntoEditor(d, d.briefId)} />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">{draft.title}</h2>
                <button className="btn-ghost btn-mini" onClick={newReel}>
                  Start over
                </button>
              </div>
              <SceneList
                draft={draft}
                topic={draft.topic ?? draft.title}
                concept={draft.concept ?? ""}
                clips={clips}
                onSceneChange={updateScene}
                onMove={moveScene}
                onDelete={delScene}
                onAdd={addScene}
                onClip={setClip}
              />
            </div>

            <div className="flex flex-col gap-3 self-start lg:sticky lg:top-6">
              <div className="aspect-[9/16] w-full overflow-hidden rounded-xl bg-black">
                {mounted && previewManifest && <ReelPlayer manifest={previewManifest} />}
              </div>
              <div className="text-xs text-muted">
                {manifest
                  ? "Previewing with voice + captions"
                  : "Live preview (visuals only — generate voices for audio + captions)"}
              </div>
              <div className="flex gap-2">
                <button className="btn-ghost flex-1" disabled={busy} onClick={voiceNow}>
                  {voicing ? "Voicing…" : "Generate voices"}
                </button>
                <button className="btn flex-1" disabled={busy} onClick={render}>
                  {rendering ? "Rendering…" : "Render MP4"}
                </button>
              </div>
              <LogConsole text={buildLog} />
              {finalUrl && <video src={finalUrl} controls className="w-full rounded-xl bg-black" />}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default Studio;
