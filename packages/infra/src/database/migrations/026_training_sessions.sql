-- Training sessions: practice goals and progress tracking
CREATE TABLE IF NOT EXISTS training_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL DEFAULT 'default',
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  target TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  progress REAL NOT NULL DEFAULT 0,
  start_at TEXT NOT NULL,
  end_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_training_sessions_account ON training_sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_training_sessions_status ON training_sessions(status);
