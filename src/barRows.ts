import type { CategoryStrategy } from "./types.js";
import { rankSortValue } from "./poker/ranges.js";

function isRankAggregate(category?: string): boolean {
  return !!category && (category.endsWith("_card_rank") || category === "turn_rank" || category === "river_rank");
}

function looksLikeRankSeries(cats: CategoryStrategy[]): boolean {
  if (cats.length < 5 || cats.length > 13) return false;
  const values = cats.map((c) => rankSortValue(c.category));
  return values.every((v) => v >= 2 && v <= 14) && new Set(values).size === values.length;
}

export function orderCategoryRows(cats: CategoryStrategy[] = [], category?: string): CategoryStrategy[] {
  if (!isRankAggregate(category) && !looksLikeRankSeries(cats)) return cats;
  return cats
    .map((c, i) => ({ c, i, v: rankSortValue(c.category) }))
    .sort((a, b) => {
      if (a.v < 0 && b.v < 0) return a.i - b.i;
      if (a.v < 0) return 1;
      if (b.v < 0) return -1;
      return a.v === b.v ? a.i - b.i : b.v - a.v;
    })
    .map(({ c }) => c);
}
