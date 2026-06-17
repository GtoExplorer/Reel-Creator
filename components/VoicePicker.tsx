"use client";
import { useRef, useState } from "react";

export function VoicePicker({
  briefId,
  index,
  clip,
  onSaved,
}: {
  briefId: string;
  index: number;
  clip: string | null;
  onSaved: (path: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);

  async function save(blob: Blob, type: string) {
    const r = await fetch(`/api/audio/${briefId}/${index}`, {
      method: "POST",
      headers: { "Content-Type": type },
      body: blob,
    }).then((res) => res.json());
    if (r.path) onSaved(r.path);
  }

  async function toggleRec() {
    if (recRef.current) {
      recRef.current.stop();
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream);
    const chunks: BlobPart[] = [];
    recRef.current = rec;
    setRecording(true);
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      recRef.current = null;
      setRecording(false);
      await save(new Blob(chunks, { type: "audio/webm" }), "audio/webm");
    };
    rec.start();
  }

  async function upload(file: File | undefined) {
    if (file) await save(file, file.type || "audio/webm");
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">Voice:</span>
      <span className={clip ? "text-muted" : "text-accent font-medium"}>{clip ? "custom clip" : "AI"}</span>
      <button className="btn-ghost btn-mini" onClick={toggleRec}>
        {recording ? "■ Stop" : "● Record"}
      </button>
      <label className="btn-ghost btn-mini cursor-pointer">
        Upload
        <input
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => upload(e.target.files?.[0])}
        />
      </label>
      {clip && <audio controls src={`/${clip}`} className="h-8" />}
    </div>
  );
}
