CREATE TABLE IF NOT EXISTS paper_policy_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  policy_json TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_paper_policy_profiles_active
  ON paper_policy_profiles(is_active, updated_at DESC);
