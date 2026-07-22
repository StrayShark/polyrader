CREATE TABLE IF NOT EXISTS analysis_runs (
  run_id TEXT PRIMARY KEY,
  game TEXT NOT NULL CHECK (game IN ('cs2', 'lol', 'dota2', 'valorant')),
  match_id TEXT NOT NULL,
  market_id TEXT NOT NULL,
  market_kind TEXT NOT NULL DEFAULT 'match_winner',
  contract_version TEXT NOT NULL DEFAULT 'analysis.v1',
  prompt_version TEXT NOT NULL,
  response_schema_version TEXT NOT NULL DEFAULT 'analysis-response.v1',
  game_adapter_version TEXT NOT NULL DEFAULT 'cs2.v1',
  market_adapter_version TEXT NOT NULL DEFAULT 'market.v1',
  data_snapshot_hash TEXT NOT NULL,
  prompt_hash TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  validation_status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT,
  model TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_analysis_runs_game_match
  ON analysis_runs(game, match_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_runs_status
  ON analysis_runs(status, created_at DESC);

CREATE TABLE IF NOT EXISTS analysis_prompt_artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES analysis_runs(run_id) ON DELETE CASCADE,
  system_prompt TEXT NOT NULL,
  user_envelope_json TEXT NOT NULL,
  output_schema_json TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(run_id)
);

CREATE TABLE IF NOT EXISTS analysis_response_artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES analysis_runs(run_id) ON DELETE CASCADE,
  attempt INTEGER NOT NULL DEFAULT 0,
  raw_response TEXT NOT NULL,
  normalized_response_json TEXT,
  validation_errors_json TEXT NOT NULL DEFAULT '[]',
  is_valid INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_analysis_response_artifacts_run
  ON analysis_response_artifacts(run_id, attempt);

CREATE TABLE IF NOT EXISTS analysis_reports (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES analysis_runs(run_id) ON DELETE CASCADE,
  report_version INTEGER NOT NULL DEFAULT 1,
  report_json TEXT NOT NULL,
  decision_action TEXT NOT NULL DEFAULT 'pass',
  decision_reason_codes_json TEXT NOT NULL DEFAULT '[]',
  model_probability REAL,
  market_probability REAL,
  edge_at_entry REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(run_id, report_version)
);

CREATE INDEX IF NOT EXISTS idx_analysis_reports_run
  ON analysis_reports(run_id, report_version DESC);

CREATE TABLE IF NOT EXISTS analysis_run_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES analysis_runs(run_id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_analysis_run_events_run
  ON analysis_run_events(run_id, id);

-- Link simulated bets back to immutable analysis artifacts.
ALTER TABLE sim_bets ADD COLUMN run_id TEXT;
ALTER TABLE sim_bets ADD COLUMN report_id TEXT;
ALTER TABLE sim_bets ADD COLUMN policy_version TEXT;
ALTER TABLE sim_bets ADD COLUMN game TEXT;
ALTER TABLE sim_bets ADD COLUMN market_kind TEXT;
ALTER TABLE sim_bets ADD COLUMN edge_at_entry REAL;

CREATE INDEX IF NOT EXISTS idx_sim_bets_run_id ON sim_bets(run_id);
CREATE INDEX IF NOT EXISTS idx_sim_bets_report_id ON sim_bets(report_id);

CREATE TABLE IF NOT EXISTS paper_decisions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  report_id TEXT,
  game TEXT NOT NULL,
  match_id TEXT NOT NULL,
  market_id TEXT NOT NULL,
  market_kind TEXT NOT NULL DEFAULT 'match_winner',
  provider TEXT,
  policy_version TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('paper_bet', 'pass', 'rejected')),
  outcome_id TEXT,
  reason_codes_json TEXT NOT NULL DEFAULT '[]',
  model_probability REAL,
  market_probability REAL,
  edge_at_entry REAL,
  stake REAL,
  price REAL,
  bet_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(run_id, provider, market_id, outcome_id, policy_version)
);

CREATE INDEX IF NOT EXISTS idx_paper_decisions_run
  ON paper_decisions(run_id, created_at DESC);
