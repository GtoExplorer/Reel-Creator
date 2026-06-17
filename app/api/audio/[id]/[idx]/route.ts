import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { slug } from "@/lib/util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Save a recorded/uploaded voice clip for one scene.
export async function POST(req: Request, { params }: { params: { id: string; idx: string } }) {
  const id = slug(params.id);
  const idx = parseInt(params.idx);
  if (Number.isNaN(idx)) return new NextResponse("bad index", { status: 400 });

  const ct = req.headers.get("content-type") ?? "";
  const ext = ct.includes("mpeg") || ct.includes("mp3") ? "mp3" : ct.includes("wav") ? "wav" : "webm";
  const buf = Buffer.from(await req.arrayBuffer());

  const dir = path.join(process.cwd(), "public", "reels", id);
  fs.mkdirSync(dir, { recursive: true });
  const rel = `reels/${id}/scene_${idx}.${ext}`;
  fs.writeFileSync(path.join(process.cwd(), "public", rel), buf);
  return NextResponse.json({ path: rel });
}
