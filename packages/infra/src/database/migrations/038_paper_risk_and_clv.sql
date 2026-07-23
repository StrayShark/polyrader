ALTER TABLE sim_bets ADD COLUMN provider TEXT;
ALTER TABLE sim_bets ADD COLUMN closing_odds REAL;
ALTER TABLE sim_bets ADD COLUMN closing_probability REAL;
ALTER TABLE sim_bets ADD COLUMN closing_captured_at TEXT;
ALTER TABLE sim_bets ADD COLUMN closing_source TEXT;
ALTER TABLE sim_bets ADD COLUMN clv REAL;
ALTER TABLE sim_bets ADD COLUMN clv_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (clv_status IN ('pending', 'captured', 'unavailable'));

CREATE INDEX IF NOT EXISTS idx_sim_bets_risk_dimensions
  ON sim_bets(account_id, status, game, provider, market_kind);
CREATE INDEX IF NOT EXISTS idx_sim_bets_clv_status
  ON sim_bets(status, clv_status);

UPDATE paper_policy_profiles
SET policy_version = 'paper.v1.2.0',
    policy_json = json_set(
      policy_json,
      '$.policyVersion',
      'paper.v1.2.0',
      '$.maxDailyStake',
      COALESCE(json_extract(policy_json, '$.maxDailyStake'), 600),
      '$.maxOpenExposure',
      COALESCE(json_extract(policy_json, '$.maxOpenExposure'), 600),
      '$.maxGameExposure',
      COALESCE(json_extract(policy_json, '$.maxGameExposure'), 300),
      '$.maxProviderExposure',
      COALESCE(json_extract(policy_json, '$.maxProviderExposure'), 400),
      '$.maxMarketKindExposure',
      COALESCE(json_extract(policy_json, '$.maxMarketKindExposure'), 500)
    ),
    updated_at = datetime('now');
