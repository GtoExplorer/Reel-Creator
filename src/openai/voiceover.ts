import fs from "node:fs";
import { openai } from "./client.js";
import { config } from "../config.js";

// Synthesises one scene's narration to an mp3 on disk.
export async function synthesizeVoiceover(text: string, outPath: string): Promise<void> {
  const resp = await openai.audio.speech.create({
    model: config.ttsModel,
    voice: config.ttsVoice as never,
    input: text,
    response_format: "mp3",
    speed: config.ttsSpeed,
    instructions: config.ttsInstructions,
  });
  const buf = Buffer.from(await resp.arrayBuffer());
  fs.writeFileSync(outPath, buf);
}
