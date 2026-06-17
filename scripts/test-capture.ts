import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { captureFlowchart } from "../src/capture/flowchart.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const out = path.join(ROOT, "public", "reels", "_test", "flowchart.png");
fs.mkdirSync(path.dirname(out), { recursive: true });

const res = await captureFlowchart(out);
console.log("capture result:", res);
