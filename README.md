# GTOCentral Reels Pipeline (POC)

Templated pipeline that turns a one-file **brief** into a finished, vertical
(1080×1920) Instagram Reel: AI script → AI voiceover → AI caption timing →
animated data-graphics render → MP4 + suggested caption, ready for **you to
review and post**.

This is a proof-of-concept vertical slice. It renders end-to-end with **mock
solver data** if no SolverAPI token is configured, so you can see a full reel
before wiring up the real backend.

## How it works

```
brief.json
  → fetch solver data        (src/data/solverApi.ts — real API or mock)
  → script + storyboard       (OpenAI GPT, structured JSON)        [AI]
  → per scene: voiceover       (OpenAI TTS → mp3)                  [AI]
  → per scene: caption timing  (OpenAI Whisper → word timestamps)  [AI]
  → manifest.json
  → render                     (Remotion: animated React scenes)
  → out/<id>/reel.mp4 + caption.txt   → you review → post
```

**Design choice that matters:** the model writes the *script and copy*, but it
**never produces the numbers**. All frequencies/ranges come from the SolverAPI
(or mock), so nothing inaccurate ends up on screen. The model is told to speak
about the data qualitatively only.

## Setup

```bash
cd reels-pipeline
npm install
cp .env.example .env      # add your OPENAI_API_KEY
```

## Reels Studio — the Next.js app (easiest)

```bash
npm run dev    # then open http://localhost:3000  (use another port if the
               # webapp owns :3000, e.g. `npm run dev -- -p 4000`)
```

A sidebar + canvas studio:
- **Sidebar** — "New reel", a live **browser-status dot** (Playwright health),
  and a gallery of finished reels (click to re-edit any one).
- **Brief** — topic / concept / preflop line / board → captures the flowchart,
  pulls the data, writes the script (streamed logs).
- **Edit** (canvas) — modular scenes you can **reorder (↑↓), delete (✕), or add**
  (any type, populated from the captured asset pool). Per scene: rewrite
  headline / subtext / **voiceover**; on a flowchart scene build a **camera
  path** (pick nodes by name + zoom per waypoint) and **↻ Rescript from camera
  path** so the narration describes exactly those nodes; choose the voice — AI,
  **record** (browser mic), or **upload**.
- **Live preview** — a real **Remotion Player** to the right scrubs the animated
  reel as you edit (visuals immediately; **Generate voices** adds real audio +
  karaoke captions). **Render MP4** produces the final file, which streams back
  with HTTP range support and lands in the sidebar gallery.

(The gto-central webapp dev server must be running for the flowchart capture.)

The legacy single-file editor is still available at `npm run ui`
(http://localhost:5673) but the Next.js studio above supersedes it.

> First run needs the Playwright browser: `npx playwright install chromium`.
> The studio's sidebar dot turns green once it can launch.

### Run the studio in Docker (no host Playwright install)

Docker removes the host-path / version-skew Playwright problem entirely: the
image is built `FROM mcr.microsoft.com/playwright:v1.61.0-noble`, which **ships
the matching chromium + chrome-headless-shell** baked in (and Remotion's render
browser is pre-fetched at build).

```bash
cd reels-pipeline
docker compose up --build        # studio → http://localhost:4000
```

- Secrets come from your existing `.env` (`env_file`); they're never baked into
  the image.
- Keep `gto-central-next` running on the **host** at :3000. The container's
  entrypoint runs `socat` to forward `localhost:3000` → `host.docker.internal:3000`,
  so the headless browser hits the webapp at `http://localhost:3000` — the *same
  origin* as on the host. This matters because the webapp runs `next dev` with
  **Turbopack**, whose HMR WebSocket is rejected from a different origin
  (`host.docker.internal`), which leaves the Explorer unhydrated/blank and the
  capture with nothing to click. (Override the target with `WEBAPP_HOST` /
  `WEBAPP_PORT` if your webapp lives elsewhere.)
- Generated reels persist to the host through volume mounts (`./out`,
  `./public/reels`).
- If you bump the `playwright` package version, bump `PLAYWRIGHT_VERSION` in
  `docker-compose.yml` (and the `FROM` tag) to the matching image so the
  browsers stay in sync.

The whole reel generator (capture + OpenAI + Remotion + Player + editor UI) is
the single `studio` service — `docker compose up --build` is the entire app. The
gto-central webapp it captures from stays external (set `WEBAPP_HOST` / `EXPLORER_URL`).

### Expose on a custom domain (Cloudflare Tunnel)

A `cloudflared` service is bundled behind a compose **profile**, so it's opt-in:

```bash
docker compose --profile tunnel up --build   # studio + tunnel
docker compose up --build                     # studio only (no tunnel)
```

One-time setup:
1. Cloudflare dashboard → Zero Trust → **Networks → Tunnels → Create a tunnel**
   (Cloudflared type). Copy the **tunnel token**.
2. On that tunnel, add a **Public Hostname**: your domain → service
   `http://studio:4000` (cloudflared shares the compose network and resolves the
   `studio` service by name — no ports need publishing).
3. Put the token in `.env`: `TUNNEL_TOKEN=...`, then run the `--profile tunnel` command.

> ⚠ The studio has **no built-in auth** — anyone with the URL can generate reels
> (which spend your OpenAI credits) and see the gallery. Put **Cloudflare Access**
> (Zero Trust → Access → Applications) in front of the hostname to lock it down.
> Also note: a publicly-hosted studio must be able to reach the webapp it captures
> — point `EXPLORER_URL`/`WEBAPP_HOST` at a webapp reachable from where it runs.

## Generate a reel (CLI)

```bash
npm run generate                       # uses briefs/sample-3bet-pot.json
npm run generate -- briefs/your.json   # any brief
```

Output lands in `out/<brief-id>/`:
- `reel.mp4` — the finished video
- `caption.txt` — title + hashtags for the post

A brief only needs `topic`, `concept`, and `preflopLine` — the **load id is
auto-detected** from the line, and all data is fetched through the running
webapp's `/api/gto` proxy so the flowchart and the charts are always the same
spot. (`loadId` in the brief still overrides if you want a specific one.)

## Preview the look (no OpenAI key needed)

The composition ships with a full 4-scene sample (mock data + placeholder
caption timing), so you can see and iterate on the visuals before wiring AI:

```bash
npm run studio                                    # live editor
npm run render -- out/sample-reel.mp4             # render the silent sample
```

Design the scene templates in `src/remotion/scenes/*` and restyle everything
(colours, font, glow) from `src/remotion/theme.ts`. Instagram-safe margins live
in `SAFE` in the same file. Typography is Inter via `@remotion/google-fonts`.

**Brand parity:** `theme.ts` mirrors the webapp tokens in
`gto-central-next/app/globals.css` (gold `#d0ab1d` accent, `#18191a` surfaces,
the real range/action colours), and the real `gto-inline.svg` logo is used in
`public/brand/`. Keep these in sync if the app's brand changes.

## Featuring the live Explorer flowchart

The hero data scene captures the **real** GTOCentral Explorer flowchart (the
xyflow decision tree) and Ken-Burns push-ins on it — the actual product UI, not
a rebuild.

1. Run the webapp's dev server: in `gto-central-next`, `npm run dev` (serves
   `http://localhost:3000`).
2. Make sure `EXPLORER_URL` in `.env` points at the Explorer (default
   `http://localhost:3000/explorer`).
3. `npm run generate` — `src/capture/flowchart.ts` (Playwright) screenshots the
   `.react-flow` element at 2x and the reel composites it.

If the dev server isn't reachable, the flowchart scene **falls back** to the
native strategy-by-strength chart, so a reel is always produced. If your
Explorer needs interaction before the tree renders (select a load / board /
press Analyse), pass an `interact` callback to `captureFlowchart` — that hook is
already there.

## Add a music bed

Drop a licensed track at `public/reels/<id>/music.mp3` and set `"music":
"reels/<id>/music.mp3"` on the manifest (or extend the pipeline to copy a
default track in). It loops under the voiceover at low volume.

## Project layout

| Path | Role |
|------|------|
| `briefs/*.json` | One file per reel — topic, concept, spot (loadId/board) |
| `src/data/solverApi.ts` | Pulls real solver data; mock fallback |
| `src/openai/script.ts` | GPT → storyboard (scene order + copy + narration) |
| `src/openai/voiceover.ts` | OpenAI TTS → mp3 per scene |
| `src/openai/captions.ts` | Whisper → word-level timestamps |
| `src/pipeline/run.ts` | Orchestrator, writes manifest, invokes render |
| `src/remotion/scenes/*` | The animated templates (hook, range grid, freq bars, CTA) |
| `src/remotion/theme.ts` | Brand colours/fonts — restyle every reel here |

## What's stubbed / next steps

- **Real solver mapping** — `solverApi.ts` fetches the aggregate endpoint but
  currently maps to mock; wire the real response → `RangeCell[]`/`FreqBar[]`.
- **Music bed** — add a licensed track + duck under VO (Remotion `<Audio>` +
  volume automation).
- **More templates** — board run-outs, EV comparisons, hand-history replays.
- **Auto-publish** — Instagram Graph API (Reels) once a Business/Creator
  account is connected. Kept as a manual review step by design for now.
- **Scale rendering** — Remotion Lambda if volume grows.

## Cost per reel (rough)

GPT storyboard: a few cents · OpenAI TTS: ~1¢ per 1k chars · Whisper: ~0.6¢/min ·
Remotion: free (your own compute). So well under ~$0.10/reel in API cost,
mostly covered by your OpenAI credits.
