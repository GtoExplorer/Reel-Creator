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
