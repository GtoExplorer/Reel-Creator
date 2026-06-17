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
  return buf;
}
