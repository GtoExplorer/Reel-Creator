import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { RenderScene, FreqBar } from "../../types.js";
import { theme } from "../theme.js";
import { KIND_ORDER, actionColor, sortActions } from "../../poker/ranges.js";

const KIND_LABEL: Record<FreqBar["kind"], string> = {
  raise: "Raise",
  bet: "Bet",
  call: "Call",
  check: "Check",
  fold: "Fold",
};

const Legend: React.FC<{ kinds: FreqBar["kind"][] }> = ({ kinds }) => (
  <div style={{ display: "flex", gap: 30, marginTop: 44, justifyContent: "center", flexWrap: "wrap" }}>
    {kinds.map((k) => (
      <div key={k} style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: theme.action[k] }} />
        <span style={{ fontSize: 30, fontWeight: 700, color: theme.muted }}>{KIND_LABEL[k]}</span>
      </div>
    ))}
  </div>
);

export const StrategyBarsScene: React.FC<{ scene: RenderScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cats = scene.categories ?? [];
  const kindsPresent = KIND_ORDER.filter((k) => cats.some((c) => c.actions.some((a) => a.kind === k)));

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ fontSize: 52, fontWeight: 800, color: theme.text, textAlign: "center", marginBottom: 56, letterSpacing: -1 }}>
        {scene.headline || "Strategy by hand strength"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {cats.map((c, i) => {
          const grow = spring({ frame, fps, delay: 4 + i * 4, config: { damping: 200 } });
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)", alignItems: "center", columnGap: 24 }}>
              <div style={{ textAlign: "right", whiteSpace: "nowrap", fontSize: 34, fontWeight: 700, color: theme.text }}>
                {c.category}
              </div>
              <div style={{ width: 540, height: 52, borderRadius: 12, backgroundColor: theme.surface, border: `1px solid ${theme.surfaceBorder}`, overflow: "hidden" }}>
                <div style={{ display: "flex", height: "100%", width: "100%", transform: `scaleX(${grow})`, transformOrigin: "left" }}>
                  {sortActions(c.actions).map((a, j) => (
                    <div key={j} style={{ width: `${a.freq}%`, height: "100%", backgroundColor: actionColor(a.action) }} />
                  ))}
                </div>
              </div>
              <div />
            </div>
          );
        })}
      </div>
      <Legend kinds={kindsPresent} />
      {scene.subtext ? (
        <div style={{ marginTop: 30, textAlign: "center", fontSize: 30, fontWeight: 600, color: theme.muted }}>
          {scene.subtext}
        </div>
      ) : null}
    </div>
  );
};
