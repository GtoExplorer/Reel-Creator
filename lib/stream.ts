// Streaming text response for long pipeline stages: tees console.log/warn/error
// into the response body so the UI can show live logs, then runs `work`. The
// caller writes sentinel lines (e.g. __DRAFT__/__MANIFEST__/__DONE__) via `write`.
export function streamingResponse(work: (write: (s: string) => void) => Promise<void>): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      const write = (s: string) => {
        try {
          controller.enqueue(enc.encode(s));
        } catch {
          /* client disconnected */
        }
      };
      const orig = { log: console.log, warn: console.warn, error: console.error };
      const patch =
        (o: (...a: unknown[]) => void) =>
        (...a: unknown[]) => {
          write(a.map(String).join(" ") + "\n");
          o(...a);
        };
      console.log = patch(orig.log);
      console.warn = patch(orig.warn);
      console.error = patch(orig.error);
      try {
        await work(write);
      } catch (e) {
        write(`\nERROR ${(e as Error).message}\n`);
      } finally {
        console.log = orig.log;
        console.warn = orig.warn;
        console.error = orig.error;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
