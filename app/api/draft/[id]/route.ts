import { NextResponse } from "next/server";
import { loadDraft } from "@/src/pipeline/library";
import { slug } from "@/lib/util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const draft = loadDraft(slug(params.id));
    if (!draft) return new NextResponse("no draft", { status: 404 });
    return NextResponse.json(draft);
  } catch (e) {
    return new NextResponse("Could not load draft: " + (e as Error).message, { status: 500 });
  }
}
