import { NextResponse } from "next/server";
import { fetchPropertyLabels } from "@/src/data/solverApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/properties → { <property>: <human readable label> } (for the picker)
export async function GET() {
  try {
    return NextResponse.json(await fetchPropertyLabels());
  } catch {
    return NextResponse.json({});
  }
}
