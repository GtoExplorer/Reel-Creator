"use client";
import type { SyntheticEvent } from "react";
import { useState } from "react";
import type { DraftManifest } from "@/src/types";
import { parseStreamMarkerJson, streamFetch } from "@/lib/clientStream";
import { LogConsole } from "./LogConsole";

export function BriefForm({ onDraft }: { onDraft: (d: DraftManifest) => void }) {
  const [mode, setMode] = useState<"ai" | "spot">("spot");
  const [topic, setTopic] = useState("");
  const [concept, setConcept] = useState("");
  const [line, setLine] = useState("");
  const [board, setBoard] = useState("");
  const [loadId, setLoadId] = useState("");
  const [gameId, setGameId] = useState("");
  const [deriving, setDeriving] = useState(false);
  const [log, setLog] = useState("");
  const [busy, setBusy] = useState(false);

  async function deriveLine(e?: SyntheticEvent) {
    e?.preventDefault();
    if (!loadId.trim()) return;
    setDeriving(true);
    try {
      const r = await fetch(`/api/line-from-load?loadId=${encodeURIComponent(loadId.trim())}`).then((res) => res.json());
      if (r.line?.length) { setLine(r.line.join(", ")); setGameId(r.gameId || ""); }
      else alert(r.error || "Could not derive a line for that load ID");
    } catch { alert("Derive failed — check the API connection"); }
    setDeriving(false);
  }

  async function create(e?: SyntheticEvent) {
    e?.preventDefault();
    if (!topic.trim() || !concept.trim()) { alert("Topic and lesson are required"); return; }
    setBusy(true);
    setLog(mode === "ai" ? "AI is finding the best solver spot for your idea...\n" : "Fetching solver data and building your draft...\n");
    const preflopLine = line.split(",").map((s) => s.trim()).filter(Boolean);
    let buf = "";
    try {
      buf = await streamFetch("/api/draft", {
        topic: topic.trim(), concept: concept.trim(), board: board.trim() || undefined,
        preflopLine: mode === "spot" ? preflopLine : undefined,
        loadId: mode === "spot" && loadId.trim() ? Number(loadId.trim()) : undefined,
        gameId: mode === "spot" ? gameId || undefined : undefined,
        autoSelectSpot: mode === "ai",
      }, setLog);
    } catch (error) { setLog(String(error)); }
    setBusy(false);
    const draft = parseStreamMarkerJson<DraftManifest>(buf, "__DRAFT__");
    if (!draft) { alert("Draft failed — see the activity log"); return; }
    onDraft(draft);
  }

  return <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-2xl sm:p-7">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Step 1 of 4</div>
      <h2 className="mb-1 text-2xl font-semibold">Create a new reel</h2>
      <p className="mb-5 text-sm text-muted">Start from an idea or bring your own poker spot. Either way, the result is fully editable.</p>

      <div className="mb-5 grid grid-cols-2 rounded-xl border border-line bg-bg p-1">
        <button type="button" onClick={() => setMode("ai")} className={`rounded-lg px-3 py-2.5 text-left transition ${mode === "ai" ? "bg-accent/15 text-accent" : "text-muted hover:text-text"}`}>
          <span className="block text-xs font-semibold">Create with AI</span><span className="mt-0.5 block text-[10px]">We find the poker spot</span>
        </button>
        <button type="button" onClick={() => setMode("spot")} className={`rounded-lg px-3 py-2.5 text-left transition ${mode === "spot" ? "bg-accent/15 text-accent" : "text-muted hover:text-text"}`}>
          <span className="block text-xs font-semibold">Choose a spot</span><span className="mt-0.5 block text-[10px]">Use a load or line</span>
        </button>
      </div>

      <div className="label">Video topic</div>
      <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={mode === "ai" ? "e.g. Why checking back protects your range" : "BTN vs BB: the c-bet trap"} />
      <div className="label">What should viewers learn?</div>
      <textarea className="input min-h-28" value={concept} onChange={(e) => setConcept(e.target.value)} placeholder={mode === "ai" ? "Describe the lesson, audience, positions or situation in plain English. AI will match it to a real solver spot." : "Describe the strategic lesson for this spot..."} />

      {mode === "spot" && <>
        <div className="label">Load ID (optional)</div>
        <div className="flex gap-2">
          <input className="input" value={loadId} onChange={(e) => { setLoadId(e.target.value); setGameId(""); }} placeholder="68617" onKeyDown={(e) => e.key === "Enter" && deriveLine(e)} />
          <button type="button" className="btn-ghost whitespace-nowrap" onClick={deriveLine} disabled={deriving || !loadId.trim()}>{deriving ? "Finding..." : "Find line"}</button>
        </div>
        <div className="label">Preflop line (comma-separated)</div>
        <input className="input" value={line} onChange={(e) => setLine(e.target.value)} placeholder="Fold, Fold, Raise 2.5bb, Fold, Call" />
        <div className="label">Board (optional)</div>
        <input className="input" value={board} onChange={(e) => setBoard(e.target.value)} placeholder="8h7h4c" />
      </>}

      {mode === "ai" && <div className="mt-4 flex gap-3 rounded-xl border border-accent/20 bg-accent/5 p-3">
        <span className="text-accent">✦</span><p className="text-[11px] leading-5 text-muted">AI can only select from real published GTOCentral loads. Charts and frequencies come directly from solver data, and every scene remains editable.</p>
      </div>}

      <button type="button" className="btn mt-5 w-full" disabled={busy} onClick={create}>
        {busy ? (mode === "ai" ? "Finding a spot and building..." : "Building your reel...") : (mode === "ai" ? "Create with AI →" : "Build from this spot →")}
      </button>
      <LogConsole text={log} />
    </div>

    <aside className="rounded-2xl border border-line bg-gradient-to-b from-accent/10 to-transparent p-5">
      <div className="text-sm font-semibold">What happens next?</div>
      <div className="mt-4 space-y-4">
        {["We match your idea to verified solver data.", "AI creates a short, editable scene structure.", "You refine the story, preview it, then export."].map((text, i) => <div key={text} className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-[10px] font-bold text-black">{i + 1}</span><p className="text-xs leading-5 text-muted">{text}</p></div>)}
      </div>
      <div className="mt-6 rounded-xl border border-line bg-black/20 p-3 text-[11px] leading-5 text-muted">You don’t need video editing experience. Advanced solver and camera controls stay optional.</div>
    </aside>
  </div>;
}
