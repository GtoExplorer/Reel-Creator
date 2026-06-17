"use client";
import { useState } from "react";
import type { CategoryStrategy } from "@/src/types";
import { propertyGroups, prettyProperty } from "@/lib/properties";

// Lets a bar-chart scene show ANY aggregate property (not just the default
// sdv / flop_top_card_rank). Fetches the chosen property's bars for the load.
export function PropertyPicker({
  loadId,
  street,
  value,
  onPick,
}: {
  loadId: number;
  street?: string;
  value?: string;
  onPick: (categories: CategoryStrategy[], category: string, label: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const groups = propertyGroups(street);

  async function pick(category: string) {
    if (!category) return;
    setBusy(true);
    try {
      const r = await fetch(
        `/api/aggregate?loadId=${loadId}&street=${encodeURIComponent(street || "flop")}&category=${encodeURIComponent(category)}`
      ).then((res) => res.json());
      if (r.categories?.length) onPick(r.categories, category, r.label || prettyProperty(category));
      else alert(r.error || "No data for that property on this load");
    } catch {
      alert("Fetch failed — is the webapp running?");
    }
    setBusy(false);
  }

  return (
    <>
      <div className="label">Bar chart property {busy && <span className="text-muted">· loading…</span>}</div>
      <select className="input" value={value || ""} disabled={busy} onChange={(e) => pick(e.target.value)}>
        <option value="" disabled>
          Choose a property…
        </option>
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.categories.map((c) => (
              <option key={c} value={c}>
                {prettyProperty(c)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </>
  );
}
