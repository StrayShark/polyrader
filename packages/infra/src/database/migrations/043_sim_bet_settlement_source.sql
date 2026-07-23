ALTER TABLE sim_bets ADD COLUMN settlement_source TEXT;

CREATE INDEX IF NOT EXISTS idx_sim_bets_settlement_source
  ON sim_bets(status, settlement_source);
