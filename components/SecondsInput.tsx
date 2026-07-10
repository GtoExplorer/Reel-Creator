"use client";
import { useEffect, useState } from "react";

// Small numeric field for second values (scene holds, camera pauses). Commits
// every valid keystroke; resets to the current value on blur if left invalid.
export function SecondsInput({
  value,
  onCommit,
  max = 30,
}: {
  value: number;
  onCommit: (s: number) => void;
  max?: number;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      type="number"
      min={0}
      max={max}
      step={0.1}
      className="input !mb-0 !w-[4.5rem] !px-1.5 !py-0.5 text-right"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v) && v >= 0 && v <= max) onCommit(Math.round(v * 100) / 100);
      }}
      onBlur={() => setText(String(value))}
    />
  );
}
