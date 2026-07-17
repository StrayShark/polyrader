-- Strategy profiles: named snapshots of signal weights and thresholds
CREATE TABLE IF NOT EXISTS strategy_profiles (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL DEFAULT 'default',
  name TEXT NOT NULL,
  description TEXT,
  source_weights TEXT NOT NULL,
  behavior_weights TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  capital_params TEXT,
  last_backtest TEXT,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_strategy_profiles_account ON strategy_profiles(account_id);
CREATE INDEX IF NOT EXISTS idx_strategy_profiles_active ON strategy_profiles(account_id, is_active);
