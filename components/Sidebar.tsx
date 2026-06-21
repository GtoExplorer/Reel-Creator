"use client";
import type { ReelSummary } from "@/src/pipeline/library";

const DOT: Record<string, string> = {
  ok: "bg-green-500",
  error: "bg-red-500",
  checking: "bg-yellow-500",
};
const STATUS: Record<string, string> = {
  ok: "solver API ready",
  error: "solver API unavailable",
  checking: "checking solver API...",
};

export function Sidebar({
  reels,
  health,
  activeId,
  onNew,
  onEdit,
  onDelete,
}: {
  reels: ReelSummary[];
  health: "ok" | "error" | "checking";
  activeId: string | null;
  onNew: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside className="sticky top-0 flex h-screen w-72 shrink-0 flex-col border-r border-line bg-surface">
      <div className="border-b border-line p-4">
        <div className="text-xl font-bold">
          GTO<span className="text-accent">CENTRAL</span>
        </div>
        <div className="text-xs uppercase tracking-widest text-muted">Reels Studio</div>
      </div>

      <div className="p-4">
        <button className="btn w-full" onClick={onNew}>
          + New reel
        </button>
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className={`inline-block h-2 w-2 rounded-full ${DOT[health]}`} />
          <span className="text-muted">{STATUS[health]}</span>
        </div>
      </div>

      <div className="label px-4 pb-1">Your reels</div>
      <div className="flex flex-1 flex-col gap-2 overflow-auto px-3 pb-4">
        {reels.length === 0 && <div className="px-1 text-sm text-muted">No reels yet.</div>}
        {reels.map((r) => (
          <div
            key={r.id}
            onClick={() => onEdit(r.id)}
            className={`group flex cursor-pointer items-center gap-3 rounded-lg border p-2 text-left transition-colors ${
              activeId === r.id ? "border-accent" : "border-line hover:border-[#4a4b4d]"
            }`}
          >
            {r.status === "rendered" && r.url ? (
              <video src={`${r.url}#t=2`} preload="metadata" className="h-[84px] w-12 rounded bg-black object-cover" />
            ) : (
              <div className="grid h-[84px] w-12 place-items-center rounded border border-dashed border-line text-[9px] uppercase tracking-wide text-muted">
                Draft
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{r.id}</div>
              {r.status === "rendered" && r.url ? (
                <a href={r.url} download className="text-xs text-accent" onClick={(e) => e.stopPropagation()}>
                  Download
                </a>
              ) : (
                <span className="text-xs text-muted">draft - not rendered</span>
              )}
            </div>
            <button
              title="Delete reel"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(r.id);
              }}
              className="shrink-0 rounded px-1.5 py-1 text-muted opacity-0 transition hover:bg-red-500/15 hover:text-red-400 group-hover:opacity-100"
            >
              x
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
