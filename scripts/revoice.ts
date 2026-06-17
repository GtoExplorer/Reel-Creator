import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RenderManifest } from "../src/types.js";
import { synthesizeVoiceover } from "../src/openai/voiceover.js";
import { alignCaptions } from "../src/openai/captions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Re-synthesises the voiceover for an existing reel with the current TTS
// settings (voice/instructions/speed), re-aligns captions, and updates the
// manifest — no GPT script or flowchart re-capture. Re-render afterwards.
const id = process.argv[2] ?? "3bet-pot-aq-flop";
const manifestPath = path.join(ROOT, "out", id, "manifest.json");
const manifest = RenderManifest.parse(JSON.parse(fs.readFileSync(manifestPath, "utf8")));
const publicDir = path.join(ROOT, "public", "reels", id);

for (let i = 0; i < manifest.scenes.length; i++) {
  const s = manifest.scenes[i];
  const mp3Abs = path.join(publicDir, `scene_${i}.mp3`);
  console.log(`  • Re-voicing scene ${i} (${s.type})`);
  await synthesizeVoiceover(s.voiceover, mp3Abs);
  const { words, durationSec } = await alignCaptions(mp3Abs);
  s.words = words;
  s.durationSec = durationSec;
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log("✅ Re-voiced. Now re-render:\n   npm run render -- out/" + id + "/reel.mp4 --props=out/" + id + "/manifest.json");
