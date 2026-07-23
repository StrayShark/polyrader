CREATE TABLE IF NOT EXISTS esports_match_source_identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game TEXT NOT NULL CHECK (game IN ('cs2', 'lol', 'dota2', 'valorant')),
  canonical_match_id TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('series', 'game')),
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  parent_canonical_match_id TEXT,
  event_id TEXT,
  team_a_id TEXT,
  team_b_id TEXT,
  starts_at TEXT,
  confidence REAL NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(game, source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_esports_match_identity_canonical
  ON esports_match_source_identities(game, canonical_match_id);
CREATE INDEX IF NOT EXISTS idx_esports_match_identity_parent
  ON esports_match_source_identities(game, parent_canonical_match_id);
CREATE INDEX IF NOT EXISTS idx_esports_match_identity_starts_at
  ON esports_match_source_identities(game, starts_at DESC);
