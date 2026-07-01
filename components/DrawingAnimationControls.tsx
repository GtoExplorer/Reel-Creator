"use client";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      {children}
    </label>
  );
}

export function DrawingAnimationControls({ scene, onChange }: { scene: DraftScene; onChange: (patch: Partial<DraftScene>) => void }) {
  const uid = useId().replace(/:/g, "");
  const drawings = scene.drawings ?? [];
  const nextId = nextDrawingId(drawings);
  const [shape, setShape] = useState<Shape>("rect");
  const [drawSec, setDrawSec] = useState("0.35");
  const [padding, setPadding] = useState("12");
  const [paddingLeft, setPaddingLeft] = useState("");
  const [paddingRight, setPaddingRight] = useState("");
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
    const parsedPaddingLeft = Number(paddingLeft);
    const parsedPaddingRight = Number(paddingRight);
    const base = {
      id: nextId,
      shape,
      drawSec: Number.isFinite(parsedDrawSec) && parsedDrawSec > 0 ? parsedDrawSec : 0.35,
      padding: Number.isFinite(parsedPadding) && parsedPadding >= 0 ? parsedPadding : 12,
      ...(paddingLeft.trim() && Number.isFinite(parsedPaddingLeft) && parsedPaddingLeft >= 0 ? { paddingLeft: parsedPaddingLeft } : {}),
      ...(paddingRight.trim() && Number.isFinite(parsedPaddingRight) && parsedPaddingRight >= 0 ? { paddingRight: parsedPaddingRight } : {}),
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

  function updateHand(index: number, newHand: string) {
    onChange({
      drawings: drawings.map((d, i) => (i === index && d.target.kind === "preflopHand" ? { ...d, target: { ...d.target, hand: newHand } } : d)),
    });
  }

  function updateRange(index: number, patch: { from?: string; to?: string }) {
    onChange({
      drawings: drawings.map((d, i) =>
        i === index && (d.target.kind === "barRange" || d.target.kind === "freqRange") ? { ...d, target: { ...d.target, ...patch } } : d
      ),
    });
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
              <Field label="Shape">
                <select className="input" value={d.shape} onChange={(e) => updateDrawing(i, { shape: e.target.value as Shape })}>
                  <option value="rect">Rectangle</option>
                  <option value="circle">Circle</option>
                </select>
              </Field>
              <Field label="Draw duration (sec)">
                <input
                  className="input"
                  type="number"
                  min="0.1"
                  step="0.05"
                  value={d.drawSec}
                  onChange={(e) => updateDrawing(i, { drawSec: Number(e.target.value) || 0.35 })}
                />
              </Field>
              {d.target.kind === "preflopHand" ? (
                <Field label="Hand">
                  <input
                    className="input"
                    list={`${uid}-hands`}
                    value={d.target.hand}
                    onChange={(e) => updateHand(i, e.target.value)}
                  />
                </Field>
              ) : (
                <>
                  <Field label="Top row">
                    <select className="input" value={d.target.from} onChange={(e) => updateRange(i, { from: e.target.value })}>
                      {rangeOptions.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Bottom row">
                    <select className="input" value={d.target.to} onChange={(e) => updateRange(i, { to: e.target.value })}>
                      {rangeOptions.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </Field>
                </>
              )}
              <Field label="Padding">
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="1"
                  value={d.padding}
                  onChange={(e) => updateDrawing(i, { padding: Number(e.target.value) || 0 })}
                />
              </Field>
              <Field label="Padding left (override)">
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="same as padding"
                  value={d.paddingLeft ?? ""}
                  onChange={(e) => updateDrawing(i, { paddingLeft: e.target.value === "" ? undefined : Number(e.target.value) })}
                />
              </Field>
              <Field label="Padding right (override)">
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="same as padding"
                  value={d.paddingRight ?? ""}
                  onChange={(e) => updateDrawing(i, { paddingRight: e.target.value === "" ? undefined : Number(e.target.value) })}
                />
              </Field>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label="Shape">
          <select className="input" value={shape} onChange={(e) => setShape(e.target.value as Shape)}>
            <option value="rect">Rectangle</option>
            <option value="circle">Circle</option>
          </select>
        </Field>
        <Field label="Draw duration (sec)">
          <input className="input" type="number" min="0.1" step="0.05" value={drawSec} onChange={(e) => setDrawSec(e.target.value)} />
        </Field>
        {scene.type === "preflopMatrix" ? (
          <Field label="Hand">
            <input
              className="input"
              list={`${uid}-hands`}
              value={hand}
              onChange={(e) => setHand(e.target.value)}
              placeholder="Hand, e.g. AKo"
            />
          </Field>
        ) : (
          <>
            <Field label="Top row">
              <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
                <option value="">Top</option>
                {rangeOptions.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Bottom row">
              <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">Bottom</option>
                {rangeOptions.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
        <Field label="Padding">
          <input className="input" type="number" min="0" step="1" value={padding} onChange={(e) => setPadding(e.target.value)} placeholder="Padding" />
        </Field>
        <Field label="Padding left (override)">
          <input
            className="input"
            type="number"
            min="0"
            step="1"
            value={paddingLeft}
            onChange={(e) => setPaddingLeft(e.target.value)}
            placeholder="same as padding"
          />
        </Field>
        <Field label="Padding right (override)">
          <input
            className="input"
            type="number"
            min="0"
            step="1"
            value={paddingRight}
            onChange={(e) => setPaddingRight(e.target.value)}
            placeholder="same as padding"
          />
        </Field>
        <div className="flex items-end">
          <button className="btn-ghost btn-mini w-full" onClick={addDrawing}>
            Add drawing
          </button>
        </div>
      </div>
      <datalist id={`${uid}-hands`}>
        {handOptions.map((h) => (
          <option key={h} value={h} />
        ))}
      </datalist>
    </div>
  );
}
