// Aggregate/bar-chart properties mirror the dashboard's apiCallValid lists.
const FLOP = [
  "flop_tone", "flop_paired", "flop_n_to_flush", "flop_top_card_rank",
  "flop_second_card_rank", "flop_third_card_rank", "flop_top_gap", "flop_second_gap",
];
const TURN = [
  "turn_tone", "turn_paired", "turn_n_to_flush", "turn_top_card_rank",
  "turn_second_card_rank", "turn_third_card_rank", "turn_fourth_card_rank",
  "turn_top_gap", "turn_second_gap", "turn_third_gap", "turn_rank",
  "turn_double_flush_draw", "turn_front_door_flush_hit", "turn_back_door_flush_draw",
  "turn_adds_pair", "turn_pairs_top_card", "turn_pairs_second_card", "turn_pairs_third_card",
];
const DRAWS = [
  "draw_2c_flush_draw", "draw_1c_flush_draw", "draw_8_out_straight_draw",
  "draw_4_out_straight_draw", "draw_straight_outs", "full_draw",
  "draw_2c_backdoor_flush_draw", "draw_1c_backdoor_flush_draw",
  "draw_backdoor_straight_draw", "frontdoor_draw", "backdoor_draw",
];
const TURN_DRAWS = DRAWS.slice(0, 6);

export interface PropertyGroup { label: string; categories: string[] }

export function propertyGroups(street?: string): PropertyGroup[] {
  if (street === "turn") return [
    { label: "Hand strength", categories: ["sdv"] },
    { label: "Flop texture", categories: FLOP },
    { label: "Turn texture", categories: TURN },
    { label: "Draws", categories: TURN_DRAWS },
  ];
  if (street === "river") return [];
  return [
    { label: "Hand strength", categories: ["sdv"] },
    { label: "Flop texture", categories: FLOP },
    { label: "Draws", categories: DRAWS },
  ];
}

export const prettyProperty = (key: string) => key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// Exact copy of the dashboard FlowchartCheckboxGroups property catalogue.
export const POOL = {
  hand: ["sdv"],
  flop: [
    "flop_tone", "flop_paired", "flop_top_card_rank", "flop_second_card_rank",
    "flop_third_card_rank", "flop_top_gap", "flop_second_gap",
  ],
  turn: [
    "turn_tone", "turn_paired", "turn_n_to_flush", "turn_top_card_rank",
    "turn_second_card_rank", "turn_third_card_rank", "turn_fourth_card_rank",
    "turn_top_gap", "turn_second_gap", "turn_third_gap", "turn_rank",
    "turn_double_flush_draw", "turn_front_door_flush_hit", "turn_back_door_flush_draw",
    "turn_adds_pair", "turn_pairs_top_card", "turn_pairs_second_card", "turn_pairs_third_card",
  ],
  river: [
    "river_tone", "river_paired", "river_n_to_flush", "river_top_card_rank",
    "river_second_card_rank", "river_third_card_rank", "river_fourth_card_rank",
    "river_fifth_card_rank", "river_top_gap", "river_second_gap", "river_third_gap",
    "river_fourth_gap", "river_rank", "river_front_door_flush_hit",
    "river_back_door_flush_hit", "river_adds_pair", "river_pairs_top_card",
    "river_pairs_second_card", "river_pairs_third_card", "river_pairs_fourth_card",
  ],
  draws: [
    "draw_2c_backdoor_flush_draw", "draw_1c_backdoor_flush_draw",
    "draw_backdoor_straight_draw", "draw_2c_flush_draw", "draw_1c_flush_draw",
    "draw_straight_outs",
  ],
};

// Exact dashboard street-selection logic.
export function getOptions(street: string | null | undefined): Record<string, string[]> {
  let options: Record<string, string[]> = { hand: POOL.hand, flop: POOL.flop };
  if (street === "flop") options = { ...options, draws: POOL.draws };
  else if (street === "turn") options = { ...options, draws: POOL.draws.slice(3), turn: POOL.turn };
  else if (street === "river") options = { ...options, turn: POOL.turn, river: POOL.river };
  return options;
}

export function treePropertyGroups(street?: string): PropertyGroup[] {
  const options = getOptions(street);
  return ["hand", "draws", "flop", "turn", "river"]
    .filter((key) => options[key]?.length)
    .map((key) => ({ label: key.charAt(0).toUpperCase() + key.slice(1), categories: options[key] }));
}

export function defaultTreePropertySelection(street?: string): string[] {
  return Object.values(getOptions(street)).flat();
}
