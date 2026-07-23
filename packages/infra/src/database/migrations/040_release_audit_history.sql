CREATE TABLE IF NOT EXISTS release_audit_runs (
  audit_id TEXT PRIMARY KEY,
  game TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('verified', 'blocked', 'failed')),
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  board_state TEXT NOT NULL,
  external_match_id TEXT,
  data_snapshot_hash TEXT,
  sync_status TEXT NOT NULL,
  source_records INTEGER NOT NULL DEFAULT 0,
  analysis_status TEXT NOT NULL,
  analysis_run_id TEXT,
  provider TEXT,
  provider_failure_category TEXT,
  gate_status TEXT NOT NULL,
  stage_timings_json TEXT NOT NULL DEFAULT '[]',
  blockers_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_release_audit_runs_game_started
  ON release_audit_runs(game, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_release_audit_runs_outcome_started
  ON release_audit_runs(outcome, started_at DESC);
