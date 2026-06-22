"use client";
import { useEffect, useMemo, useState } from "react";
import type { CategoryStrategy, DraftScene, FlowchartDirection, RangeCell, SceneFilter } from "@/src/types";
import { propertyGroups, prettyProperty } from "@/lib/properties";

type ValueOptions = Record<string, { value: string; label: string }[]>;

const DEFAULT_CAMERA = [
  { cx: 0.5, cy: 0.5, zoom: 1 },
  { cx: 0.5, cy: 0.5, zoom: 1.2 },
];

function filtersParam(filters: SceneFilter[]): string {
  return encodeURIComponent(JSON.stringify(filters));
}

export function SceneDataControls({
  scene,
  defaultLoadId,
  defaultGameId,
  defaultPreflopLine,
  street,
  onChange,
}: {
  scene: DraftScene;
  defaultLoadId?: number;
  defaultGameId?: string;
  defaultPreflopLine?: string[];
  street?: string;
  onChange: (patch: Partial<DraftScene>) => void;
}) {
  const isBars = scene.type === "barCharts";
  const isFreq = scene.type === "freqBars";
  const isAggregate = isBars || isFreq;
  const isFlowchart = scene.type === "flowchart";
  const isPreflop = scene.type === "preflopMatrix";
  const sceneLoadId = scene.loadId ?? defaultLoadId;
  const sceneGameId = scene.gameId ?? defaultGameId;
  const scenePreflopLine = scene.preflopLine ?? defaultPreflopLine ?? [];
  const scenePreflopLineText = scenePreflopLine.join(", ");
  const filters = scene.filters ?? [];

  const [loadText, setLoadText] = useState(sceneLoadId ? String(sceneLoadId) : "");
  const [lineText, setLineText] = useState(scenePreflopLineText);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [values, setValues] = useState<ValueOptions>({});
  const [filterProperty, setFilterProperty] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLoadText(sceneLoadId ? String(sceneLoadId) : "");
  }, [sceneLoadId]);

  useEffect(() => {
    setLineText(scenePreflopLineText);
  }, [scenePreflopLineText]);

  useEffect(() => {
    fetch("/api/properties")
      .then((r) => r.json())
      .then((j) => j && typeof j === "object" && setLabels(j))
      .catch(() => {});
    fetch("/api/property-values")
      .then((r) => r.json())
      .then((j) => j && typeof j === "object" && setValues(j))
      .catch(() => {});
  }, []);

  const groups = propertyGroups(street);
  const allProperties = useMemo(() => groups.flatMap((g) => g.categories), [groups]);
  const valueOptions = values[filterProperty] ?? [];
  const labelFor = (p: string) => labels[p] || prettyProperty(p);

  function parsedLoadId(): number | null {
    const n = Number(loadText.trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function parsedPreflopLine(): string[] {
    return lineText.split(",").map((s) => s.trim()).filter(Boolean);
  }

  async function applyData(opts: { loadId?: number; filters?: SceneFilter[]; category?: string; barValue?: string } = {}) {
    if (isPreflop) {
      const nextLine = parsedPreflopLine();
      if (!nextLine.length) {
        alert("Enter a preflop action sequence");
        return;
      }
      setBusy(true);
      try {
        const gameParam = sceneGameId ? `&gameId=${encodeURIComponent(sceneGameId)}` : "";
        const r = await fetch(`/api/preflop-matrix?line=${encodeURIComponent(nextLine.join(","))}${gameParam}`).then((res) => res.json());
        if (r.rangeGrid?.length) {
          onChange({
            loadId: undefined,
            gameId: r.gameId || sceneGameId,
            preflopLine: r.line || nextLine,
            rangeGrid: r.rangeGrid as RangeCell[],
            headline: r.label || "Preflop Range",
          });
        } else {
          alert(r.error || "No preflop range found for that sequence");
        }
      } catch {
        alert("Preflop matrix fetch failed");
      } finally {
        setBusy(false);
      }
      return;
    }

    const nextLoadId = opts.loadId ?? parsedLoadId();
    const nextFilters = opts.filters ?? filters;
    if (!nextLoadId) {
      alert("Enter a valid load ID");
      return;
    }

    if (isAggregate) {
      const category = opts.category ?? scene.category;
      if (!category) {
        onChange({ loadId: nextLoadId, filters: nextFilters });
        return;
      }
      setBusy(true);
      try {
        const r = await fetch(
          `/api/aggregate?loadId=${nextLoadId}&street=${encodeURIComponent(street || "flop")}&category=${encodeURIComponent(
            category
          )}&filters=${filtersParam(nextFilters)}`
        ).then((res) => res.json());
        if (r.categories?.length) {
          const categories = r.categories as CategoryStrategy[];
          if (isFreq) {
            const currentBar = opts.barValue ?? scene.barValue;
            const selected = categories.find((c) => c.category === currentBar) ?? categories[0];
            onChange({
              loadId: nextLoadId,
              filters: nextFilters,
              categories,
              category,
              barValue: selected.category,
              freqBars: selected.actions,
              headline: selected.category || r.label || labelFor(category),
            });
            return;
          }
          onChange({
            loadId: nextLoadId,
            filters: nextFilters,
            categories,
            category,
            headline: r.label || labelFor(category),
          });
        } else {
          alert(r.error || "No data for that load/filter combination");
        }
      } catch {
        alert("Fetch failed");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (isFlowchart) {
      const direction = scene.flowchart?.direction ?? "TB";
      setBusy(true);
      try {
        const r = await fetch(
          `/api/flowchart?loadId=${nextLoadId}&street=${encodeURIComponent(street || "flop")}&direction=${direction}&filters=${filtersParam(nextFilters)}`
        ).then((res) => res.json());
        if (r.flowchart && r.nodes) {
          onChange({
            loadId: nextLoadId,
            filters: nextFilters,
            flowchart: r.flowchart,
            nodes: r.nodes,
            camera: DEFAULT_CAMERA,
          });
        } else {
          alert(r.error || "No flowchart for that load/filter combination");
        }
      } catch {
        alert("Flowchart fetch failed");
      } finally {
        setBusy(false);
      }
    }
  }

  function addFilter() {
    if (!filterProperty || !filterValue) return;
    const valueLabel = valueOptions.find((o) => o.value === filterValue)?.label ?? filterValue;
    const next = [
      ...filters.filter((f) => !(f.property === filterProperty && f.value === filterValue)),
      { property: filterProperty, value: filterValue, label: labelFor(filterProperty), valueLabel },
    ];
    setFilterValue("");
    applyData({ filters: next });
  }

  function deleteFilter(index: number) {
    applyData({ filters: filters.filter((_, i) => i !== index) });
  }

  async function setFlowchartDirection(direction: FlowchartDirection) {
    const nextLoadId = parsedLoadId();
    if (!nextLoadId) {
      alert("Enter a valid load ID");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(
        `/api/flowchart?loadId=${nextLoadId}&street=${encodeURIComponent(street || "flop")}&direction=${direction}&filters=${filtersParam(filters)}`
      ).then((res) => res.json());
      if (r.flowchart && r.nodes) {
        onChange({
          loadId: nextLoadId,
          flowchart: r.flowchart,
          nodes: r.nodes,
          camera: DEFAULT_CAMERA,
        });
      } else {
        alert(r.error || "No flowchart for that orientation");
      }
    } catch {
      alert("Flowchart fetch failed");
    } finally {
      setBusy(false);
    }
  }

  function setFocusBar(barValue: string) {
    const selected = (scene.categories ?? []).find((c) => c.category === barValue);
    if (selected) {
      onChange({ barValue, freqBars: selected.actions, headline: selected.category });
      return;
    }
    applyData({ barValue });
  }

  if (!isAggregate && !isFlowchart && !isPreflop) return null;

  return (
    <div className="mt-3 rounded-lg border border-line p-2.5">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div>
          <div className="label">{isPreflop ? "Preflop line (comma-separated)" : "Scene load ID"}</div>
          {isPreflop ? (
            <input
              className="input"
              value={lineText}
              onChange={(e) => setLineText(e.target.value)}
              placeholder="Fold, Fold, Fold, Raise 2.5bb, Fold, Call"
            />
          ) : (
            <input className="input" value={loadText} onChange={(e) => setLoadText(e.target.value)} placeholder={defaultLoadId ? String(defaultLoadId) : "Load ID"} />
          )}
        </div>
        <div className="flex items-end">
          <button className="btn-ghost btn-mini mb-0.5" disabled={busy} onClick={() => applyData()}>
            {busy ? "Loading..." : isFlowchart ? "Rebuild tree" : isPreflop ? "Rebuild matrix" : isFreq ? "Rebuild bars" : "Apply"}
          </button>
        </div>
      </div>

      {isAggregate && (
        <>
          <div className="label">Bar chart property {busy && <span className="text-muted">- loading...</span>}</div>
          <select className="input" value={scene.category || ""} disabled={busy} onChange={(e) => applyData({ category: e.target.value })}>
            <option value="" disabled>
              Choose a property...
            </option>
            {groups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.categories.map((c) => (
                  <option key={c} value={c}>
                    {labelFor(c)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </>
      )}

      {isFreq && (
        <>
          <div className="label">Focus bar</div>
          <select className="input" value={scene.barValue || ""} disabled={busy || !(scene.categories?.length)} onChange={(e) => setFocusBar(e.target.value)}>
            <option value="" disabled>
              Choose a bar...
            </option>
            {(scene.categories ?? []).map((c) => (
              <option key={c.category} value={c.category}>
                {c.category}
              </option>
            ))}
          </select>
        </>
      )}

      {isFlowchart && (
        <>
          <div className="label">Flowchart orientation</div>
          <div className="grid grid-cols-2 gap-2">
            {(["TB", "LR"] as const).map((dir) => (
              <button
                key={dir}
                type="button"
                className={`${scene.flowchart?.direction === dir || (!scene.flowchart?.direction && dir === "TB") ? "btn" : "btn-ghost"} btn-mini`}
                disabled={busy}
                onClick={() => setFlowchartDirection(dir)}
              >
                {dir === "TB" ? "Top to bottom" : "Left to right"}
              </button>
            ))}
          </div>
        </>
      )}

      {!isPreflop && (
        <>
          <div className="label">Property filters</div>
          <div className="flex flex-wrap gap-1.5">
            {filters.length === 0 && <span className="text-xs text-muted">None</span>}
            {filters.map((f, i) => (
              <button key={`${f.property}:${f.value}:${i}`} className="btn-ghost btn-mini" disabled={busy} onClick={() => deleteFilter(i)}>
                {(f.label ?? labelFor(f.property)) + ": " + (f.valueLabel ?? f.value)} x
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2">
            <select
              className="input"
              value={filterProperty}
              disabled={busy}
              onChange={(e) => {
                setFilterProperty(e.target.value);
                setFilterValue("");
              }}
            >
              <option value="">Property</option>
              {allProperties.map((p) => (
                <option key={p} value={p}>
                  {labelFor(p)}
                </option>
              ))}
            </select>
            <select className="input" value={filterValue} disabled={busy || !filterProperty || valueOptions.length === 0} onChange={(e) => setFilterValue(e.target.value)}>
              <option value="">Value</option>
              {valueOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button className="btn-ghost btn-mini" disabled={busy || !filterProperty || !filterValue} onClick={addFilter}>
              Add
            </button>
          </div>
        </>
      )}
    </div>
  );
}
