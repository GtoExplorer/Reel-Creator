import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Brief } from "../src/types.js";
import { fetchSpotData } from "../src/data/solverApi.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const briefPath = path.resolve(ROOT, process.argv[2] ?? "briefs/sample-3bet-pot.json");
const brief = Brief.parse(JSON.parse(fs.readFileSync(briefPath, "utf8")));

const spot = await fetchSpotData(brief);
console.log("label:", spot.label);
console.log("highlight:", spot.highlightLabel);
console.log("categories:");
for (const c of spot.categories) {
  console.log(`  ${c.category.padEnd(16)} ${c.actions.map((a) => `${a.action} ${a.freq}%`).join("  ")}`);
}
