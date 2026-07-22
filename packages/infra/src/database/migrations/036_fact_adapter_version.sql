ALTER TABLE esports_fact_matches
ADD COLUMN adapter_version TEXT NOT NULL DEFAULT 'facts.v1';

UPDATE esports_fact_matches
SET adapter_version = game || '.facts.v1'
WHERE adapter_version = 'facts.v1';
