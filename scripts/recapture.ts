import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { captureFlowchart, preflopLineInteract } from "../src/capture/flowchart.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Re-captures just the flowchart into the pipeline's public path (no OpenAI).
const id = process.argv[2] ?? "3bet-pot-aq-flop";
const publicDir = path.join(ROOT, "public", "reels", id);
fs.mkdirSync(publicDir, { recursive: true });
const line = ["Fold", "Raise 2bb", "Fold", "Fold", "Raise 11bb", "Fold", "Call"];

const res = await captureFlowchart(path.join(publicDir, "flowchart.png"), { interact: preflopLineInteract(line) });
console.log("recaptured flowchart:", res);
