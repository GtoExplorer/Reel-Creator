import { openai } from "./client.js";
import { config } from "../config.js";
import { Storyboard, type Brief, type CategoryStrategy, type RangeCell } from "../types.js";

const JSON_SCHEMA = {
  name: "storyboard",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string", description: "Internal title for the reel" },
      hashtags: { type: "array", items: { type: "string" }, description: "8-12 relevant hashtags, no # prefix" },
      scenes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: { type: "string", enum: ["hook", "preflopMatrix", "flowchart", "barCharts", "cta"] },
            voiceover: { type: "string", description: "Two short, punchy spoken sentences for this scene — keep it dense and energetic, no filler" },
            headline: { type: "string", description: "Punchy on-screen headline, <= 6 words" },
            subtext: { type: "string", description: "Optional supporting line, <= 8 words, may be empty" },
          },
          required: ["type", "voiceover", "headline", "subtext"],
        },
      },
    },
    required: ["title", "hashtags", "scenes"],
  },
} as const;

const SYSTEM = `You are a senior short-form video scriptwriter for GTOCentral, a game-theory-optimal poker training tool.
Write tight, confident, fast-paced Instagram Reels for serious poker players. Pack each scene with two punchy sentences — energetic and information-dense, never slow or padded.
Rules:
- Produce exactly these scenes in this order: one "hook", one "preflopMatrix", one "flowchart", one "barCharts", one "cta".
- These scenes show the real GTOCentral product UI; speak to what each reveals, don't invent specific numbers:
  - "preflopMatrix": the preflop range chart (which hands to play and how).
  - "flowchart": the postflop decision tree (how the solver decides street by street).
  - "barCharts": how the strategy shifts across different board textures or selected bar-chart properties.
- The hook must create curiosity or challenge a common mistake in the first 2 seconds.
- You may cite the exact figures listed under FACTS, and ONLY those — never invent, estimate, or re-round any other number. Weave in at most one or two figures naturally; if no figure fits a scene, stay qualitative ("checks far more than you'd think").
- The cta drives to GTOCentral to explore the spot themselves.
- Voice: sharp, expert, no fluff, no emojis.`;

export async function generateStoryboard(brief: Brief, facts = "") {
  const label = brief.board ? `${brief.topic} — ${brief.board}` : brief.topic;
  const factsBlock = facts.trim()
    ? `\n\nFACTS (real solver numbers for this spot — cite only these):\n${facts.trim()}`
    : "";
  const completion = await openai.chat.completions.create({
    model: config.textModel,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Brief topic: ${brief.topic}\nConcept: ${brief.concept}\nSpot label: ${label}\nThe preflopMatrix, flowchart and barCharts scenes each show real solver-backed visuals for this spot. Write copy that frames each view compellingly.${factsBlock}\n\nWrite the storyboard.`,
      },
    ],
    response_format: { type: "json_schema", json_schema: JSON_SCHEMA },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  return Storyboard.parse(JSON.parse(raw));
}

const NARRATE_SCHEMA = {
  name: "flowchart_narration",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      voiceover: { type: "string", description: "2-3 short, punchy spoken sentences narrating the camera walkthrough" },
    },
    required: ["voiceover"],
  },
} as const;

const NARRATE_SYSTEM = `You are scripting the voiceover for ONE scene of a GTOCentral poker Reel: a camera move across a postflop decision-tree (flowchart).
You are given the exact decision-tree nodes the camera zooms to, IN ORDER. Write 2-3 tight, energetic sentences that narrate that specific path for serious poker players.
Rules:
- Reference the ACTUAL nodes by what they represent (e.g. the open, a specific board feature, a bet/check decision) and follow the camera's order.
- You may cite frequencies/sizes that appear in a node's summary text, and ONLY those — never invent or re-round numbers.
- No emojis, no fluff, no meta talk about "the flowchart" — describe the decisions themselves.`;

// Contextual re-script for a flowchart scene: turn the chosen camera path
// (ordered nodes + their on-screen strategy) into a narration that walks it.
export async function narrateFlowchart(
  topic: string,
  concept: string,
  nodes: { label: string; summary?: string; edge?: string }[]
): Promise<string> {
  const list = nodes.length
    ? nodes.map((n, i) => `${i + 1}. ${n.edge ? `(reached when: ${n.edge}) ` : ""}${n.label}${n.summary ? ` — ${n.summary}` : ""}`).join("\n")
    : "1. The full decision tree (zoomed out)";
  const completion = await openai.chat.completions.create({
    model: config.textModel,
    messages: [
      { role: "system", content: NARRATE_SYSTEM },
      {
        role: "user",
        content: `Topic: ${topic}\nConcept: ${concept}\n\nThe camera moves through these nodes IN THIS ORDER:\n${list}\n\nWrite the voiceover for this camera path.`,
      },
    ],
    response_format: { type: "json_schema", json_schema: NARRATE_SCHEMA },
  });
  const raw = completion.choices[0]?.message?.content ?? "{}";
  return String(JSON.parse(raw).voiceover ?? "");
}

const NODE_LINES_SCHEMA = {
  name: "flowchart_node_lines",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      lines: {
        type: "array",
        items: { type: "string" },
        description: "One short spoken line per node, in the given order — same count as the nodes",
      },
    },
    required: ["lines"],
  },
} as const;

const NODE_LINES_SYSTEM = `You are scripting a GTOCentral poker Reel where the camera zooms to each decision-tree node in turn, and each node is narrated as it's shown.
Write ONE short, punchy spoken line (roughly one sentence, ~8-16 words) for EACH node, in the given order, so they read as a continuous walkthrough of the tree.
Rules:
- Each node may list "reached when: <condition>" — that is the DECISION/branch taken to get there (e.g. the board's top card, whether there's a flush draw). Narrate the walk: speak that condition ("When the top card is an Ace…", "With a flush draw out there…") so the path is clear, then what the solver does there, citing ONLY frequencies given (never invent).
- Lines must flow one into the next; the first sets up the spot, the last lands the lesson.
- Return exactly one line per node. No emojis, no fluff.`;

// One narration line per flowchart node (for the synced per-node camera).
export async function narrateFlowchartNodes(
  topic: string,
  concept: string,
  nodes: { label: string; summary?: string; edge?: string }[]
): Promise<string[]> {
  if (!nodes.length) return [];
  const list = nodes.map((n, i) => `${i + 1}. ${n.edge ? `(reached when: ${n.edge}) ` : ""}${n.label}${n.summary ? ` — ${n.summary}` : ""}`).join("\n");
  const completion = await openai.chat.completions.create({
    model: config.textModel,
    messages: [
      { role: "system", content: NODE_LINES_SYSTEM },
      {
        role: "user",
        content: `Topic: ${topic}\nConcept: ${concept}\n\nNodes the camera visits IN ORDER (write one line each, ${nodes.length} total):\n${list}\n\nWrite the lines.`,
      },
    ],
    response_format: { type: "json_schema", json_schema: NODE_LINES_SCHEMA },
  });
  const j = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
  const lines = Array.isArray(j.lines) ? j.lines.map((l: unknown) => String(l)) : [];
  // Normalise to exactly one line per node.
  return nodes.map((_, i) => lines[i] ?? "");
}

const BARS_SCHEMA = {
  name: "bar_narration",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      voiceover: { type: "string", description: "2-3 short, punchy spoken sentences about the pattern across the bars" },
      subtext: { type: "string", description: "Short on-screen support line, <= 8 words" },
    },
    required: ["voiceover", "subtext"],
  },
} as const;

const BARS_SYSTEM = `You are scripting ONE scene of a GTOCentral poker Reel: a bar chart showing how the optimal strategy shifts across a board/hand property.
Write a tight, energetic voiceover (2-3 sentences) plus a short on-screen subtext (<= 8 words) for serious poker players.
Rules:
- The bars are grouped along the given property; each group shows its action mix. Describe the ACTUAL pattern — which groups bet/raise most vs least, and what that means.
- You may cite the exact figures provided and ONLY those — never invent or re-round other numbers.
- No emojis, no fluff.`;

// Re-script a bar-chart scene from its current property + real bar data.
export async function narrateBars(
  topic: string,
  concept: string,
  property: string,
  categories: CategoryStrategy[]
): Promise<{ voiceover: string; subtext: string }> {
  const facts = categories
    .map((c) => {
      const agg = Math.round(
        c.actions.filter((a) => a.kind === "bet" || a.kind === "raise").reduce((s, a) => s + a.freq, 0)
      );
      const top = [...c.actions].sort((a, b) => b.freq - a.freq)[0];
      return `${c.category}: ${agg}% bet/raise${top ? ` (most common: ${top.action} ${Math.round(top.freq)}%)` : ""}`;
    })
    .join("\n");
  const completion = await openai.chat.completions.create({
    model: config.textModel,
    messages: [
      { role: "system", content: BARS_SYSTEM },
      {
        role: "user",
        content: `Topic: ${topic}\nConcept: ${concept}\nProperty (x-axis): ${property.replace(/_/g, " ")}\n\nBar groups (real frequencies):\n${facts || "(no data)"}\n\nWrite the voiceover + subtext for this bar chart.`,
      },
    ],
    response_format: { type: "json_schema", json_schema: BARS_SCHEMA },
  });
  const j = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
  return { voiceover: String(j.voiceover ?? ""), subtext: String(j.subtext ?? "") };
}

function comboWeight(combo: string): number {
  if (combo.length === 2) return 6;
  return combo.endsWith("s") ? 4 : 12;
}

function pct(n: number): string {
  return `${Math.round(n)}%`;
}

function preflopMatrixFacts(line: string[] = [], grid: RangeCell[] = []): string {
  const rows: string[] = [
    line.length
      ? `Preflop action sequence: ${line.join(", ")}.`
      : "Preflop action sequence: no action yet; this is the first/root preflop decision.",
  ];

  if (!grid.length) return rows.join("\n");

  let raise = 0;
  let call = 0;
  let fold = 0;
  let total = 0;
  for (const c of grid) {
    const w = comboWeight(c.combo);
    raise += c.raise * w;
    call += c.call * w;
    fold += c.fold * w;
    total += w;
  }
  if (total > 0) {
    rows.push(`Overall range mix: raise ${pct((raise / total) * 100)}, call/check ${pct((call / total) * 100)}, fold ${pct((fold / total) * 100)}.`);
  }

  const mostPlayed = grid
    .map((c) => ({ combo: c.combo, play: (c.raise + c.call) * 100, raise: c.raise * 100, call: c.call * 100, fold: c.fold * 100 }))
    .sort((a, b) => b.play - a.play || b.raise - a.raise || a.combo.localeCompare(b.combo))
    .slice(0, 8)
    .map((c) => `${c.combo}: play ${pct(c.play)} (raise ${pct(c.raise)}, call/check ${pct(c.call)}, fold ${pct(c.fold)})`);
  if (mostPlayed.length) rows.push(`Most played hands:\n${mostPlayed.join("\n")}`);

  const mostRaised = grid
    .map((c) => ({ combo: c.combo, raise: c.raise * 100 }))
    .filter((c) => c.raise > 0)
    .sort((a, b) => b.raise - a.raise || a.combo.localeCompare(b.combo))
    .slice(0, 8)
    .map((c) => `${c.combo}: raise ${pct(c.raise)}`);
  if (mostRaised.length) rows.push(`Highest raise-frequency hands:\n${mostRaised.join("\n")}`);

  return rows.join("\n");
}

const PREFLOP_MATRIX_SYSTEM = `You are scripting ONE scene of a GTOCentral poker Reel: a preflop range matrix.
The visual is a 13x13 hand matrix for the exact preflop action sequence supplied.
Write a tight, energetic voiceover (2-3 short sentences) plus a short on-screen subtext (<= 8 words) for serious poker players.
Rules:
- Treat the action sequence as the source of truth for which preflop decision this matrix represents.
- If the sequence says "no action yet", describe it as the first/root preflop decision, not as a postflop spot.
- Explain the strategic shape of the range: how much it raises, calls/checks, folds, and which hands are most active.
- You may cite exact figures listed in the matrix facts, and ONLY those figures. Never invent or re-round other numbers.
- Do not mention missing data, APIs, load IDs, or "this scene shows". No emojis, no fluff.`;

export async function narratePreflopMatrix({
  topic,
  concept,
  headline,
  preflopLine,
  rangeGrid,
}: {
  topic: string;
  concept: string;
  headline?: string;
  preflopLine?: string[];
  rangeGrid?: RangeCell[];
}): Promise<{ voiceover: string; subtext: string }> {
  const facts = preflopMatrixFacts(preflopLine, rangeGrid);
  const completion = await openai.chat.completions.create({
    model: config.textModel,
    messages: [
      { role: "system", content: PREFLOP_MATRIX_SYSTEM },
      {
        role: "user",
        content: `Topic: ${topic}
Concept: ${concept}
Current headline: ${headline || "(none)"}

Matrix facts:
${facts}

Write the preflop matrix voiceover + subtext.`,
      },
    ],
    response_format: { type: "json_schema", json_schema: SCENE_SCRIPT_SCHEMA },
  });
  const j = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
  return { voiceover: String(j.voiceover ?? ""), subtext: String(j.subtext ?? "") };
}

const SCENE_SCRIPT_SCHEMA = {
  name: "scene_script",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      voiceover: { type: "string", description: "2-3 short, punchy spoken sentences for this scene" },
      subtext: { type: "string", description: "Short on-screen support line, <= 8 words" },
    },
    required: ["voiceover", "subtext"],
  },
} as const;

const SCENE_SCRIPT_SYSTEM = `You are scripting ONE scene of a GTOCentral poker Reel for serious poker players.
Write a tight, energetic voiceover (2-3 short sentences) and a short on-screen subtext (<= 8 words).
Use the supplied scene facts as the source of truth. You may cite exact figures listed there, and ONLY those figures.
Do not invent solver numbers, don't mention missing data, and avoid meta phrasing like "this scene shows". No emojis, no fluff.`;

export async function narrateSceneFromFacts({
  topic,
  concept,
  sceneType,
  headline,
  facts,
}: {
  topic: string;
  concept: string;
  sceneType: string;
  headline?: string;
  facts: string;
}): Promise<{ voiceover: string; subtext: string }> {
  const completion = await openai.chat.completions.create({
    model: config.textModel,
    messages: [
      { role: "system", content: SCENE_SCRIPT_SYSTEM },
      {
        role: "user",
        content: `Topic: ${topic}
Concept: ${concept}
Scene type: ${sceneType}
Current headline: ${headline || "(none)"}

Scene facts:
${facts || "(No numeric data supplied; stay qualitative and tied to the scene type.)"}

Generate the scene script.`,
      },
    ],
    response_format: { type: "json_schema", json_schema: SCENE_SCRIPT_SCHEMA },
  });
  const j = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
  return { voiceover: String(j.voiceover ?? ""), subtext: String(j.subtext ?? "") };
}
