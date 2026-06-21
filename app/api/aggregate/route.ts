import { NextResponse } from "next/server";
import { fetchCategoryStrategies } from "@/src/data/solverApi";
import { parseSceneFilters } from "@/src/data/filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/aggregate?loadId=&category=&street=flop → { categories, label }
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const loadId = Number(sp.get("loadId"));
  const category = sp.get("category") || "";
  const street = sp.get("street") || "flop";
  const filters = parseSceneFilters(sp.get("filters"));
  if (!loadId || !category) return NextResponse.json({ error: "loadId and category required" }, { status: 400 });
  try {
    const r = await fetchCategoryStrategies(loadId, street, category, filters);
    if (!r) return NextResponse.json({ error: "No data for that property on this load." }, { status: 404 });
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
