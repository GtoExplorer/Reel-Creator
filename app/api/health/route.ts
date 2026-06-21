import { NextResponse } from "next/server";
import { authGet } from "@/src/data/solverApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Verifies the solver API proxy can be reached. Flowcharts now render natively
// from API data, so the old Playwright browser health check is no longer needed.
export async function GET() {
  try {
    const res = await authGet("/games/");
    return NextResponse.json({ api: res.ok ? "ok" : "error", status: res.status });
  } catch (e) {
    return NextResponse.json({ api: "error", message: (e as Error).message.split("\n")[0] }, { status: 200 });
  }
}
