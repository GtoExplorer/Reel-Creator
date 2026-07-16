import { Brief } from "@/src/types";
import { prepareDraft } from "@/src/pipeline/stages";
import { slug } from "@/lib/util";
import { streamingResponse } from "@/lib/stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function POST(req: Request) {
  const f = await req.json().catch(() => ({}));
  let brief;
  try {
    brief = Brief.parse({
      id: slug(String(f.id || f.topic || "reel")),
      topic: String(f.topic || ""),
      concept: String(f.concept || ""),
      board: f.board ? String(f.board) : undefined,
      street: f.street || undefined,
      preflopLine: Array.isArray(f.preflopLine) && f.preflopLine.length ? f.preflopLine : undefined,
      loadId: f.loadId ? Number(f.loadId) : undefined,
      gameId: f.gameId ? String(f.gameId) : undefined,
      autoSelectSpot: f.autoSelectSpot === true,
    });
  } catch (e) {
    return new Response("Invalid brief: " + (e as Error).message, { status: 400 });
  }

  return streamingResponse(async (write) => {
    const draft = await prepareDraft(brief);
    write("\n__DRAFT__ " + JSON.stringify(draft) + "\n");
  });
}
