# Director Dealings (ddbx.uk) — Claude Code context

## URLs

| Purpose | URL |
|---|---|
| Frontend | https://ddbx.uk |
| Worker / API base | https://api.ddbx.uk |
| API dealings | https://api.ddbx.uk/api/dealings |

## Useful worker admin endpoints

All require POST. No auth (protect via Cloudflare Access if needed).

```bash
# Run the scrape → triage → analyse pipeline now
curl -X POST "https://api.ddbx.uk/__cron/run"

# Backfill today's dealings (paginated, idempotent)
curl -X POST "https://api.ddbx.uk/__backfill?days=1&start=0"

# Backfill last N days starting from offset (chunk to avoid timeouts)
curl -X POST "https://api.ddbx.uk/__backfill?days=5&start=0"
curl -X POST "https://api.ddbx.uk/__backfill?days=5&start=5"

# Re-run Opus analysis on all existing analysed dealings (optional ?month=YYYY-MM)
curl -X POST "https://api.ddbx.uk/__reanalyze?limit=50"

# Trigger morning/afternoon summary tweet manually
curl -X POST "https://api.ddbx.uk/__cron/daily?session=morning&date=YYYY-MM-DD"
curl -X POST "https://api.ddbx.uk/__cron/daily?session=afternoon&date=YYYY-MM-DD"

# Smoke-test tweet auth (sends a real tweet — uses cached/refreshed token)
curl -X POST "https://api.ddbx.uk/__test-tweet?text=hello"
```

## Twitter / X auth (OAuth 2.0 user-context)

Tokens live in D1 (`kv` table). The worker rotates them itself; you only
bootstrap once (or after a refresh-chain break).

**Required wrangler secrets**:
```
wrangler secret put TWITTER_CLIENT_ID
wrangler secret put TWITTER_CLIENT_SECRET
```

**Required X dev-portal config** (one-time):
- App type: confidential client (so client_secret is honoured).
- Scopes: `tweet.read tweet.write users.read offline.access` (the `offline.access` is what gets you a refresh_token).
- Callback URL: `https://api.ddbx.uk/__twitter-auth/callback`.

**Bootstrap (open in browser, signed into the X account that should tweet)**:
```
https://api.ddbx.uk/__twitter-auth/start
```
Hit "Authorize app" on X; the callback persists access+refresh tokens to D1.
Re-run any time the refresh chain breaks (revoked, idle >6 months, etc.).

## Cron schedule (UTC)

| Expression | What |
|---|---|
| `*/15 * * * *` | Scrape → triage → analyse pipeline |
| `30 12 * * 1-5` | Morning summary tweet (12:30 UTC = 13:30 BST) |
| `30 17 * * 1-5` | Close summary tweet (17:30 UTC = 18:30 BST) |

## Stack

- **Frontend**: React + Vite + Tailwind v4 + HeroUI v3, deployed to Cloudflare Pages
- **Worker**: Cloudflare Workers + Hono router, D1 (SQLite) database
- **Pipeline**: Investegate scraper → Haiku triage → Opus 4.6 deep analysis
- **Data source**: https://www.investegate.co.uk/category/directors-dealings

## Discretion mode (web gating)

The public website intentionally shows only a sliver of the data so the iOS
app remains the canonical surface. Toggle with `VITE_DISCRETION_MODE` —
default is `on`; set to `off` to expose the full unblurred UX.

- **List cap**: 3 suggested deals (newest-first, or top-3-by-gain in by-gain mode). Everything else is hidden behind `LockedListFooter` with an App Store CTA.
- **Drawer cap**: the **first** deal opened today shows full analysis; the 2nd and 3rd render dummy text (`src/components/discretion/dummy-analysis.ts`) under a CSS blur with a CTA overlay. Position card and price chart stay unblurred.
- **Storage**: `localStorage` key `ddbx.discretion.viewState` shaped `{ date: "YYYY-MM-DD", viewedDealIds: string[] }`. Resets at UK midnight (Europe/London).
- **Module**: all logic lives in `src/lib/discretion.ts` (`useDiscretion` hook, `recordView`, `hasFullAccess`, `LIST_CAP`).
