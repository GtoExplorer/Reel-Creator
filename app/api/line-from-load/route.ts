import { NextResponse } from "next/server";
import { lineFromLoadId } from "@/src/data/solverApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/line-from-load?loadId=68617[&gameId=...] → { line: string[] }
export async function GET(req: Request) {
  const loadId = Number(new URL(req.url).searchParams.get("loadId"));
  const gameId = new URL(req.url).searchParams.get("gameId") || undefined;
  if (!loadId) return NextResponse.json({ error: "loadId required" }, { status: 400 });
  try {
    const r = await lineFromLoadId(loadId, gameId);
    if (!r) {
      return NextResponse.json(
        { error: "No line found for that load id (wrong game, or not a postflop-closing load)." },
        { status: 404 }
      );
    }
    return NextResponse.json({ line: r.line, gameId: r.gameId });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
