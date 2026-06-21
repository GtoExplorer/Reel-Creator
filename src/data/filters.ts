import { SceneFilter } from "../types.js";
import type { SceneFilter as SceneFilterType } from "../types.js";

export function parseSceneFilters(raw: string | null): SceneFilterType[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return SceneFilter.array().parse(parsed);
  } catch {
    return [];
  }
}

export function sceneFiltersParam(filters?: SceneFilterType[]): string {
  return encodeURIComponent(JSON.stringify(filters ?? []));
}

export function filterQueryParts(filters?: SceneFilterType[], excludeProperty?: string): string[] {
  return (filters ?? [])
    .filter((f) => f.property && f.value && f.property !== excludeProperty)
    .map((f) => `${encodeURIComponent(f.property)}=${encodeURIComponent(f.value)}`);
}
