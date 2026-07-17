CREATE TABLE IF NOT EXISTS bet_reviews (
  id TEXT PRIMARY KEY,
  bet_id TEXT NOT NULL REFERENCES sim_bets(id) ON DELETE CASCADE,
  error_tags TEXT NOT NULL DEFAULT '[]',
  note TEXT,
  brier_score REAL,
  closing_line_value REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bet_reviews_bet_id ON bet_reviews(bet_id);
