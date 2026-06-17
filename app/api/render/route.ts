import { RenderManifest } from "@/src/types";
import { renderManifest } from "@/src/pipeline/stages";
import { streamingResponse } from "@/lib/stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 1800;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  let manifest;
  try {
    manifest = RenderManifest.parse(body.manifest);
  } catch (e) {
    return new Response("Invalid manifest: " + (e as Error).message, { status: 400 });
  }

  return streamingResponse(async (write) => {
    await renderManifest(manifest, write);
    write(`\n__DONE__ /api/media/${manifest.briefId}/reel.mp4\n`);
  });
}
