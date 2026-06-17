import { NextResponse } from "next/server";
import { narrateFlowchartNodes } from "@/src/openai/script";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { topic, concept, nodes:[{label,summary}] } → { lines: string[] }
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  try {
    const lines = await narrateFlowchartNodes(
      String(b.topic || ""),
      String(b.concept || ""),
      Array.isArray(b.nodes) ? b.nodes : []
    );
    return NextResponse.json({ lines });
  } catch (e) {
    return new NextResponse((e as Error).message, { status: 500 });
  }
}
