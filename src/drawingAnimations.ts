import type { DrawingAnimation, TimedDrawingAnimation, WordTimestamp } from "./types.js";
import { alignReferenceTokens } from "./wordAlign.js";

type TagRange = {
  id: string;
  startChar: number;
  endChar: number;
};

const TAG_RE = /<\s*(\/|\\)?\s*(a\d+)\s*>/gi;

export function parseAnimationTags(text: string): { cleanText: string; ranges: TagRange[] } {
  const ranges: TagRange[] = [];
  const active = new Map<string, number[]>();
  let cleanText = "";
  let cursor = 0;

  for (const match of text.matchAll(TAG_RE)) {
    const raw = match[0];
    const marker = match[1];
    const id = match[2].toLowerCase();
    const index = match.index ?? 0;
    cleanText += text.slice(cursor, index);
    cursor = index + raw.length;

    if (marker) {
      const stack = active.get(id);
      const startChar = stack?.pop();
      if (startChar != null) ranges.push({ id, startChar, endChar: cleanText.length });
      if (stack && stack.length === 0) active.delete(id);
      continue;
    }

    const stack = active.get(id) ?? [];
    stack.push(cleanText.length);
    active.set(id, stack);
  }

  cleanText += text.slice(cursor);
  for (const [id, starts] of active) {
    for (const startChar of starts) ranges.push({ id, startChar, endChar: cleanText.length });
  }

  return { cleanText: cleanText.replace(/[ \t]+\n/g, "\n"), ranges };
}

export function stripAnimationTags(text: string): string {
  return parseAnimationTags(text).cleanText;
}

export function resolveDrawingTimings(
  drawings: DrawingAnimation[] | undefined,
  taggedText: string,
  words: WordTimestamp[],
  durationSec: number
): TimedDrawingAnimation[] {
  if (!drawings?.length) return [];
  const { cleanText, ranges } = parseAnimationTags(taggedText);
  if (!ranges.length) return [];

  const drawingsById = new Map(drawings.map((d) => [d.id.toLowerCase(), d]));
  const tokenMatches = alignReferenceTokens(cleanText, words);

  return ranges.flatMap((range) => {
    const drawing = drawingsById.get(range.id);
    if (!drawing) return [];

    const overlap = tokenMatches.filter((m) => m.token.end > range.startChar && m.token.start < range.endChar);
    let startSec: number;
    let endSec: number;
    if (overlap.length) {
      startSec = words[overlap[0].wordIndex]?.start ?? 0;
      endSec = words[overlap[overlap.length - 1].wordIndex]?.end ?? startSec;
    } else {
      startSec = charToSeconds(range.startChar, cleanText.length, durationSec);
      endSec = charToSeconds(range.endChar, cleanText.length, durationSec);
    }

    const drawSec = drawing.drawSec ?? 0.35;
    return [{
      ...drawing,
      id: drawing.id.toLowerCase(),
      drawSec,
      startSec: clamp(startSec, 0, durationSec),
      endSec: clamp(Math.max(endSec, startSec + drawSec + 0.15), 0, durationSec),
    }];
  });
}

function charToSeconds(char: number, totalChars: number, durationSec: number): number {
  if (!totalChars || !durationSec) return 0;
  return (char / totalChars) * durationSec;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
