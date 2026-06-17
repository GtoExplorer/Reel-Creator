import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { config } from "../src/config.js";
import { loginContext, preflopLineInteract } from "../src/capture/flowchart.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
fs.mkdirSync(path.join(ROOT, "out"), { recursive: true });

const LINE = ["Fold", "Raise 2bb", "Fold", "Fold", "Raise 11bb", "Fold", "Call"];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1500 }, deviceScaleFactor: 1, colorScheme: "dark" });
page.on("console", (m) => { if (m.type() === "error") console.log("PAGE ERR:", m.text().slice(0, 200)); });
page.on("response", async (r) => {
  const u = r.url();
  if (/gto|tree|subtree|preflop|games/i.test(u)) console.log("RESP", r.status(), u.slice(0, 120));
});
await loginContext(page.context());
await page.goto(config.explorerUrl, { waitUntil: "networkidle", timeout: 60_000 });

try {
  await preflopLineInteract(LINE)(page);
  console.log("line clicked:", LINE.join(" → "));
} catch (e) {
  console.log("line interaction error:", (e as Error).message);
}

// The tree fetch runs CART server-side — wait generously for the nodes.
console.log("waiting for flowchart nodes…");
try {
  await page.waitForSelector(".react-flow__node", { timeout: 180_000 });
  await page.waitForTimeout(2500); // let dagre layout + fitView settle
} catch {
  console.log("no nodes within timeout");
}
const nodeCount = await page.locator(".react-flow__node").count();
console.log(".react-flow present:", await page.locator(".react-flow").count(), "| nodes:", nodeCount);
await page.screenshot({ path: path.join(ROOT, "out", "_explorer-after-line.png") });
if (nodeCount > 0) {
  await page.locator(".react-flow").first().screenshot({ path: path.join(ROOT, "out", "_flowchart.png") });
  console.log("flowchart captured → out/_flowchart.png");
}
await browser.close();
