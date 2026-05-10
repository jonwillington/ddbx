# Director Dealings (ddbx.uk) — website Claude Code context

This repo is the public website. The data platform (Cloudflare Worker, D1,
scraping/triage/analysis pipeline) was split out into the `ddbx-data` repo
on 2026-05-10. If you're looking for `worker/`, it lives there now.

## URLs

| Purpose | URL |
|---|---|
| Frontend (this repo) | https://ddbx.uk |
| Worker / API base (ddbx-data repo) | https://api.ddbx.uk |
| API dealings | https://api.ddbx.uk/api/dealings |

## Stack

- React + Vite + Tailwind v4 + HeroUI v3, deployed to Cloudflare Pages
- Consumes the public API at `https://api.ddbx.uk/api/*` (set `VITE_API_BASE`
  to override in dev/preview)

## Type sharing with `ddbx-data`

The frontend keeps a copy of the canonical `Dealing` types at
`src/types/ddbx.ts`. The canonical version lives in `ddbx-data/worker/db/types.ts`.

```bash
npm run sync:types     # copy ddbx-data/worker/db/types.ts -> src/types/ddbx.ts
npm run check:types    # CI-friendly drift check (exits non-zero if out of sync)
```

Both scripts assume `ddbx-data` is cloned alongside `dd-site`. Override with
`DDBX_DATA_PATH=/path/to/ddbx-data`.

**Workflow**: when you change types in `ddbx-data`, run `npm run sync:types`
here in the same change cycle. CI runs `check:types` to catch drift.

## Discretion mode (web gating)

The public website intentionally shows only a sliver of the data so the iOS
app remains the canonical surface. Toggle with `VITE_DISCRETION_MODE` —
default is `on`; set to `off` to expose the full unblurred UX.

- **List cap**: each day shows at most 3 trade rows. Hidden trades render as `BlurredDealingRow` placeholders — the layout is identical to a real `DealingRow` but the data comes from a static `POOL` of fake FTSE-style trades, wrapped in `filter: blur(4px)` with a "See in app" pill linking to the App Store. The desktop right-drawer (narrow column) keeps the simpler `DayMoreInApp` link. Applies to today's section, per-day groupings in chronological view, and globally in by-gain view.
- **Drawer cap**: the **first** deal opened today shows full analysis; subsequent drawers render dummy text (`src/components/discretion/dummy-analysis.ts`) under a CSS blur with a CTA overlay. Position card and price chart stay unblurred.
- **Storage**: `localStorage` key `ddbx.discretion.viewState` shaped `{ date: "YYYY-MM-DD", viewedDealIds: string[] }`. Resets at UK midnight (Europe/London).
- **Module**: all logic lives in `src/lib/discretion.ts` (`useDiscretion` hook, `recordView`, `hasFullAccess`, `LIST_CAP`).
