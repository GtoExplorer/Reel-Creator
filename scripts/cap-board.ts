import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { config } from "../src/config.js";
import { loginContext, preflopLineInteract } from "../src/capture/flowchart.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const out = path.join(ROOT, "out", "_board-real.png");
const line = ["Fold", "Raise 2bb", "Fold", "Fold", "Raise 11bb", "Fold", "Call"];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1500 }, deviceScaleFactor: 2, colorScheme: "dark" });
await loginContext(page.context());
await page.goto(config.explorerUrl, { waitUntil: "networkidle", timeout: 60_000 });
await preflopLineInteract(line)(page);
await page.waitForTimeout(4000);
const btn = page.locator("button", { hasText: "Board Selections" }).first();
await btn.click();
await page.waitForTimeout(2500);
const bb = await btn.locator("xpath=..").boundingBox();
if (bb) await page.screenshot({ path: out, clip: { x: bb.x, y: bb.y, width: bb.width, height: Math.min(bb.height, 560) } });
console.log("saved", out);
await browser.close();
