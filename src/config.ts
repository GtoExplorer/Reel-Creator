import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name} (copy .env.example to .env)`);
  return v;
}

export const config = {
  openaiApiKey: required("OPENAI_API_KEY"),
  textModel: process.env.OPENAI_TEXT_MODEL ?? "gpt-4o",
  ttsModel: process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts",
  ttsVoice: process.env.OPENAI_TTS_VOICE ?? "onyx",
  ttsSpeed: Number(process.env.OPENAI_TTS_SPEED ?? "1.12"), // >1 = snappier delivery
  // gpt-4o-mini-tts is steerable — this drives the delivery/energy, not the words.
  ttsInstructions:
    process.env.OPENAI_TTS_INSTRUCTIONS ??
    "Personality: a high-energy, charismatic poker coach hyping up serious, ambitious players. " +
      "Emotion: genuinely excited and confident — like you're revealing a secret edge. " +
      "Delivery: FAST, punchy and dynamic, with big pitch variation and hard emphasis on key words; ride the energy up through each line. Absolutely never flat, dry or monotone. " +
      "Pacing: quick and lively with tight, snappy phrasing — keep it moving. " +
      "Stay sharp and professional, not goofy or salesy.",
  transcribeModel: process.env.OPENAI_TRANSCRIBE_MODEL ?? "whisper-1",
  solverApiBase: process.env.SOLVER_API_BASE ?? "",
  solverApiToken: process.env.SOLVER_API_TOKEN ?? "",
  // Live webapp capture (Playwright). Point at the local dev server's Explorer.
  explorerUrl: process.env.EXPLORER_URL ?? "http://localhost:3000/explorer",
  flowchartSelector: process.env.FLOWCHART_SELECTOR ?? ".react-flow",
  flowchartReadySelector: process.env.FLOWCHART_READY_SELECTOR ?? ".react-flow__node",
  explorerSessionSecret: process.env.EXPLORER_SESSION_SECRET ?? "",
  explorerLoginEmail: process.env.EXPLORER_LOGIN_EMAIL ?? "",
};
