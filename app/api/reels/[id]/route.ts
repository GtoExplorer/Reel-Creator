import { NextResponse } from "next/server";
import { deleteReel } from "@/src/pipeline/library";
import { slug } from "@/lib/util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/reels/<id> → removes the reel/draft and its assets.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ok = deleteReel(slug(params.id));
  if (!ok) return new NextResponse("not found", { status: 404 });
  return NextResponse.json({ deleted: true });
}
