UPDATE paper_policy_profiles
SET policy_version = 'paper.v1.1.0',
    policy_json = json_set(
      policy_json,
      '$.policyVersion',
      'paper.v1.1.0',
      '$.maximumFreshnessSeconds',
      3600
    ),
    updated_at = datetime('now')
WHERE json_extract(policy_json, '$.maximumFreshnessSeconds') IS NULL;
