# Director Dealings

Opinionated, automated analysis of UK director (PDMR) share purchases. Nightly
pipeline scrapes Sharecast, triages each trade with Haiku, performs deep
reasoning with Opus on the promising ones, and tracks a synthetic £100-per-pick
portfolio so you can see whether the ratings actually predict outcomes.

## Stack

- **Frontend**: Vite + React + Tailwind + HeroUI, deployed on Cloudflare Pages
- **API / cron**: Cloudflare Worker (Hono) with Cloudflare Cron Triggers
- **DB**: Cloudflare D1 (SQLite)
- **Scraping**: Cloudflare Browser Rendering (`@cloudflare/puppeteer`)
- **LLM**: Anthropic API — Claude Haiku 4.5 (triage) + Claude Opus 4.6 (deep analysis)
- **Prices**: Yahoo Finance chart API (called directly with `fetch`)

## Local dev

```bash
npm install

# One-time: create the D1 database and apply schema
wrangler d1 create director-dealings
# Paste the returned database_id into wrangler.toml
npm run db:init:local

# Set your Anthropic API key as a Worker secret
wrangler secret put ANTHROPIC_API_KEY

# Run frontend + Worker together
npm run dev:all
# Frontend: http://localhost:5173
# Worker:   http://localhost:8787

# Trigger the pipeline manually
npm run pipeline:run
```

The Vite dev server proxies `/api/*` to the local Worker on port 8787.

Until the pipeline has written real rows to D1, the Worker's API routes fall
back to `worker/fixtures.ts` so all three frontend pages render meaningfully.

## Pipeline

See `worker/pipeline/`:

- `scrape.ts` — Browser Rendering → Sharecast → `dealings` table
- `profile.ts` — Opus builds/refreshes director profiles, cached 30 days
- `triage.ts` — Haiku classifies each trade as `skip | maybe | promising`
- `analyze.ts` — Opus produces structured JSON for survivors (rating, thesis, evidence tables, risks)
- `prices.ts` — Yahoo Finance chart API, cached in the `prices` table
- `performance.ts` — Recomputes 3/6/12/24-month returns per pick

Scheduled daily at 02:00 UTC via `[triggers] crons` in `wrangler.toml`.

## Deploy

```bash
# Worker (API + cron)
wrangler deploy

# Frontend to Cloudflare Pages
npm run build
# then wire the Pages project to this repo's main branch
```
