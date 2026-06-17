import { NextResponse } from "next/server";
import { narrateFlowchart } from "@/src/openai/script";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  try {
    const voiceover = await narrateFlowchart(
      String(b.topic || ""),
      String(b.concept || ""),
      Array.isArray(b.nodes) ? b.nodes : []
    );
    return NextResponse.json({ voiceover });
  } catch (e) {
    return new NextResponse((e as Error).message, { status: 500 });
  }
}
