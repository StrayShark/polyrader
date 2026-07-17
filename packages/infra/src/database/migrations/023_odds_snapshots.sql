CREATE TABLE IF NOT EXISTS odds_snapshots (
  id TEXT PRIMARY KEY,
  match_id TEXT,
  market_id TEXT,
  selection TEXT NOT NULL,
  odds REAL NOT NULL,
  implied_probability REAL,
  liquidity REAL,
  volume_24h REAL,
  source TEXT NOT NULL,
  captured_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_odds_snapshots_match_id ON odds_snapshots(match_id);
CREATE INDEX IF NOT EXISTS idx_odds_snapshots_market_id ON odds_snapshots(market_id);
CREATE INDEX IF NOT EXISTS idx_odds_snapshots_bet_context ON odds_snapshots(match_id, market_id, selection);
