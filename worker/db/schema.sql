-- D1 schema for director-dealings.
-- Apply with: wrangler d1 execute director-dealings --file=worker/db/schema.sql

CREATE TABLE IF NOT EXISTS directors (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  role            TEXT,
  company_primary TEXT,
  age_band        TEXT,               -- e.g. "30s", "40s", "50s+"
  tenure_years    REAL,
  profile_json    TEXT,               -- Opus-generated profile (biography, track record summary, flags)
  profile_updated_at TEXT
);

CREATE TABLE IF NOT EXISTS dealings (
  id              TEXT PRIMARY KEY,
  hash            TEXT NOT NULL UNIQUE, -- dedupe key derived from date+director+ticker+shares
  trade_date      TEXT NOT NULL,
  disclosed_date  TEXT NOT NULL,
  director_id     TEXT NOT NULL REFERENCES directors(id),
  ticker          TEXT NOT NULL,       -- LSE ticker with .L suffix
  company         TEXT NOT NULL,
  tx_type         TEXT NOT NULL,       -- "buy" | "sell"
  shares          INTEGER NOT NULL,
  price_pence     REAL NOT NULL,
  value_gbp       REAL NOT NULL,
  raw_json        TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dealings_trade_date ON dealings(trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_dealings_director ON dealings(director_id);

-- Cheap Haiku pass: skip / maybe / promising
CREATE TABLE IF NOT EXISTS triage (
  dealing_id  TEXT PRIMARY KEY REFERENCES dealings(id),
  verdict     TEXT NOT NULL,           -- "skip" | "maybe" | "promising"
  reason      TEXT,
  model       TEXT,
  tokens_in   INTEGER,
  tokens_out  INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Opus deep reasoning for promising dealings
CREATE TABLE IF NOT EXISTS analyses (
  dealing_id           TEXT PRIMARY KEY REFERENCES dealings(id),
  rating               TEXT NOT NULL,  -- "significant" | "noteworthy" | "minor" | "routine"
  confidence           REAL,
  summary              TEXT,           -- tweet-ready one-liner
  thesis               TEXT,
  evidence_for_json    TEXT,           -- [{headline, detail, source_label, source_url?}]
  evidence_against_json TEXT,          -- [{headline, detail, source_label, source_url?}]
  risks_json           TEXT,           -- [string]
  catalyst_window      TEXT,           -- "3m" | "6m" | "12m"
  model                TEXT,
  tokens_in            INTEGER,
  tokens_out           INTEGER,
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prices (
  ticker      TEXT NOT NULL,
  date        TEXT NOT NULL,
  close_pence REAL NOT NULL,
  PRIMARY KEY (ticker, date)
);

CREATE TABLE IF NOT EXISTS performance (
  dealing_id   TEXT NOT NULL REFERENCES dealings(id),
  horizon_days INTEGER NOT NULL,       -- 90 / 180 / 365 / 730
  return_pct   REAL,
  as_of_date   TEXT,
  PRIMARY KEY (dealing_id, horizon_days)
);

-- Cache of Haiku extraction results keyed on the announcement URL. Lets us
-- skip fetching + extracting the same PDMR notice across multiple pipeline
-- runs, including the ~2/3 of notices that extract to non-buys and therefore
-- never reach the dealings table.
CREATE TABLE IF NOT EXISTS extractions (
  url             TEXT PRIMARY KEY,
  is_open_market_buy INTEGER NOT NULL,   -- 0/1
  extracted_json  TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Canonical ticker registry. Populated/updated during pipeline ingest.
CREATE TABLE IF NOT EXISTS tickers (
  ticker        TEXT PRIMARY KEY,
  company_name  TEXT,
  exchange      TEXT NOT NULL DEFAULT 'LSE',
  first_seen_at TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tickers_company ON tickers(company_name);

-- Backfill tickers from any existing dealings (idempotent — safe to re-run).
INSERT INTO tickers (ticker, company_name, exchange, first_seen_at, last_seen_at)
SELECT
  d.ticker,
  (SELECT company FROM dealings WHERE ticker = d.ticker ORDER BY disclosed_date DESC LIMIT 1),
  'LSE',
  MIN(d.disclosed_date),
  MAX(d.disclosed_date)
FROM dealings d
GROUP BY d.ticker
ON CONFLICT(ticker) DO UPDATE SET
  company_name  = excluded.company_name,
  first_seen_at = min(tickers.first_seen_at, excluded.first_seen_at),
  last_seen_at  = max(tickers.last_seen_at,  excluded.last_seen_at);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id           TEXT PRIMARY KEY,
  stage        TEXT NOT NULL,
  started_at   TEXT NOT NULL,
  finished_at  TEXT,
  status       TEXT,                   -- "ok" | "error"
  error        TEXT,
  metrics_json TEXT
);

-- Aggregated UK business headlines (RSS). Refreshed on the 15-minute cron.
CREATE TABLE IF NOT EXISTS news_items (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  url           TEXT NOT NULL UNIQUE,
  source        TEXT NOT NULL,
  published_at  TEXT,
  fetched_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_news_items_fetched ON news_items(fetched_at DESC);

-- Migration 001 (2026-04-07): add summary column for tweet-ready one-liner
-- Run once against existing databases:
--   wrangler d1 execute director-dealings --command "ALTER TABLE analyses ADD COLUMN summary TEXT;"
ALTER TABLE analyses ADD COLUMN summary TEXT;

-- Migration 002 (2026-04-08): thesis as array of short points + richer companies
-- Run once against existing databases:
--   wrangler d1 execute director-dealings --command "ALTER TABLE analyses ADD COLUMN thesis_points_json TEXT;"
--   wrangler d1 execute director-dealings --command "ALTER TABLE tickers ADD COLUMN sector TEXT;"
--   wrangler d1 execute director-dealings --command "ALTER TABLE tickers ADD COLUMN description TEXT;"
--   wrangler d1 execute director-dealings --command "ALTER TABLE tickers ADD COLUMN website TEXT;"
--   wrangler d1 execute director-dealings --command "ALTER TABLE tickers ADD COLUMN profile_json TEXT;"
--   wrangler d1 execute director-dealings --command "ALTER TABLE tickers ADD COLUMN profile_updated_at TEXT;"
ALTER TABLE analyses ADD COLUMN thesis_points_json TEXT;
ALTER TABLE tickers ADD COLUMN sector TEXT;
ALTER TABLE tickers ADD COLUMN description TEXT;
ALTER TABLE tickers ADD COLUMN website TEXT;
ALTER TABLE tickers ADD COLUMN profile_json TEXT;
ALTER TABLE tickers ADD COLUMN profile_updated_at TEXT;

-- Migration 003 (2026-04-08): tighter rating labels + checklist + rationale
-- Rating column values change from very_interesting/interesting/somewhat/not_interesting
-- to significant/noteworthy/minor/routine. Migrate existing rows:
--   wrangler d1 execute director-dealings --command "ALTER TABLE analyses ADD COLUMN checklist_json TEXT;"
--   wrangler d1 execute director-dealings --command "ALTER TABLE analyses ADD COLUMN rating_rationale TEXT;"
--   wrangler d1 execute director-dealings --command "UPDATE analyses SET rating = CASE rating WHEN 'very_interesting' THEN 'significant' WHEN 'interesting' THEN 'noteworthy' WHEN 'somewhat' THEN 'minor' WHEN 'not_interesting' THEN 'routine' ELSE rating END;"
ALTER TABLE analyses ADD COLUMN checklist_json TEXT;
ALTER TABLE analyses ADD COLUMN rating_rationale TEXT;

-- Migration 004 (2026-04-14): device token registration for APNs push notifications
-- Run once against existing databases:
--   wrangler d1 execute director-dealings --command "CREATE TABLE IF NOT EXISTS device_tokens (token TEXT PRIMARY KEY, environment TEXT NOT NULL DEFAULT 'sandbox', timezone TEXT DEFAULT 'Europe/London', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));"
CREATE TABLE IF NOT EXISTS device_tokens (
  token       TEXT PRIMARY KEY,              -- APNs device token (hex string)
  environment TEXT NOT NULL DEFAULT 'sandbox', -- "sandbox" | "production"
  timezone    TEXT DEFAULT 'Europe/London',
  active      INTEGER NOT NULL DEFAULT 1,    -- 0 = unregistered / invalid
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
