import { NextResponse } from "next/server";
import { listReels } from "@/src/pipeline/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(listReels());
}
