CREATE TABLE IF NOT EXISTS esports_source_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game TEXT NOT NULL CHECK (game IN ('cs2', 'lol', 'dota2', 'valorant')),
  source TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  starts_at TEXT,
  status TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '{}',
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(game, source, entity_type, external_id)
);

CREATE INDEX IF NOT EXISTS idx_esports_source_snapshots_game
  ON esports_source_snapshots(game, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_esports_source_snapshots_entity
  ON esports_source_snapshots(game, entity_type, starts_at DESC);

CREATE TABLE IF NOT EXISTS esports_source_sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game TEXT NOT NULL CHECK (game IN ('cs2', 'lol', 'dota2', 'valorant')),
  status TEXT NOT NULL,
  records INTEGER NOT NULL DEFAULT 0,
  sources TEXT NOT NULL DEFAULT '[]',
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_esports_source_sync_runs_game
  ON esports_source_sync_runs(game, finished_at DESC);
