-- Sprint B: review snapshot reconciliation, match intel freeze, closing odds storage.

ALTER TABLE odds_snapshots ADD COLUMN bet_id TEXT;
CREATE INDEX IF NOT EXISTS idx_odds_snapshots_bet_id ON odds_snapshots(bet_id);

ALTER TABLE bet_reviews ADD COLUMN closing_odds REAL;

CREATE TABLE IF NOT EXISTS cs2_match_snapshots (
  id TEXT PRIMARY KEY,
  bet_id TEXT NOT NULL REFERENCES sim_bets(id) ON DELETE CASCADE,
  match_id TEXT,
  team_a_name TEXT,
  team_b_name TEXT,
  team_a_rank INTEGER,
  team_b_rank INTEGER,
  format TEXT,
  tier TEXT,
  event_name TEXT,
  status TEXT,
  lineups_json TEXT NOT NULL DEFAULT '{}',
  map_pool_json TEXT NOT NULL DEFAULT '{}',
  rankings_json TEXT NOT NULL DEFAULT '{}',
  captured_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cs2_match_snapshots_bet_id ON cs2_match_snapshots(bet_id);
CREATE INDEX IF NOT EXISTS idx_cs2_match_snapshots_match_id ON cs2_match_snapshots(match_id);
