# Director Dealings — System Diagram Brief

This is a brief for Claude Design. Please draw a single technical architecture diagram that shows how the Director Dealings system works end-to-end. The intended audience is a technical reader who has never seen the system before.

## What the system does

Director Dealings ingests UK director share-trade disclosures, enriches them with LLM analysis and price data, and serves the result to two consumers: a public web app and a native iOS app. It also posts twice-daily summary tweets.

## Components to draw

Group nodes by zone (left → right makes sense, but use whatever reads cleanest):

### 1. External data sources (left edge)
- **Investegate** (`investegate.co.uk/category/directors-dealings`) — HTML scraping target, source of raw director-dealing announcements.
- **Stock price API** — used to fetch historical and latest prices.
- **FX API** — GBP/USD rates.
- **UK news API** — general UK market news strip.

### 2. Cloudflare Worker — `api.ddbx.uk` (the centre of the diagram)

A single Cloudflare Worker (Hono router) is the brain. It runs three kinds of work:

**a) Scheduled pipeline (Cron `*/15 * * * *`)**
A four-stage pipeline; show as a chain of boxes inside the Worker:

1. **Scrape** — fetches Investegate, parses new dealings.
2. **Triage** — Anthropic **Claude Haiku** classifies each dealing (noteworthy / routine / skip).
3. **Analyse** — Anthropic **Claude Opus 4.6** writes deep analysis for noteworthy dealings.
4. **Enrich** — pulls company profile, price history, FX, performance metrics.

After enrichment, the Worker:
- Writes results to D1.
- Sends **APNs push notifications** to iOS devices whose `notify_level` matches the dealing's rating.

**b) Daily summary tweets (Cron `30 12 * * 1-5` and `30 17 * * 1-5`)**
- Morning summary at 12:30 UTC, close summary at 17:30 UTC, weekdays only.
- Posts to **X / Twitter** via OAuth 2.0 user-context (tokens auto-rotated, stored in D1 `kv` table).

**c) Public REST API (`/api/*`)**
Endpoints consumed by both web and iOS:
- `GET /api/dealings`, `/api/dealings/:id`
- `GET /api/portfolio`
- `GET /api/directors/:id`
- `GET /api/prices/history`, `/api/prices/on`, `/api/prices/latest`
- `GET /api/fx/gbp-per-usd`
- `GET /api/news/uk`
- `POST /api/devices`, `DELETE /api/devices` — iOS device-token registration for APNs

There are also admin-only `/__*` endpoints (backfill, reanalyse, twitter-auth bootstrap, manual cron triggers) — show as a small "Admin" affordance on the Worker, no need to enumerate.

### 3. Storage
- **Cloudflare D1** (SQLite) attached to the Worker. Tables of note: `dealings`, `directors`, `portfolio`, `device_tokens` (iOS push registrations), `kv` (Twitter OAuth tokens).

### 4. LLM provider
- **Anthropic API** — used by the Worker for both Haiku (triage) and Opus 4.6 (analysis). Show as one external box with two arrows from the pipeline (or one arrow labelled "Haiku + Opus 4.6").

### 5. Consumers (right edge)

- **Web app — `ddbx.uk`**
  - React + Vite + Tailwind v4 + HeroUI v3, deployed to **Cloudflare Pages**.
  - Calls `api.ddbx.uk/api/*`.
  - Note on the diagram: web runs in **discretion mode** by default — only a sliver of data is shown (max 3 trades per day, blurred placeholders for the rest, blurred analysis after the first deal). The iOS app is the canonical surface.

- **iOS app (mobile, second consumer)**
  - Native iOS client.
  - Calls the same `api.ddbx.uk/api/*` endpoints — full data, no discretion gating.
  - Registers device tokens via `POST /api/devices`.
  - Receives **APNs push notifications** from the Worker when noteworthy dealings land.

- **X / Twitter followers**
  - Receive the twice-daily summary tweets posted by the Worker. Show as a small downstream node off the Twitter API box.

## Flows to make legible

The diagram should make these four flows easy to trace:

1. **Ingestion flow** (every 15 min):
   Investegate → Worker.Scrape → Worker.Triage (Anthropic Haiku) → Worker.Analyse (Anthropic Opus 4.6) → Worker.Enrich (Prices + FX) → D1.

2. **Push flow** (after a noteworthy dealing is written):
   Worker → APNs → iOS app.

3. **Read flow** (on demand):
   Web app and iOS app → `api.ddbx.uk/api/*` → D1 (and pass-through to Prices/FX/News when needed).

4. **Tweet flow** (12:30 and 17:30 UTC, weekdays):
   Worker (cron) → reads D1 → X/Twitter API → followers.

## Visual hints

- Put **external sources** on the left, **Worker + D1** in the middle, **consumers** on the right.
- Use a clear icon/colour for the **two cron schedules** (15-min pipeline vs. daily tweets) so they're not confused.
- Label arrows with the protocol or trigger (`HTTP`, `cron`, `APNs`, `OAuth 2.0`).
- Call out that the Worker is a **single Cloudflare Worker** — not multiple services.
- Mark the **iOS app** clearly as a first-class consumer alongside the web app, not an afterthought. It is the canonical surface; web is intentionally gated.
- No need to draw individual API endpoints — one labelled "REST API" arrow from each consumer to the Worker is enough.

## Out of scope (don't draw)

- Internal Worker file structure.
- Build/deploy pipeline (Wrangler, Pages CI).
- Cloudflare Access / auth for admin endpoints.
