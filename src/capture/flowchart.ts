import { chromium, type BrowserContext, type Page } from "playwright";
import path from "node:path";
import { config } from "../config.js";
import { mintSession } from "./session.js";

// Hardening args so the headless shell doesn't "Page crashed" on the heavy
// Explorer page (no /dev/shm, software GL, no sandbox).
const LAUNCH_OPTS = {
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-software-rasterizer"],
};

export type FlowNode = { label: string; cx: number; cy: number; summary?: string; kind?: "split" | "strategy" | "edge"; edge?: string };
export type CaptureResult =
  | { ok: true; width: number; height: number; loadId?: number; nodes?: FlowNode[] }
  | { ok: false; reason: string };

// Hides React Flow's own chrome plus the app's custom overlay divs (filter bar,
// External-filters switch, direction toggle, pan/zoom hints).
const HIDE_CHROME_CSS =
  ".react-flow__controls,.react-flow__panel,.react-flow__attribution{display:none!important}" +
  '.react-flow > div:not([class*="react-flow__"]){display:none!important}';

// Injects a minted gtoc_session cookie so the browser lands on /explorer already
// logged in. No-op if no session secret is configured.
export async function loginContext(context: BrowserContext): Promise<void> {
  if (!config.explorerSessionSecret || !config.explorerLoginEmail) return;
  const token = await mintSession(config.explorerLoginEmail, config.explorerSessionSecret);
  const origin = new URL(config.explorerUrl).origin;
  await context.addCookies([
    { name: "gtoc_session", value: token, url: origin, httpOnly: true, sameSite: "Lax" },
  ]);
}

// Drives the Explorer's preflop line so a postflop load is selected and the
// flowchart mounts. `line` is the action label to click at each seat in order,
// e.g. ["Fold","Raise 2bb","Fold","Fold","Raise 11bb","Fold","Call"].
export function preflopLineInteract(line: string[]) {
  return async (page: Page) => {
    for (let level = 0; level < line.length; level++) {
      const boxes = page.locator('button:has(span[role="button"])');
      const box = boxes.nth(level);
      await box.waitFor({ state: "visible", timeout: 20_000 });
      await box.getByText(line[level], { exact: true }).first().click();
      await page.waitForTimeout(500);
    }
  };
}

// Waits for the loaded tree, frames the whole thing (the app only auto-frames the
// top layers), hides chrome, and screenshots the clean pane.
async function captureFlowchartPane(page: Page, outPath: string): Promise<CaptureResult> {
  await page.waitForSelector(config.flowchartReadySelector, { timeout: 180_000 });
  await page.waitForTimeout(2500);
  await page.locator(".react-flow__controls-fitview").click({ timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(900);
  await page.addStyleTag({ content: HIDE_CHROME_CSS });
  await page.waitForTimeout(300);
  const el = page.locator(config.flowchartSelector).first();
  const box = await el.boundingBox();
  if (!box) return { ok: false, reason: "flowchart element had no bounding box" };

  // Record each node's label + normalised centre within the captured image, so
  // the reel's camera can target specific nodes.
  const nodes: FlowNode[] = await page.evaluate((sel) => {
    const pane = document.querySelector(sel)?.getBoundingClientRect();
    if (!pane) return [];

    // Edge-condition chips (the branch labels) live in a portal and sit just
    // above the node they lead INTO. Collect them, then match each node to the
    // nearest chip above it = the decision that reaches that node.
    const chips = Array.from(document.querySelectorAll(".react-flow__edgelabel-renderer > div"))
      .map((el) => {
        const b = (el as HTMLElement).getBoundingClientRect();
        return { text: ((el as HTMLElement).textContent || "").replace(/\s+/g, " ").trim(), cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
      })
      .filter((c) => c.text);

    const nodeEntries = Array.from(document.querySelectorAll(".react-flow__node"))
      .map((n, i) => {
        const b = (n as HTMLElement).getBoundingClientRect();
        // The branch label that leads INTO this node = nearest chip above it.
        // (Inlined, not a named helper — keeps esbuild's __name out of evaluate.)
        let edge: string | undefined;
        let bestEdgeD = Infinity;
        for (const c of chips) {
          const dx = Math.abs(c.cx - (b.x + b.width / 2));
          const dy = b.y - c.cy;
          if (dy < -12 || dy > 220 || dx > b.width) continue;
          const d = dx + dy;
          if (d < bestEdgeD) { bestEdgeD = d; edge = c.text; }
        }
        // Split nodes show the feature they decide on in a big (text-[28px]) title.
        // Strategy nodes (collapsed) have no such title — they show "Strategy" + an
        // action legend, so build a label from that instead of "Node N".
        const splitTitle = (n.querySelector('p[class*="text-[28px]"]')?.textContent || "").replace(/\s+/g, " ").trim();
        const full = ((n as HTMLElement).innerText || "").replace(/\s+/g, " ").trim();
        const kind: "split" | "strategy" = splitTitle ? "split" : "strategy";
        let label: string;
        if (splitTitle) {
          label = splitTitle;
        } else {
          const legend = full.replace(/^Strategy/i, "").replace(/click to explore.*$/i, "").trim();
          label = legend ? `Strategy · ${legend.slice(0, 40)}` : `Strategy ${i + 1}`;
        }
        return {
          label,
          kind,
          edge,
          cx: +((b.x + b.width / 2 - pane.left) / pane.width).toFixed(4),
          cy: +((b.y + b.height / 2 - pane.top) / pane.height).toFixed(4),
          summary: full.slice(0, 180),
        };
      })
      .filter((n) => n.cx >= 0 && n.cx <= 1 && n.cy >= 0 && n.cy <= 1);

    // Edge decision-points as their own pickable stopovers (kind "edge").
    const edgeEntries = chips
      .map((c) => ({
        label: c.text,
        kind: "edge" as const,
        edge: c.text,
        cx: +((c.cx - pane.left) / pane.width).toFixed(4),
        cy: +((c.cy - pane.top) / pane.height).toFixed(4),
        summary: `Decision branch: ${c.text}`,
      }))
      .filter((e) => e.cx >= 0 && e.cx <= 1 && e.cy >= 0 && e.cy <= 1);

    return [...nodeEntries, ...edgeEntries];
  }, config.flowchartSelector);

  await el.screenshot({ path: outPath });
  return { ok: true, width: Math.round(box.width), height: Math.round(box.height), nodes };
}

// Single-asset flowchart capture (used by the recapture helper).
export async function captureFlowchart(
  outPath: string,
  opts: { interact?: (page: Page) => Promise<void> } = {}
): Promise<CaptureResult> {
  const browser = await chromium.launch(LAUNCH_OPTS);
  try {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 1500 },
      deviceScaleFactor: 2,
      colorScheme: "dark",
    });
    // Sniff the selected load id from the data calls the Explorer fires.
    let loadId: number | undefined;
    page.on("response", (r) => {
      const m = r.url().match(/\/loads\/(\d+)\/strategies/) ?? r.url().match(/\/tree\/(\d+)\//);
      if (m) loadId = Number(m[1]);
    });
    await loginContext(page.context());
    await page.goto(config.explorerUrl, { waitUntil: "networkidle", timeout: 60_000 });
    if (opts.interact) await opts.interact(page);
    const res = await captureFlowchartPane(page, outPath);
    return res.ok ? { ...res, loadId } : res;
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  } finally {
    await browser.close();
  }
}

export interface ExplorerAssets {
  preflopMatrix?: string; // paths relative to public/
  flowchart?: string;
  boardSelections?: string;
}

// Captures the preflop range matrix, the flowchart, and the Board Selections
// charts in ONE Explorer session. Returns whichever succeeded (paths relative to
// public/). Never throws — missing assets just fall back to native scenes.
export async function captureExplorerAssets(
  publicDir: string,
  id: string,
  opts: { line?: string[] } = {}
): Promise<ExplorerAssets> {
  const out: ExplorerAssets = {};
  const browser = await chromium.launch(LAUNCH_OPTS);
  try {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 1500 },
      deviceScaleFactor: 2,
      colorScheme: "dark",
    });
    await loginContext(page.context());
    await page.goto(config.explorerUrl, { waitUntil: "networkidle", timeout: 60_000 });

    // 1) Preflop range matrix (rendered on load, before the line narrows it).
    try {
      const grid = page.locator('[style*="repeat(13"]').first();
      await grid.waitFor({ state: "visible", timeout: 30_000 });
      await page.waitForTimeout(500);
      await grid.screenshot({ path: path.join(publicDir, "preflop-matrix.png") });
      out.preflopMatrix = `reels/${id}/preflop-matrix.png`;
    } catch (e) {
      console.warn("    ⚠ preflop matrix capture failed:", (e as Error).message);
    }

    // 2) Drive the preflop line to select the postflop load.
    if (opts.line?.length) await preflopLineInteract(opts.line)(page);

    // 3) Flowchart.
    const fc = await captureFlowchartPane(page, path.join(publicDir, "flowchart.png"));
    if (fc.ok) out.flowchart = `reels/${id}/flowchart.png`;
    else console.warn("    ⚠ flowchart capture failed:", fc.reason);

    // 4) Board Selections (expand the collapsible, then shoot the panel).
    try {
      const btn = page.locator("button", { hasText: "Board Selections" }).first();
      await btn.waitFor({ state: "visible", timeout: 15_000 });
      await btn.click();
      await page.waitForTimeout(1500);
      const boxRoot = btn.locator("xpath=..");
      await boxRoot.screenshot({ path: path.join(publicDir, "board-selections.png") });
      out.boardSelections = `reels/${id}/board-selections.png`;
    } catch (e) {
      console.warn("    ⚠ board selections capture failed:", (e as Error).message);
    }

    return out;
  } catch (e) {
    console.warn("    ⚠ explorer capture session failed:", (e as Error).message);
    return out;
  } finally {
    await browser.close();
  }
}
