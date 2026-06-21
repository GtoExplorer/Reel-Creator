// Client-side helper: POST JSON, then read the streamed text body, calling
// onText with the running buffer as chunks arrive. Returns the full buffer.
export async function streamFetch(
  url: string,
  body: unknown,
  onText: (buf: string) => void
): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    onText(text);
    throw new Error(text || `Request failed (${res.status})`);
  }
  if (!res.body) {
    const text = await res.text();
    onText(text);
    return text;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    onText(buf);
  }
  buf += dec.decode();
  return buf;
}

export function parseStreamMarkerJson<T>(buf: string, marker: string): T | null {
  const line = buf
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${marker} `));
  if (!line) return null;
  return JSON.parse(line.slice(marker.length + 1).trim()) as T;
}
