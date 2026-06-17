import { NextResponse } from "next/server";
import { narrateBars } from "@/src/openai/script";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { topic, concept, property, categories } → { voiceover, subtext }
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  try {
    const r = await narrateBars(
      String(b.topic || ""),
      String(b.concept || ""),
      String(b.property || "this property"),
      Array.isArray(b.categories) ? b.categories : []
    );
    return NextResponse.json(r);
  } catch (e) {
    return new NextResponse((e as Error).message, { status: 500 });
  }
}
