"use client";
import { useEffect, useId, useMemo, useState } from "react";
import type { DraftScene, DrawingAnimation } from "@/src/types";
import { orderCategoryRows } from "@/src/barRows";

type Shape = DrawingAnimation["shape"];

function nextDrawingId(drawings: DrawingAnimation[]): string {
  const used = new Set(drawings.map((d) => d.id.toLowerCase()));
  for (let i = 1; i < 100; i++) {
    const id = `a${i}`;
    if (!used.has(id)) return id;
  }
  return `a${drawings.length + 1}`;
}

function hasTag(text: string, id: string): boolean {
  return new RegExp(`<\\s*${id}\\s*>`, "i").test(text);
}

function drawingSummary(d: DrawingAnimation): string {
  if (d.target.kind === "preflopHand") return d.target.hand;
  if (d.target.kind === "barRange") return d.target.from === d.target.to ? d.target.from : `${d.target.from} to ${d.target.to}`;
  return d.target.from === d.target.to ? d.target.from : `${d.target.from} to ${d.target.to}`;
}

export function DrawingAnimationControls({ scene, onChange }: { scene: DraftScene; onChange: (patch: Partial<DraftScene>) => void }) {
  const uid = useId().replace(/:/g, "");
  const drawings = scene.drawings ?? [];
  const nextId = nextDrawingId(drawings);
  const [shape, setShape] = useState<Shape>("rect");
  const [drawSec, setDrawSec] = useState("0.35");
  const [padding, setPadding] = useState("12");
  const [hand, setHand] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const handOptions = useMemo(() => (scene.rangeGrid ?? []).map((c) => c.combo), [scene.rangeGrid]);
  const barOptions = useMemo(() => orderCategoryRows(scene.categories ?? [], scene.category).map((c) => c.category), [scene.categories, scene.category]);
  const freqOptions = useMemo(() => (scene.freqBars ?? []).map((b) => b.action), [scene.freqBars]);
  const rangeOptions = scene.type === "freqBars" ? freqOptions : barOptions;
  const canDraw = scene.type === "preflopMatrix" || scene.type === "barCharts" || scene.type === "freqBars";

  useEffect(() => {
    if (scene.type === "preflopMatrix") {
      setHand((h) => h || handOptions[0] || "");
      return;
    }
    const first = rangeOptions[0] || "";
    setFrom((v) => (rangeOptions.includes(v) ? v : first));
    setTo((v) => (rangeOptions.includes(v) ? v : first));
  }, [scene.type, handOptions, rangeOptions]);

  if (!canDraw) return null;

  function addDrawing() {
    const parsedDrawSec = Number(drawSec);
    const parsedPadding = Number(padding);
    const base = {
      id: nextId,
      shape,
      drawSec: Number.isFinite(parsedDrawSec) && parsedDrawSec > 0 ? parsedDrawSec : 0.35,
      padding: Number.isFinite(parsedPadding) && parsedPadding >= 0 ? parsedPadding : 12,
    };

    let drawing: DrawingAnimation | null = null;
    if (scene.type === "preflopMatrix") {
      const cleanHand = hand.trim();
      if (!cleanHand) return;
      drawing = { ...base, target: { kind: "preflopHand", hand: cleanHand } };
    } else if (scene.type === "barCharts") {
      if (!from || !to) return;
      drawing = { ...base, target: { kind: "barRange", from, to } };
    } else if (scene.type === "freqBars") {
      if (!from || !to) return;
      drawing = { ...base, target: { kind: "freqRange", from, to } };
    }

    if (!drawing) return;
    onChange({ drawings: [...drawings, drawing] });
  }

  function updateDrawing(index: number, patch: Partial<DrawingAnimation>) {
    onChange({ drawings: drawings.map((d, i) => (i === index ? { ...d, ...patch } : d)) });
  }

  function deleteDrawing(index: number) {
    onChange({ drawings: drawings.filter((_, i) => i !== index) });
  }

  return (
    <div className="mt-3 rounded-lg border border-line p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="label">Drawing animations</div>
          <div className="text-xs text-muted">Add a target, then wrap the spoken words with its tag.</div>
        </div>
        <div className="rounded-md border border-line px-2 py-1 text-xs text-muted">Next: &lt;{nextId}&gt;</div>
      </div>

      <div className="flex flex-col gap-2">
        {drawings.length === 0 && <div className="text-xs text-muted">No drawing animations yet.</div>}
        {drawings.map((d, i) => (
          <div key={`${d.id}:${i}`} className="rounded-md border border-line bg-bg/40 p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {d.id}: {d.shape} around {drawingSummary(d)}
                </div>
                <code className="text-xs text-muted">&lt;{d.id}&gt;spoken words&lt;/{d.id}&gt;</code>
              </div>
              <button className="btn-ghost btn-mini" onClick={() => deleteDrawing(i)}>
                Delete
              </button>
            </div>
            {!hasTag(scene.voiceover, d.id) && <div className="mt-1 text-xs text-amber-200">This tag is not in the voiceover yet.</div>}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <select className="input" value={d.shape} onChange={(e) => updateDrawing(i, { shape: e.target.value as Shape })}>
                <option value="rect">Rectangle</option>
                <option value="circle">Circle</option>
              </select>
              <input
                className="input"
                type="number"
                min="0.1"
                step="0.05"
                value={d.drawSec}
                onChange={(e) => updateDrawing(i, { drawSec: Number(e.target.value) || 0.35 })}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <select className="input" value={shape} onChange={(e) => setShape(e.target.value as Shape)}>
          <option value="rect">Rectangle</option>
          <option value="circle">Circle</option>
        </select>
        <input className="input" type="number" min="0.1" step="0.05" value={drawSec} onChange={(e) => setDrawSec(e.target.value)} />
        {scene.type === "preflopMatrix" ? (
          <input
            className="input"
            list={`${uid}-hands`}
            value={hand}
            onChange={(e) => setHand(e.target.value)}
            placeholder="Hand, e.g. AKo"
          />
        ) : (
          <>
            <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="">Top</option>
              {rangeOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">Bottom</option>
              {rangeOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </>
        )}
        <input className="input" type="number" min="0" step="1" value={padding} onChange={(e) => setPadding(e.target.value)} placeholder="Padding" />
        <button className="btn-ghost btn-mini" onClick={addDrawing}>
          Add drawing
        </button>
      </div>
      <datalist id={`${uid}-hands`}>
        {handOptions.map((h) => (
          <option key={h} value={h} />
        ))}
      </datalist>
    </div>
  );
}
