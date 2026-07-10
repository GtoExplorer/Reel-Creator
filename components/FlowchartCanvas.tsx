"use client";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { FlowchartLayout } from "@/src/types";
import { FlowchartView } from "@/src/flowchart/FlowchartView";

// Shared scrollable + zoomable canvas for the flowchart editing UIs (tree
// editor + camera picker). The tree pane keeps the layout's aspect ratio, so
// %-positioned overlay markers track the zoom for free. Opens fitted to the
// box; − / Fit / + controls sit in the corner.
export function FlowchartCanvas({
  layout,
  maxHeight = 440,
  overlay,
}: {
  layout: FlowchartLayout;
  maxHeight?: number;
  overlay?: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const aspect = layout.width / layout.height;

  // Pane width at which the whole tree fits the visible box (both dimensions).
  const fit = () => {
    const el = scrollRef.current;
    if (!el) return;
    setWidth(Math.max(240, Math.min(el.clientWidth - 2, Math.round((maxHeight - 2) * aspect))));
  };

  // Fit on mount and whenever the tree changes shape (expand/collapse/rebuild).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(fit, [layout.width, layout.height]);

  function zoom(factor: number) {
    const el = scrollRef.current;
    if (!el) return;
    const cur = width ?? el.clientWidth;
    const next = Math.max(240, Math.min(8000, Math.round(cur * factor)));
    if (next === cur) return;
    // Keep the visible centre stable across the resize.
    const ratio = next / cur;
    const left = (el.scrollLeft + el.clientWidth / 2) * ratio - el.clientWidth / 2;
    const top = (el.scrollTop + el.clientHeight / 2) * ratio - el.clientHeight / 2;
    setWidth(next);
    requestAnimationFrame(() => {
      el.scrollLeft = left;
      el.scrollTop = top;
    });
  }

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="overflow-auto overscroll-contain rounded-lg border border-line bg-black"
        style={{ maxHeight }}
      >
        <div
          className="relative mx-auto"
          style={{ width: width ? `${width}px` : "100%", aspectRatio: `${layout.width} / ${layout.height}` } as CSSProperties}
        >
          <FlowchartView layout={layout} />
          <div className="absolute inset-0">{overlay}</div>
        </div>
      </div>
      <div className="absolute right-2 top-2 z-20 flex items-stretch overflow-hidden rounded-lg border border-line bg-black/85 text-xs text-muted shadow-lg">
        <button
          type="button"
          className="px-2.5 py-1 font-bold hover:bg-white/5 hover:text-accent"
          onClick={() => zoom(1 / 1.35)}
          title="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          className="border-x border-line px-2 py-1 hover:bg-white/5 hover:text-accent"
          onClick={fit}
          title="Fit whole tree"
        >
          Fit
        </button>
        <button
          type="button"
          className="px-2.5 py-1 font-bold hover:bg-white/5 hover:text-accent"
          onClick={() => zoom(1.35)}
          title="Zoom in"
        >
          +
        </button>
      </div>
    </div>
  );
}
