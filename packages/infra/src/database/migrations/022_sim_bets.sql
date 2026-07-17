CREATE TABLE IF NOT EXISTS sim_bets (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES sim_accounts(id),
  match_id TEXT,
  market_id TEXT,
  bet_type TEXT NOT NULL DEFAULT 'single',
  stake REAL NOT NULL,
  total_odds REAL NOT NULL,
  implied_probability REAL,
  user_probability REAL,
  model_probability REAL,
  market_probability REAL,
  edge REAL,
  ev REAL,
  status TEXT NOT NULL DEFAULT 'open',
  result TEXT,
  pnl REAL NOT NULL DEFAULT 0,
  reasoning TEXT,
  placed_at TEXT NOT NULL DEFAULT (datetime('now')),
  settled_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sim_bets_account_id ON sim_bets(account_id);
CREATE INDEX IF NOT EXISTS idx_sim_bets_status ON sim_bets(status);
CREATE INDEX IF NOT EXISTS idx_sim_bets_match_id ON sim_bets(match_id);

CREATE TABLE IF NOT EXISTS sim_bet_legs (
  id TEXT PRIMARY KEY,
  bet_id TEXT NOT NULL REFERENCES sim_bets(id) ON DELETE CASCADE,
  match_id TEXT,
  market_id TEXT,
  selection TEXT NOT NULL,
  odds REAL NOT NULL,
  implied_probability REAL,
  source TEXT,
  result TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sim_bet_legs_bet_id ON sim_bet_legs(bet_id);
