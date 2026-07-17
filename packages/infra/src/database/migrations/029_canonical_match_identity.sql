ALTER TABLE matches ADD COLUMN canonical_match_id TEXT;
ALTER TABLE markets ADD COLUMN canonical_match_id TEXT;

UPDATE matches
SET canonical_match_id = 'hltv:' || hltv_match_id
WHERE hltv_match_id IS NOT NULL AND TRIM(hltv_match_id) != '';

UPDATE markets
SET canonical_match_id = 'hltv:' || REPLACE(condition_id, 'local-hltv-', '')
WHERE condition_id LIKE 'local-hltv-%';

CREATE INDEX IF NOT EXISTS idx_matches_canonical_match_id ON matches(canonical_match_id);
CREATE INDEX IF NOT EXISTS idx_markets_canonical_match_id ON markets(canonical_match_id);
