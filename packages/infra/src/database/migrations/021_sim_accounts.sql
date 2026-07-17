CREATE TABLE IF NOT EXISTS sim_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  initial_bankroll REAL NOT NULL DEFAULT 10000,
  current_bankroll REAL NOT NULL DEFAULT 10000,
  available_bankroll REAL NOT NULL DEFAULT 10000,
  open_exposure REAL NOT NULL DEFAULT 0,
  max_single_risk_pct REAL NOT NULL DEFAULT 0.02,
  max_daily_risk_pct REAL NOT NULL DEFAULT 0.06,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Insert a single default practice account if none exists.
INSERT OR IGNORE INTO sim_accounts (id, name, initial_bankroll, current_bankroll, available_bankroll)
VALUES ('default', '练习账户', 10000, 10000, 10000);
