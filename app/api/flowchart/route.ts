import { NextResponse } from "next/server";
import { buildFlowchart } from "@/src/flowchart/build";
import { parseSceneFilters } from "@/src/data/filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/flowchart?loadId=&street=flop&filters=[...]
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const loadId = Number(sp.get("loadId"));
  const street = sp.get("street") || "flop";
  const direction = sp.get("direction") === "LR" ? "LR" : "TB";
  const filters = parseSceneFilters(sp.get("filters"));
  if (!loadId) return NextResponse.json({ error: "loadId required" }, { status: 400 });
  try {
    const r = await buildFlowchart(loadId, street, 5, filters, direction);
    if (!r) return NextResponse.json({ error: "No flowchart for that load/filter combination." }, { status: 404 });
    return NextResponse.json({ flowchart: r.layout, nodes: r.nodes });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
