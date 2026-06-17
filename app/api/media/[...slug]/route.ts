import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Streams rendered assets from out/ with HTTP Range support so the <video>
// (and the Player's final-render preview) can seek/scrub.
const OUT = path.join(process.cwd(), "out");

const typeFor = (p: string) =>
  p.endsWith(".mp4") ? "video/mp4" : p.endsWith(".png") ? "image/png" : "application/octet-stream";

export async function GET(req: Request, { params }: { params: { slug: string[] } }) {
  const rel = (params.slug ?? []).join("/");
  const filePath = path.join(OUT, rel);
  if (!filePath.startsWith(OUT) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return new Response("not found", { status: 404 });
  }

  const stat = fs.statSync(filePath);
  const type = typeFor(filePath);
  const range = req.headers.get("range");

  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range);
    const start = m ? parseInt(m[1]) : 0;
    const end = m && m[2] ? parseInt(m[2]) : stat.size - 1;
    const node = fs.createReadStream(filePath, { start, end });
    return new Response(Readable.toWeb(node) as unknown as ReadableStream, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        "Content-Type": type,
      },
    });
  }

  const node = fs.createReadStream(filePath);
  return new Response(Readable.toWeb(node) as unknown as ReadableStream, {
    headers: {
      "Content-Length": String(stat.size),
      "Content-Type": type,
      "Accept-Ranges": "bytes",
    },
  });
}
