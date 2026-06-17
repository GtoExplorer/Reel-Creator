"use client";
import { useState } from "react";
import type { DraftManifest } from "@/src/types";
import { streamFetch } from "@/lib/clientStream";
import { LogConsole } from "./LogConsole";

export function BriefForm({ onDraft }: { onDraft: (d: DraftManifest) => void }) {
  const [topic, setTopic] = useState("");
  const [concept, setConcept] = useState("");
  const [line, setLine] = useState("");
  const [board, setBoard] = useState("");
  const [loadId, setLoadId] = useState("");
  const [deriving, setDeriving] = useState(false);
  const [log, setLog] = useState("");
  const [busy, setBusy] = useState(false);

  async function deriveLine() {
    if (!loadId.trim()) return;
    setDeriving(true);
    try {
      const r = await fetch(`/api/line-from-load?loadId=${encodeURIComponent(loadId.trim())}`).then((res) => res.json());
      if (r.line?.length) setLine(r.line.join(", "));
      else alert(r.error || "Could not derive a line for that load id");
    } catch {
      alert("Derive failed — is the webapp running?");
    }
    setDeriving(false);
  }

  async function create() {
    if (!topic.trim() || !concept.trim()) {
      alert("Topic and concept are required");
      return;
    }
    setBusy(true);
    setLog("Capturing + scripting…\n");
    const preflopLine = line.split(",").map((s) => s.trim()).filter(Boolean);
    let buf = "";
    try {
      buf = await streamFetch(
        "/api/draft",
        {
          topic: topic.trim(),
          concept: concept.trim(),
          board: board.trim() || undefined,
          preflopLine,
          loadId: loadId.trim() ? Number(loadId.trim()) : undefined,
        },
        setLog
      );
    } catch (e) {
      setLog(String(e));
    }
    setBusy(false);
    const m = buf.match(/__DRAFT__ ([\s\S]+)/);
    if (!m) {
      alert("Draft failed — see logs");
      return;
    }
    onDraft(JSON.parse(m[1].trim()));
  }

  return (
    <div className="card max-w-2xl p-5">
      <h2 className="mb-1 text-lg font-semibold">New reel</h2>
      <p className="mb-3 text-sm text-muted">
        The gto-central webapp dev server must be running on <code className="text-text">:3000</code> for flowchart
        capture.
      </p>

      <div className="label">Topic</div>
      <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="BTN vs BB: the c-bet trap" />

      <div className="label">Concept</div>
      <textarea
        className="input"
        value={concept}
        onChange={(e) => setConcept(e.target.value)}
        placeholder="What the reel teaches…"
      />

      <div className="label">Load ID (optional — auto-fills the line)</div>
      <div className="flex gap-2">
        <input
          className="input"
          value={loadId}
          onChange={(e) => setLoadId(e.target.value)}
          placeholder="68617"
          onKeyDown={(e) => e.key === "Enter" && deriveLine()}
        />
        <button className="btn-ghost whitespace-nowrap" onClick={deriveLine} disabled={deriving || !loadId.trim()}>
          {deriving ? "Deriving…" : "Derive line"}
        </button>
      </div>

      <div className="label">Preflop line (comma-separated)</div>
      <input
        className="input"
        value={line}
        onChange={(e) => setLine(e.target.value)}
        placeholder="Fold, Fold, Fold, Raise 2.5bb, Fold, Call"
      />

      <div className="label">Board (optional)</div>
      <input className="input" value={board} onChange={(e) => setBoard(e.target.value)} placeholder="8h7h4c" />

      <div className="mt-4">
        <button className="btn" disabled={busy} onClick={create}>
          {busy ? "Working…" : "Create draft"}
        </button>
      </div>
      <LogConsole text={log} />
    </div>
  );
}
