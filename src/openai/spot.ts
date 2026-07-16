import { authGet, type PostflopStreet } from "../data/solverApi.js";
import { config } from "../config.js";
import { openai } from "./client.js";

type LoadCandidate = {
  id: number;
  street: PostflopStreet;
  description: string;
  game_type?: string;
  table_size?: string;
  players?: string;
  rake?: string;
  preflop_action?: string;
  postflop_action?: string;
};

export type SpotRecommendation = {
  loadId: number;
  street: PostflopStreet;
  description: string;
  reason: string;
};

const POSITION_ALIASES: Record<string, string> = {
  btn: "bu", button: "bu", cutoff: "co", hijack: "hj", lojack: "lj",
  smallblind: "sb", bigblind: "bb", single: "srp", singleraised: "srp",
  threebet: "3bet", "3betpot": "3bet", fourbet: "4bet",
};

function terms(value: string): string[] {
  return value.toLowerCase().replace(/3-bet/g, "3bet").replace(/4-bet/g, "4bet").replace(/[^a-z0-9]+/g, " ")
    .trim().split(/\s+/).filter((term) => term.length > 1).map((term) => POSITION_ALIASES[term] ?? term);
}

function rankCandidates(loads: LoadCandidate[], request: string): LoadCandidate[] {
  const wanted = new Set(terms(request));
  const requestedStreet = wanted.has("turn") ? "turn" : wanted.has("flop") ? "flop" : null;
  return loads
    .filter((load) => !requestedStreet || load.street === requestedStreet)
    .map((load) => {
      const haystack = terms([load.description, load.players, load.preflop_action, load.postflop_action, load.game_type, load.table_size].filter(Boolean).join(" "));
      const overlap = haystack.reduce((score, term) => score + (wanted.has(term) ? (term.length > 3 ? 3 : 2) : 0), 0);
      const simpleSpotBonus = (load.postflop_action ?? "").split(" - ").filter(Boolean).length <= 2 ? 1 : 0;
      return { load, score: overlap + simpleSpotBonus };
    })
    .sort((a, b) => b.score - a.score || a.load.id - b.load.id)
    .slice(0, 36)
    .map(({ load }) => load);
}

const SELECTION_SCHEMA = {
  name: "solver_spot_selection",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      loadId: { type: "integer", description: "One load ID from the supplied candidates" },
      reason: { type: "string", description: "One concise creator-facing sentence explaining why this spot supports the requested lesson" },
    },
    required: ["loadId", "reason"],
  },
} as const;

export async function recommendSpot(topic: string, concept: string): Promise<SpotRecommendation | null> {
  const response = await authGet("/loads/?publish=true");
  if (!response.ok) return null;
  const loads = (await response.json()) as LoadCandidate[];
  const candidates = rankCandidates(loads.filter((load) => load?.id && ["flop", "turn", "river"].includes(load.street)), `${topic} ${concept}`);
  if (!candidates.length) return null;

  const candidateText = candidates.map((load) =>
    `${load.id} | ${load.street} | ${load.description} | players=${load.players ?? "?"} | pot=${load.preflop_action ?? "?"} | line=${load.postflop_action ?? "none"}`
  ).join("\n");
  const completion = await openai.chat.completions.create({
    model: config.textModel,
    messages: [
      { role: "system", content: "You select the best real GTOCentral solver spot for a short educational poker video. You MUST choose exactly one ID from the supplied candidates. Match positions, pot type, street and action line to the creator's request. Prefer a clear, teachable spot over an unnecessarily deep action line. Never invent a load or solver result." },
      { role: "user", content: `Creator topic: ${topic}\nWhat they want to teach: ${concept}\n\nREAL AVAILABLE LOADS:\n${candidateText}\n\nChoose the best load and explain the fit without claiming any strategy frequencies.` },
    ],
    response_format: { type: "json_schema", json_schema: SELECTION_SCHEMA },
  });
  const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as { loadId?: number; reason?: string };
  const selected = candidates.find((load) => load.id === Number(parsed.loadId)) ?? candidates[0];
  return { loadId: selected.id, street: selected.street, description: selected.description, reason: String(parsed.reason || `Selected ${selected.description} as the closest available solver spot.`) };
}
