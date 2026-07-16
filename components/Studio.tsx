"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { DraftManifest, DraftScene, RenderManifest, SceneType } from "@/src/types";
import type { ReelSummary } from "@/src/pipeline/library";
import type { SceneEdit } from "@/src/pipeline/stages";
import { parseStreamMarkerJson, streamFetch } from "@/lib/clientStream";
import { makeScene, draftToPreviewWithVoices } from "@/lib/scenes";
import { Sidebar } from "./Sidebar";
import { BriefForm } from "./BriefForm";
import { SceneList } from "./SceneList";
import { LogConsole } from "./LogConsole";

// The Remotion Player (and the whole composition import chain) is browser-only —
// load it client-side to keep it out of SSR entirely.
const ReelPlayer = dynamic(() => import("./ReelPlayer").then((m) => m.ReelPlayer), { ssr: false });

type Health = "ok" | "error" | "checking";
type SaveStatus = "idle" | "saving" | "saved" | "error";

export function Studio() {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<"brief" | "edit">("brief");
  const [draft, setDraft] = useState<DraftManifest | null>(null);
  const [clips, setClips] = useState<(string | null)[]>([]);
  const [manifest, setManifest] = useState<RenderManifest | null>(null); // voiced
  const [manifestStale, setManifestStale] = useState(false);
  const [reels, setReels] = useState<ReelSummary[]>([]);
  const [health, setHealth] = useState<Health>("checking");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [buildLog, setBuildLog] = useState("");
  const [voicing, setVoicing] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [finalUrl, setFinalUrl] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const lastSavedDraft = useRef("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSeq = useRef(0);

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
    setClips(d.scenes.map((s) => s.customAudio ?? null));
    setManifest(null);
    setManifestStale(false);
    setFinalUrl(null);
    setBuildLog("");
    setActiveId(id);
    lastSavedDraft.current = JSON.stringify(d);
    setSaveStatus("saved");
    setStep("edit");
    loadReels(); // a freshly-drafted reel writes draft.json → show it in the sidebar now
  }

  function newReel() {
    setStep("brief");
    setDraft(null);
    setClips([]);
    setManifest(null);
    setManifestStale(false);
    setFinalUrl(null);
    setBuildLog("");
    setActiveId(null);
    lastSavedDraft.current = "";
    setSaveStatus("idle");
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

  useEffect(() => {
    if (!draft || !activeId || step !== "edit") return;
    const body = JSON.stringify(draft);
    if (body === lastSavedDraft.current) return;

    setSaveStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const seq = ++saveSeq.current;
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/draft/${encodeURIComponent(activeId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draft }),
        });
        if (!res.ok) throw new Error(await res.text());
        if (seq === saveSeq.current) {
          lastSavedDraft.current = body;
          setSaveStatus("saved");
        }
        loadReels();
      } catch {
        if (seq === saveSeq.current) setSaveStatus("error");
      }
    }, 700);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [draft, activeId, step, loadReels]);

  // ---- scene ops (keep clips in sync; any change invalidates the voiced mix) --
  const invalidate = () => setManifestStale(true);

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
    setDraft((d) => (d ? { ...d, scenes: [...d.scenes, makeScene(t, d.pool, d.loadId, d.gameId, d.preflopLine, d.street)] } : d));
    setClips((c) => [...c, null]);
    invalidate();
  }
  function setClip(i: number, path: string) {
    setClips((c) => c.map((x, j) => (j === i ? path : x)));
    setDraft((d) => (d ? { ...d, scenes: d.scenes.map((s, j) => (j === i ? { ...s, customAudio: path } : s)) } : d));
    invalidate();
  }

  // ---- voice + render --------------------------------------------------------
  async function voiceNow(): Promise<RenderManifest | null> {
    if (!draft) return null;
    setVoicing(true);
    setBuildLog("Generating voiceovers…\n");
    const edits: SceneEdit[] = draft.scenes.map((s, i) => {
      const customAudio = clips[i] ?? s.customAudio;
      return customAudio ? { customAudio } : {};
    });
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
    setManifestStale(false);
    return mf;
  }

  async function render() {
    const mf = manifest && !manifestStale ? manifest : await voiceNow();
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

  const previewManifest = draft ? draftToPreviewWithVoices(draft, manifest) : null;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar reels={reels} health={health} activeId={activeId} onNew={newReel} onEdit={editReel} onDelete={deleteReel} />

      <main className="min-w-0 flex-1 p-4 lg:p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">Creator workspace</div>
            <h1 className="mt-1 text-2xl font-semibold">Reel Studio</h1>
          </div>
          <div className="creator-steps">
            {["Brief", "Create", "Voice", "Export"].map((label, i) => {
              const current = step === "brief" ? 0 : finalUrl ? 3 : manifest && !manifestStale ? 2 : 1;
              return <div key={label} className={i <= current ? "is-active" : ""}><span>{i + 1}</span>{label}</div>;
            })}
          </div>
        </div>
        {step === "brief" || !draft ? (
          <BriefForm onDraft={(d) => loadDraftIntoEditor(d, d.briefId)} />
        ) : (
          <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_340px]">
            <div>
              <div className="mb-4 flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3">
                <div>
                  <h2 className="text-base font-semibold">{draft.title}</h2>
                  {draft.aiSelection && (
                    <div className="mt-2 max-w-2xl rounded-lg border border-accent/20 bg-accent/5 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-accent">
                        <span>AI-selected spot</span><span className="rounded-full bg-accent/15 px-2 py-0.5">Load {draft.aiSelection.loadId}</span>
                      </div>
                      <div className="mt-1 text-xs text-text">{draft.aiSelection.description}</div>
                      <div className="mt-0.5 text-[11px] text-muted">{draft.aiSelection.reason}</div>
                    </div>
                  )}
                  <div className={`mt-1 text-xs ${saveStatus === "error" ? "text-red-300" : "text-muted"}`}>
                    {saveStatus === "saving"
                      ? "Saving draft..."
                      : saveStatus === "saved"
                        ? "Draft saved"
                        : saveStatus === "error"
                          ? "Draft autosave failed"
                          : ""}
                  </div>
                </div>
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

            <div className="flex flex-col gap-3 self-start 2xl:sticky 2xl:top-4">
              <div className="rounded-2xl border border-line bg-surface p-3 shadow-2xl">
                <div className="mb-3 flex items-center justify-between"><div><div className="text-sm font-semibold">Live preview</div><div className="text-[10px] text-muted">9:16 vertical video</div></div><span className="rounded-full bg-green-500/10 px-2 py-1 text-[10px] font-medium text-green-300">Live</span></div>
                <div className="aspect-[9/16] w-full overflow-hidden rounded-xl bg-black">
                {mounted && previewManifest && <ReelPlayer manifest={previewManifest} />}
                </div>
              </div>
              <div className="text-xs text-muted">
                {manifest
                  ? manifestStale
                    ? "Previewing saved voices where still valid - regenerate voices before render"
                    : "Previewing with voice + captions"
                  : "Live preview (visuals only — generate voices for audio + captions)"}
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-surface p-3">
                <button className="btn-ghost" disabled={busy} onClick={voiceNow}>
                  {voicing ? "Voicing…" : manifestStale && manifest ? "Regenerate voices" : "Generate voices"}
                </button>
                <button className="btn" disabled={busy} onClick={render}>
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
