-- Idempotent: safe to re-run on remote D1.
CREATE TABLE IF NOT EXISTS news_items (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  url           TEXT NOT NULL UNIQUE,
  source        TEXT NOT NULL,
  published_at  TEXT,
  fetched_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_news_items_fetched ON news_items(fetched_at DESC);
