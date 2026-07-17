-- 028: Cross-source esports identity alignment
--
-- Liquipedia is the canonical identity/roster source, while HLTV remains the
-- performance/status source. These tables keep provider IDs, page titles, and
-- roster snapshots separate from local team IDs so later crawls can reconcile
-- conflicting names instead of overwriting facts.

CREATE TABLE IF NOT EXISTS team_source_links (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id        TEXT NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
  source         TEXT NOT NULL, -- 'polymarket' | 'hltv' | 'liquipedia' | 'grid' | 'cs_api'
  source_id      TEXT NOT NULL,
  source_name    TEXT DEFAULT '',
  source_slug    TEXT DEFAULT '',
  source_url     TEXT DEFAULT '',
  confidence     REAL DEFAULT 1.0,
  is_primary     INTEGER DEFAULT 0,
  metadata       TEXT DEFAULT '{}',
  last_seen_at   TEXT DEFAULT (datetime('now')),
  created_at     TEXT DEFAULT (datetime('now')),
  updated_at     TEXT DEFAULT (datetime('now')),
  UNIQUE(team_id, source),
  UNIQUE(source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_team_source_links_team ON team_source_links(team_id);
CREATE INDEX IF NOT EXISTS idx_team_source_links_source ON team_source_links(source, source_id);

CREATE TABLE IF NOT EXISTS match_source_links (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id       TEXT NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
  source         TEXT NOT NULL,
  source_id      TEXT NOT NULL,
  source_name    TEXT DEFAULT '',
  source_url     TEXT DEFAULT '',
  confidence     REAL DEFAULT 1.0,
  metadata       TEXT DEFAULT '{}',
  last_seen_at   TEXT DEFAULT (datetime('now')),
  created_at     TEXT DEFAULT (datetime('now')),
  updated_at     TEXT DEFAULT (datetime('now')),
  UNIQUE(match_id, source),
  UNIQUE(source, source_id)
);

CREATE INDEX IF NOT EXISTS idx_match_source_links_match ON match_source_links(match_id);
CREATE INDEX IF NOT EXISTS idx_match_source_links_source ON match_source_links(source, source_id);

CREATE TABLE IF NOT EXISTS roster_source_snapshots (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id        TEXT NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
  source         TEXT NOT NULL,
  source_id      TEXT NOT NULL DEFAULT '',
  roster_hash    TEXT NOT NULL,
  player_ids     TEXT NOT NULL DEFAULT '[]',
  players        TEXT NOT NULL DEFAULT '[]',
  valid_from     TEXT,
  valid_to       TEXT,
  is_current     INTEGER DEFAULT 1,
  metadata       TEXT DEFAULT '{}',
  created_at     TEXT DEFAULT (datetime('now')),
  updated_at     TEXT DEFAULT (datetime('now')),
  UNIQUE(team_id, source, source_id, roster_hash)
);

CREATE INDEX IF NOT EXISTS idx_roster_source_snapshots_team ON roster_source_snapshots(team_id, source);
CREATE INDEX IF NOT EXISTS idx_roster_source_snapshots_current ON roster_source_snapshots(source, is_current);
