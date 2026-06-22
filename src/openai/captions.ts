import fs from "node:fs";
import { openai } from "./client.js";
import { config } from "../config.js";
import type { WordTimestamp } from "../types.js";

// Transcribes an mp3 back with word-level timestamps so the renderer can
// animate captions in sync with the voiceover. Returns the words plus the
// audio duration (seconds) used to size the scene.
export async function alignCaptions(
  audioPath: string,
  referenceText?: string
): Promise<{ words: WordTimestamp[]; durationSec: number }> {
  const resp = await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: config.transcribeModel,
    response_format: "verbose_json",
    timestamp_granularities: ["word"],
  });

  const anyResp = resp as unknown as {
    duration?: number;
    words?: { word: string; start: number; end: number }[];
  };
  const words: WordTimestamp[] = restoreReferencePunctuation((anyResp.words ?? []).map((w) => ({
    word: w.word,
    start: w.start,
    end: w.end,
  })), referenceText);
  const lastEnd = words.length ? words[words.length - 1].end : 0;
  const durationSec = (anyResp.duration ?? lastEnd) + 0.4; // small tail
  return { words, durationSec };
}

function restoreReferencePunctuation(words: WordTimestamp[], referenceText?: string): WordTimestamp[] {
  if (!referenceText?.trim() || words.length === 0) return words;

  const refs = referenceText
    .split(/\s+/)
    .map((raw) => ({ raw, norm: normalizeCaptionToken(raw) }))
    .filter((r) => r.norm.length > 0);
  if (refs.length === 0) return words;

  let cursor = 0;
  return words.map((word) => {
    const norm = normalizeCaptionToken(word.word);
    if (!norm) return word;

    const maxLookahead = Math.min(refs.length, cursor + 10);
    let match = -1;
    for (let i = cursor; i < maxLookahead; i++) {
      if (refs[i].norm === norm) {
        match = i;
        break;
      }
    }

    if (match === -1) return word;
    cursor = match + 1;
    return { ...word, word: refs[match].raw };
  });
}

function normalizeCaptionToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/[\u2018\u2019']/g, "")
    .replace(/%/g, "")
    .replace(/[^a-z0-9]+/g, "");
}
