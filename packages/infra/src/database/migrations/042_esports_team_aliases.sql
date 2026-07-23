CREATE TABLE IF NOT EXISTS esports_team_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game TEXT NOT NULL CHECK (game IN ('cs2', 'lol', 'dota2', 'valorant')),
  source TEXT NOT NULL,
  source_team_id TEXT NOT NULL DEFAULT '',
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  canonical_team_id TEXT,
  target_source TEXT NOT NULL,
  target_team_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('candidate', 'confirmed', 'conflict', 'unmatched', 'rejected')),
  method TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  candidate_team_ids TEXT NOT NULL DEFAULT '[]',
  evidence TEXT NOT NULL DEFAULT '{}',
  observed_at TEXT NOT NULL,
  confirmed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(game, source, source_team_id, normalized_alias)
);

CREATE INDEX IF NOT EXISTS idx_esports_team_aliases_review
  ON esports_team_aliases(game, status, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_esports_team_aliases_target
  ON esports_team_aliases(game, target_source, target_team_id);
