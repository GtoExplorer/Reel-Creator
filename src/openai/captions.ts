import fs from "node:fs";
import { openai } from "./client.js";
import { config } from "../config.js";
import type { WordTimestamp } from "../types.js";

// Transcribes an mp3 back with word-level timestamps so the renderer can
// animate captions in sync with the voiceover. Returns the words plus the
// audio duration (seconds) used to size the scene.
export async function alignCaptions(
  audioPath: string
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
  const words: WordTimestamp[] = (anyResp.words ?? []).map((w) => ({
    word: w.word,
    start: w.start,
    end: w.end,
  }));
  const lastEnd = words.length ? words[words.length - 1].end : 0;
  const durationSec = (anyResp.duration ?? lastEnd) + 0.4; // small tail
  return { words, durationSec };
}
