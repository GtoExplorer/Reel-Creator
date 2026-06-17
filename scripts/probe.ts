import "dotenv/config";

const BASE = process.env.SOLVER_API_BASE!;
const TOKEN = process.env.SOLVER_API_TOKEN!;

function shapeOf(v: unknown, depth = 0): string {
  if (Array.isArray(v)) return `Array(${v.length})${v.length ? " of " + shapeOf(v[0], depth + 1) : ""}`;
  if (v && typeof v === "object") {
    if (depth > 2) return "{…}";
    const e = Object.entries(v as Record<string, unknown>).slice(0, 12);
    return "{ " + e.map(([k, val]) => `${k}: ${shapeOf(val, depth + 1)}`).join(", ") + " }";
  }
  if (typeof v === "string") return `str(${(v as string).slice(0, 14)})`;
  return typeof v;
}

async function probe(path: string) {
  const url = `${BASE}${path}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text.slice(0, 200);
    }
    console.log(`\n=== ${res.status} ${path}`);
    console.log("shape:", shapeOf(parsed));
    console.log("sample:", JSON.stringify(parsed).slice(0, 700));
  } catch (e) {
    console.log(`\n=== ERROR ${path}:`, (e as Error).message);
  }
}

const paths = process.argv.slice(2);
for (const p of paths) await probe(p);
