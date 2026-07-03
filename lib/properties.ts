// The aggregate properties the Explorer exposes (ported from the webapp's
// ApiHandler AGG list). Each is a different bar chart for a spot.
const FLOP = [
  "flop_tone",
  "flop_paired",
  "flop_n_to_flush",
  "flop_top_card_rank",
  "flop_second_card_rank",
  "flop_third_card_rank",
  "flop_top_gap",
  "flop_second_gap",
];
const TURN = [
  "turn_tone",
  "turn_paired",
  "turn_n_to_flush",
  "turn_top_card_rank",
  "turn_second_card_rank",
  "turn_third_card_rank",
  "turn_fourth_card_rank",
  "turn_top_gap",
  "turn_second_gap",
  "turn_third_gap",
  "turn_rank",
  "turn_adds_pair",
  "turn_pairs_top_card",
  "turn_pairs_second_card",
  "turn_pairs_third_card",
];
const DRAWS = [
  "draw_2c_flush_draw",
  "draw_1c_flush_draw",
  "draw_8_out_straight_draw",
  "draw_4_out_straight_draw",
  "draw_straight_outs",
  "full_draw",
  "draw_2c_backdoor_flush_draw",
  "draw_1c_backdoor_flush_draw",
  "draw_backdoor_straight_draw",
  "frontdoor_draw",
  "backdoor_draw",
];

export interface PropertyGroup {
  label: string;
  categories: string[];
}

// Groups valid for the given street (board props are street-specific; sdv +
// draws apply to both flop and turn spots).
export function propertyGroups(street?: string): PropertyGroup[] {
  const isTurn = street === "turn";
  return [
    { label: "Hand strength", categories: ["sdv"] },
    { label: isTurn ? "Turn texture" : "Flop texture", categories: isTurn ? TURN : FLOP },
    { label: "Draws", categories: DRAWS },
  ];
}

export const prettyProperty = (k: string) => k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// The split-property pool the Explorer's flowchart settings panel exposes
// (ported from FlowchartCheckboxGroups) — what a node-expansion subtree may
// split on. Distinct from the aggregate list above.
const TREE_HAND = ["sdv"];
const TREE_FLOP = [
  "flop_tone",
  "flop_paired",
  "flop_top_card_rank",
  "flop_second_card_rank",
  "flop_third_card_rank",
  "flop_top_gap",
  "flop_second_gap",
];
const TREE_TURN = [
  "turn_tone",
  "turn_paired",
  "turn_n_to_flush",
  "turn_top_card_rank",
  "turn_second_card_rank",
  "turn_third_card_rank",
  "turn_fourth_card_rank",
  "turn_top_gap",
  "turn_second_gap",
  "turn_third_gap",
  "turn_rank",
  "turn_double_flush_draw",
  "turn_front_door_flush_hit",
  "turn_back_door_flush_draw",
  "turn_adds_pair",
  "turn_pairs_top_card",
  "turn_pairs_second_card",
  "turn_pairs_third_card",
];
const TREE_RIVER = [
  "river_tone",
  "river_paired",
  "river_n_to_flush",
  "river_top_card_rank",
  "river_second_card_rank",
  "river_third_card_rank",
  "river_fourth_card_rank",
  "river_fifth_card_rank",
  "river_top_gap",
  "river_second_gap",
  "river_third_gap",
  "river_fourth_gap",
  "river_rank",
  "river_front_door_flush_hit",
  "river_back_door_flush_hit",
  "river_adds_pair",
  "river_pairs_top_card",
  "river_pairs_second_card",
  "river_pairs_third_card",
  "river_pairs_fourth_card",
];
const TREE_DRAWS = [
  "draw_2c_backdoor_flush_draw",
  "draw_1c_backdoor_flush_draw",
  "draw_backdoor_straight_draw",
  "draw_2c_flush_draw",
  "draw_1c_flush_draw",
  "draw_straight_outs",
];

export function treePropertyGroups(street?: string): PropertyGroup[] {
  const groups: PropertyGroup[] = [{ label: "Hand", categories: TREE_HAND }];
  if (street === "flop") groups.push({ label: "Draws", categories: TREE_DRAWS });
  else if (street === "turn") groups.push({ label: "Draws", categories: TREE_DRAWS.slice(3) });
  groups.push({ label: "Flop", categories: TREE_FLOP });
  if (street === "turn" || street === "river") groups.push({ label: "Turn", categories: TREE_TURN });
  if (street === "river") groups.push({ label: "River", categories: TREE_RIVER });
  return groups;
}

export function defaultTreePropertySelection(street?: string): string[] {
  return treePropertyGroups(street).flatMap((g) => g.categories);
}
