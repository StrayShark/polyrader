ALTER TABLE sim_bets ADD COLUMN closing_boundary_at TEXT;
ALTER TABLE sim_bets ADD COLUMN closing_latency_seconds REAL;
ALTER TABLE sim_bets ADD COLUMN closing_attempt_count INTEGER NOT NULL DEFAULT 0
  CHECK (closing_attempt_count >= 0);
ALTER TABLE sim_bets ADD COLUMN closing_last_attempt_at TEXT;
ALTER TABLE sim_bets ADD COLUMN clv_unavailable_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_sim_bets_closing_observability
  ON sim_bets(account_id, game, provider, market_kind, clv_status, closing_source);
