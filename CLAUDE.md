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
```

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
