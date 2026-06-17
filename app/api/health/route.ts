import { NextResponse } from "next/server";
import { chromium } from "playwright";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Verifies the Playwright browser launches, so the studio can surface a clear
// status dot instead of failing mid-capture.
export async function GET() {
  try {
    const b = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
    await b.close();
    return NextResponse.json({ browser: "ok" });
  } catch (e) {
    return NextResponse.json({ browser: "error", message: (e as Error).message.split("\n")[0] }, { status: 200 });
  }
}
