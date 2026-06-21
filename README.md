# GTOCentral Reels Pipeline

Turns a poker spot brief into a vertical Instagram Reel:

```text
brief/load id
  -> fetch solver data + decision tree
  -> script + storyboard (OpenAI)
  -> voiceover + caption timing (OpenAI)
  -> Remotion render
  -> out/<id>/reel.mp4 + caption.txt
```

The model writes narration and copy only. Frequencies, ranges, board buckets, and the flowchart come from the solver/API data path.

## Setup

```bash
cd reels-pipeline
npm install
cp .env.example .env
```

Fill in `OPENAI_API_KEY`. For real solver data, set:

- `EXPLORER_URL`: origin/path for the webapp whose `/api/gto` proxy should be used.
- `EXPLORER_SESSION_SECRET` and `EXPLORER_LOGIN_EMAIL`: used to mint the `gtoc_session` cookie for authenticated API requests.

## Reels Studio

```bash
npm run dev
```

Open the printed Next.js URL. If the GTOCentral webapp already owns port 3000, run this studio on another port:

```bash
npm run dev -- -p 4000
```

The Studio lets you:

- Create a draft from a load ID or a comma-separated preflop line.
- Render the decision tree natively from `/api/gto/tree/{loadId}/{street}/{leafs}/`.
- Click tree nodes/edge chips to build camera paths.
- Reorder/add/delete scenes and edit copy.
- Generate voices/captions, preview with Remotion Player, and render MP4.

## Native Flowcharts

Flowcharts are no longer screenshots from the production Explorer. The pipeline resolves or accepts a `loadId`, fetches the tree data through the API proxy, lays it out with Dagre, and renders it as SVG in both the editor and Remotion.

That means no Playwright, no browser-driving step, and no dependency on interacting with the live Explorer UI. `EXPLORER_URL` is still used as the webapp origin for `/api/gto`.

## CLI

```bash
npm run generate
npm run generate -- briefs/your-brief.json
```

Output lands in `out/<brief-id>/`:

- `reel.mp4`
- `caption.txt`
- `draft.json`
- `manifest.json`

## Docker

```bash
docker compose up --build
```

The studio runs at `http://localhost:4000`. Generated assets persist through:

- `./out:/app/out`
- `./public/reels:/app/public/reels`

When `EXPLORER_URL` points at `http://localhost:3000/explorer` inside Docker, the entrypoint forwards container `localhost:3000` to the host webapp via `socat`. If `EXPLORER_URL` points at a public origin, the forwarder is harmless.

## Project Layout

| Path | Role |
| ---- | ---- |
| `app/` | Next.js Studio routes and API handlers |
| `components/` | Studio UI |
| `src/data/solverApi.ts` | Authenticated solver/API proxy calls |
| `src/flowchart/` | Native tree fetch, Dagre layout, SVG renderer |
| `src/openai/` | Script, TTS, and caption timing |
| `src/pipeline/` | Draft, voice, and render stages |
| `src/remotion/` | Reel composition and scenes |
| `lib/scenes.ts` | Client-safe scene construction and preview manifest |

## Notes

- Remotion still uses a headless browser internally for video rendering; that is separate from Playwright and requires no Explorer automation.
- The legacy single-file editor remains available with `npm run ui`, but the Next.js Studio is the main workflow.
