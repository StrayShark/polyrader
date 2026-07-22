CREATE TABLE IF NOT EXISTS esports_fact_matches (
  id TEXT PRIMARY KEY,
  game TEXT NOT NULL CHECK (game IN ('cs2', 'lol', 'dota2', 'valorant')),
  external_match_id TEXT NOT NULL,
  event_id TEXT,
  event_name TEXT NOT NULL DEFAULT '',
  starts_at TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'BO3',
  status TEXT NOT NULL DEFAULT 'scheduled',
  patch_version TEXT,
  map_pool_json TEXT NOT NULL DEFAULT '[]',
  data_snapshot_hash TEXT NOT NULL,
  completeness REAL NOT NULL DEFAULT 0,
  freshness_seconds INTEGER NOT NULL DEFAULT 0,
  missing_json TEXT NOT NULL DEFAULT '[]',
  conflict_flags_json TEXT NOT NULL DEFAULT '[]',
  source_precedence_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(game, external_match_id)
);

CREATE INDEX IF NOT EXISTS idx_esports_fact_matches_game_starts
  ON esports_fact_matches(game, starts_at);

CREATE TABLE IF NOT EXISTS esports_fact_participants (
  id TEXT PRIMARY KEY,
  match_fact_id TEXT NOT NULL REFERENCES esports_fact_matches(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('a', 'b')),
  name TEXT NOT NULL,
  rating REAL,
  source TEXT NOT NULL DEFAULT '',
  UNIQUE(match_fact_id, participant_id)
);

CREATE TABLE IF NOT EXISTS esports_fact_players (
  id TEXT PRIMARY KEY,
  match_fact_id TEXT NOT NULL REFERENCES esports_fact_matches(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  position TEXT,
  is_starter INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT '',
  UNIQUE(match_fact_id, participant_id, player_id)
);

CREATE TABLE IF NOT EXISTS esports_fact_links (
  id TEXT PRIMARY KEY,
  match_fact_id TEXT NOT NULL REFERENCES esports_fact_matches(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  precedence INTEGER NOT NULL DEFAULT 100,
  observed_at TEXT NOT NULL,
  UNIQUE(match_fact_id, source, entity_type, external_id)
);

CREATE TABLE IF NOT EXISTS esports_fact_atoms (
  id TEXT PRIMARY KEY,
  match_fact_id TEXT NOT NULL REFERENCES esports_fact_matches(id) ON DELETE CASCADE,
  fact_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  source TEXT NOT NULL,
  field TEXT NOT NULL,
  value_json TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  UNIQUE(match_fact_id, fact_id)
);

CREATE INDEX IF NOT EXISTS idx_esports_fact_atoms_match
  ON esports_fact_atoms(match_fact_id);
