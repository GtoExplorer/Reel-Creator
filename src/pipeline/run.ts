import fs from "node:fs";
import path from "node:path";

import { Brief } from "../types.js";
import { ROOT, prepareDraft, buildReel } from "./stages.js";

// CLI: generate a reel end-to-end with AI voiceover (prepare -> build).
async function main() {
  const briefArg = process.argv[2] ?? "briefs/sample-3bet-pot.json";
  const brief = Brief.parse(JSON.parse(fs.readFileSync(path.resolve(ROOT, briefArg), "utf8")));
  console.log(`\n▶ Generating reel for brief "${brief.id}"`);

  const draft = await prepareDraft(brief);
  const outFile = await buildReel(draft);

  console.log(`\n✅ Done. Review before posting:`);
  console.log(`   video:   ${outFile}`);
  console.log(`   caption: ${path.join(path.dirname(outFile), "caption.txt")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
