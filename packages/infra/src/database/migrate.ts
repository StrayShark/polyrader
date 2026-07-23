import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDb, closeDb } from './connection';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function runMigrations(): void {
  const db = getDb();
  const runtime = globalThis as typeof globalThis & {
    __POLYRADER_MIGRATION_SOURCES__?: Record<string, string>;
  };

  // Ensure _migrations table exists (created by first migration, but we need it to check)
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      executed_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const migrations = [
    '001_initial_schema.sql',
    '002_add_clob_token_ids.sql',
    '003_add_bet_allocation.sql',
    '004_add_risk_metrics.sql',
    '005_add_prompt_ab_testing.sql',
    '006_add_decision_journal.sql',
    '007_add_alerts.sql',
    '008_add_simulation_config.sql',
    '009_esports_data_normalization.sql',
    '010_tier_and_analysis_config.sql',
    '011_history_months_config.sql',
    '012_min_volume_usd_config.sql',
    '013_signal_snapshots.sql',
    '014_signal_tuning_config.sql',
    '015_market_resolution_fields.sql',
    '016_hltv_match_id.sql',
    '017_wallet_performance_fields.sql',
    '018_wallet_follow_copy.sql',
    '019_copy_cs2_volume_filters.sql',
    '020_copy_trade_settlement.sql',
    '021_sim_accounts.sql',
    '022_sim_bets.sql',
    '023_odds_snapshots.sql',
    '024_bet_reviews.sql',
    '025_sim_bets_match_meta.sql',
    '026_training_sessions.sql',
    '027_strategy_profiles.sql',
    '028_source_alignment.sql',
    '029_canonical_match_identity.sql',
    '030_copy_leader_roi_filter.sql',
    '031_review_sprint_b.sql',
    '032_multigame_esports_sources.sql',
    '033_analysis_runs.sql',
    '034_normalized_facts.sql',
    '035_paper_policy_profiles.sql',
    '036_fact_adapter_version.sql',
    '037_paper_policy_freshness.sql',
    '038_paper_risk_and_clv.sql',
    '039_performance_observability.sql',
    '040_release_audit_history.sql',
    '041_esports_match_source_identities.sql',
    '042_esports_team_aliases.sql',
    '043_sim_bet_settlement_source.sql',
  ];

  for (const name of migrations) {
    const row = db.prepare('SELECT id FROM _migrations WHERE name = ?').get(name) as
      | { id: number }
      | undefined;

    if (row) {
      console.log(`Migration ${name} already executed, skipping`);
      continue;
    }

    const sql =
      runtime.__POLYRADER_MIGRATION_SOURCES__?.[name] ??
      readFileSync(join(__dirname, 'migrations', name), 'utf-8');

    console.log(`Running migration: ${name}`);
    const runMigration = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(name);
    });
    runMigration();
    console.log(`Migration ${name} completed`);
  }

  console.log('All migrations completed');
}

// Run directly
const runtime = globalThis as typeof globalThis & {
  __POLYRADER_MIGRATION_SOURCES__?: Record<string, string>;
};
if (
  process.argv[1] === fileURLToPath(import.meta.url) &&
  !runtime.__POLYRADER_MIGRATION_SOURCES__
) {
  runMigrations();
  closeDb();
  console.log('Done');
}
