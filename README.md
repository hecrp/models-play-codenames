# Models play Codenames

**Codenames** matches between AI models (and, if you like, you in one of the seats), built with **Next.js 16**, **React 19**, **Tailwind CSS 4** and the **OpenRouter API**. The interface and the game itself (words, prompts and table talk) are available in **English and Spanish**.

## About this project

This project was born out of the work done during an **OpenCode course** held at my organization. It has since been rescued and improved so that others can enjoy it, build on it, or extend the idea in their own direction. Issues, forks and pull requests are welcome.

## Getting started

Requirements: **Node.js 24+** and **pnpm 12** (the version pinned in `packageManager`). If you don't have pnpm, install it with `npm install -g pnpm@12`. The Corepack bundled with some Node 24 releases can't launch pnpm 12 and fails with `Cannot find module …/pnpm.cjs`; installing pnpm through npm avoids it.

```bash
pnpm install
cp .env.example .env.local     # on Windows: Copy-Item .env.example .env.local
# edit .env.local and paste your key from https://openrouter.ai/keys
pnpm dev
```

Open http://localhost:3000 (the old `/codenames` route redirects there).

You can also paste the key in **Settings → OpenRouter API key**: it is stored in `localStorage` and sent only to your own server in the `x-openrouter-key` header.

## Features

- **Four seats**: red and blue spymaster and operative, each with its own model, temperature, reasoning effort and avatar. Presets: same model, red vs blue, spymasters vs operatives and crossed (each model plays the opposite role on the other team), plus ready-made matchups and example models, all with an estimated cost per game. The examples are popular, cheap models on OpenRouter that keep a typical game at around $0.002–$0.02.
- **Play yourself**: you can take a seat. As spymaster you type the clue; as operative you click a card or type it (case- and accent-insensitive; if it doesn't match, `deepseek/deepseek-v4-flash` tries to interpret it and asks you to confirm). While you play there is no god mode and the server never sends the hidden colors.
- **Languages**: EN/ES switch in the header. New games are created in the interface language (word bank, rules, prompts, referee messages and history).
- **Official rules**: one-word clue + number (0 = unlimited guesses), up to number + 1 guesses, at least one guess per turn, plurals and derived forms forbidden, a win can happen on the opponent's turn. House rule: 40-turn limit.
- **Table talk**: every move includes a short line (`say`) shown in the interface and carried in the public history; hidden words are masked with "…".
- **Controls**: play, pause, manual mode (next move / end turn), speed 0.25×–2×, god mode and abort.
- **Replay** without calling the models again, exportable with `?format=jsonl`.
- **Persistence**: Node's built-in SQLite at `data/codenames/codenames.db` (ignored by git).
- **Reasoning effort**: for models that reason, each seat picks a level (off, low, medium, high…). Only the levels the model accepts are offered, according to the OpenRouter catalog; "Auto" uses low. The output budget grows with the effort so reasoning never eats the move.
- **Resilience**: retries with backoff and `Retry-After` on 429/5xx; if OpenRouter keeps failing, the game pauses instead of losing turns. Calls go to providers that support every parameter sent (falling back to any provider if none does). Answers cut off by the token limit are retried once with less reasoning, and common malformed answers are rescued instead of costing an attempt: the move written as JSON text, identical duplicate calls, and arguments truncated or corrupted mid-JSON.

## Endpoints

| Method | Route | Description |
| ------ | ----- | ----------- |
| `GET`  | `/api/models` | OpenRouter model catalog (with fallback). |
| `POST` | `/api/codenames/games` | Creates a game (seats, seed, language). |
| `GET`  | `/api/codenames/games` | Lists recent games. |
| `GET`  | `/api/codenames/games/[id]` | Spectator state + runtime state. |
| `GET`  | `/api/codenames/games/[id]/events` | Resumable SSE with `Last-Event-ID`. |
| `POST` | `/api/codenames/games/[id]/control` | `pause`, `resume`, `step`, `step_turn`, `abort`, `speed`. |
| `POST` | `/api/codenames/games/[id]/human` | The human player's move (`action`) or interpretation of a typed card (`resolve`). |
| `GET`  | `/api/codenames/games/[id]/replay` | Full event list; `?format=jsonl` to export. |

Optional headers: `x-openrouter-key` (key from Settings) and `x-locale` (`es`/`en`, language of error messages).

Environment variables:

- `OPENROUTER_API_KEY` (recommended)
- `OPENROUTER_SITE_URL` (default `http://localhost:3000`)
- `OPENROUTER_SITE_NAME` (default `Models play Codenames`)
- `CODENAMES_MAX_ACTIVE` (default `2`)
- `CODENAMES_DATA_DIR` (default `./data/codenames`)
- `CODENAMES_RESOLVER_MODEL` (default `deepseek/deepseek-v4-flash`)

## Command-line games

```bash
# Token-free simulation: 1,000 games with random agents
pnpm codenames:simulate 1000

# Real game with a cheap model
pnpm codenames:play --model=openai/gpt-oss-20b --seed=42 --max-cost=0.05

# Reasoning effort: --reasoning for every seat, overridden per team or role
pnpm codenames:play --model=deepseek/deepseek-v4.1-flash-1017 --reasoning=low --spymaster-reasoning=high
```

## Tests

```bash
pnpm test        # engine, views, orchestrator, simulation, English, human player and OpenRouter
pnpm typecheck
pnpm build
```

## Notes and limitations

- **Production security**: with `OPENROUTER_API_KEY` set, anyone who can reach the URL can create games and spend your credit. Add authentication and rate limits before deploying it publicly.
- A key sent from the browser is kept **in memory only** for the duration of the game; it is never written to the database or to the events.
- **Single instance**: the orchestrator lives in the Node process. Restarting the server interrupts the game, but state and events are in SQLite and it can be resumed. Serverless or multi-replica deployments would need a worker/queue.
- **Node 24+**: uses `node:sqlite`, no native dependencies.
- `cacheComponents` is enabled in `next.config.ts`; the catalog and game `GET` routes force dynamic rendering.

## License and trademark

The code is released under the [MIT License](LICENSE).

Codenames is a board game designed by Vlaada Chvátil and published by Czech Games Edition; the name is their trademark. This is an unofficial fan project for experimenting with AI models, not affiliated with or endorsed by Czech Games Edition. If you enjoy the game, buy the real thing.
