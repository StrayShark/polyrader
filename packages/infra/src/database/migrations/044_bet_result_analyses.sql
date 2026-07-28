CREATE TABLE IF NOT EXISTS bet_result_analyses (
  id TEXT PRIMARY KEY,
  bet_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('prompt_ready', 'provider_running', 'valid', 'invalid', 'failed')),
  contract_version TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  response_schema_version TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  prompt_hash TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  input_json TEXT NOT NULL,
  output_schema_json TEXT NOT NULL,
  raw_response TEXT,
  normalized_response_json TEXT,
  validation_errors_json TEXT NOT NULL DEFAULT '[]',
  latency_ms INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (bet_id) REFERENCES sim_bets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bet_result_analyses_bet_created
  ON bet_result_analyses(bet_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bet_result_analyses_status
  ON bet_result_analyses(status);
