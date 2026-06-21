import { NextResponse } from "next/server";
import { fetchPreflopMatrixForLoad } from "@/src/data/solverApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/preflop-matrix?loadId=68617[&gameId=...] -> { rangeGrid, label, line, gameId }
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const loadId = Number(sp.get("loadId"));
  const gameId = sp.get("gameId") || undefined;
  if (!loadId) return NextResponse.json({ error: "loadId required" }, { status: 400 });
  try {
    const r = await fetchPreflopMatrixForLoad(loadId, gameId);
    if (!r) {
      return NextResponse.json(
        { error: "No preflop range found for that load id (wrong game, or not a postflop-closing load)." },
        { status: 404 }
      );
    }
    return NextResponse.json({ rangeGrid: r.grid, label: r.label, line: r.line, gameId: r.gameId });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
