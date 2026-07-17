-- Add match metadata columns to sim_bets for review filtering.
ALTER TABLE sim_bets ADD COLUMN match_format TEXT;
ALTER TABLE sim_bets ADD COLUMN match_tier TEXT;

CREATE INDEX IF NOT EXISTS idx_sim_bets_match_format ON sim_bets(match_format);
CREATE INDEX IF NOT EXISTS idx_sim_bets_match_tier ON sim_bets(match_tier);
