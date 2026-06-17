import path from "node:path";
import { fileURLToPath } from "node:url";
import { captureFlowchart, preflopLineInteract } from "../src/capture/flowchart.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Quick check that a preflop line reaches a flowchart (no OpenAI). Usage:
//   npx tsx scripts/testline.ts "Fold, Fold, Fold, Raise 2.5bb, Fold, Call"
const line = (process.argv[2] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const out = path.join(ROOT, "out", "_testline.png");

const r = await captureFlowchart(out, { interact: preflopLineInteract(line) });
console.log("line:", line.join(" -> "));
console.log("result:", r);
