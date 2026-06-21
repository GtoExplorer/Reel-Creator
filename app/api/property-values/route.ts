import { NextResponse } from "next/server";
import { fetchPropertyValueOptions } from "@/src/data/solverApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/property-values -> { <property>: [{ value, label }] }
export async function GET() {
  try {
    return NextResponse.json(await fetchPropertyValueOptions());
  } catch {
    return NextResponse.json({});
  }
}
