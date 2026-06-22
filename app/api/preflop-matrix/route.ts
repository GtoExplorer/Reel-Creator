import { NextResponse } from "next/server";
import { fetchPreflopMatrixForLine, fetchPreflopMatrixForLoad } from "@/src/data/solverApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/preflop-matrix?line=Fold,Fold,Raise%202.5bb[&gameId=...]
// Legacy fallback: /api/preflop-matrix?loadId=68617[&gameId=...]
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const hasLine = sp.has("line");
  const line = (sp.get("line") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const loadId = Number(sp.get("loadId"));
  const gameId = sp.get("gameId") || undefined;
  if (!hasLine && !loadId) return NextResponse.json({ error: "preflop line required" }, { status: 400 });
  try {
    const r = hasLine ? await fetchPreflopMatrixForLine(line, gameId) : await fetchPreflopMatrixForLoad(loadId, gameId);
    if (!r) {
      return NextResponse.json(
        { error: "No preflop range found for that action sequence/game." },
        { status: 404 }
      );
    }
    return NextResponse.json({ rangeGrid: r.grid, label: r.label, line: r.line, gameId: r.gameId });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
