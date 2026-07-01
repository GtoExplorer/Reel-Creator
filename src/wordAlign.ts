import type { WordTimestamp } from "./types.js";

// Shared text/word-timestamp alignment, used to time both drawing-tag overlays
// (drawingAnimations.ts) and per-node camera waypoints (cameraTiming.ts) to the
// real forced-alignment timestamps from synthesizeVoiceover, instead of an
// estimated constant speech rate.

export type Token = {
  raw: string;
  norm: string;
  start: number;
  end: number;
};

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(/\S+/g)) {
    const raw = match[0];
    const norm = normalizeToken(raw);
    if (!norm) continue;
    const start = match.index ?? 0;
    tokens.push({ raw, norm, start, end: start + raw.length });
  }
  return tokens;
}

export function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/[‘’']/g, "")
    .replace(/%/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

// Walks `text`'s tokens against `words` in order, matching each to the next
// word within a small lookahead so a stray mismatch doesn't derail the rest.
export function alignReferenceTokens(text: string, words: WordTimestamp[]): { token: Token; wordIndex: number }[] {
  const tokens = tokenize(text);
  const matches: { token: Token; wordIndex: number }[] = [];
  let cursor = 0;

  for (const token of tokens) {
    const maxLookahead = Math.min(words.length, cursor + 10);
    let match = -1;
    for (let i = cursor; i < maxLookahead; i++) {
      if (normalizeToken(words[i].word) === token.norm) {
        match = i;
        break;
      }
    }
    if (match === -1) continue;
    matches.push({ token, wordIndex: match });
    cursor = match + 1;
  }

  return matches;
}
