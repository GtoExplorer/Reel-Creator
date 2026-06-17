import { DraftManifest } from "@/src/types";
import { voiceDraft, type SceneEdit } from "@/src/pipeline/stages";
import { streamingResponse } from "@/lib/stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  let draft;
  try {
    draft = DraftManifest.parse(body.draft);
  } catch (e) {
    return new Response("Invalid draft: " + (e as Error).message, { status: 400 });
  }
  const edits: SceneEdit[] = Array.isArray(body.edits) ? body.edits : [];

  return streamingResponse(async (write) => {
    const manifest = await voiceDraft(draft, edits);
    write("\n__MANIFEST__ " + JSON.stringify(manifest) + "\n");
  });
}
