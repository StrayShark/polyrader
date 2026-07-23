import m001 from '../../infra/src/database/migrations/001_initial_schema.sql' with { type: 'text' };
import m002 from '../../infra/src/database/migrations/002_add_clob_token_ids.sql' with { type: 'text' };
import m003 from '../../infra/src/database/migrations/003_add_bet_allocation.sql' with { type: 'text' };
import m004 from '../../infra/src/database/migrations/004_add_risk_metrics.sql' with { type: 'text' };
import m005 from '../../infra/src/database/migrations/005_add_prompt_ab_testing.sql' with { type: 'text' };
import m006 from '../../infra/src/database/migrations/006_add_decision_journal.sql' with { type: 'text' };
import m007 from '../../infra/src/database/migrations/007_add_alerts.sql' with { type: 'text' };
import m008 from '../../infra/src/database/migrations/008_add_simulation_config.sql' with { type: 'text' };
import m009 from '../../infra/src/database/migrations/009_esports_data_normalization.sql' with { type: 'text' };
import m010 from '../../infra/src/database/migrations/010_tier_and_analysis_config.sql' with { type: 'text' };
import m011 from '../../infra/src/database/migrations/011_history_months_config.sql' with { type: 'text' };
import m012 from '../../infra/src/database/migrations/012_min_volume_usd_config.sql' with { type: 'text' };
import m013 from '../../infra/src/database/migrations/013_signal_snapshots.sql' with { type: 'text' };
import m014 from '../../infra/src/database/migrations/014_signal_tuning_config.sql' with { type: 'text' };
import m015 from '../../infra/src/database/migrations/015_market_resolution_fields.sql' with { type: 'text' };
import m016 from '../../infra/src/database/migrations/016_hltv_match_id.sql' with { type: 'text' };
import m017 from '../../infra/src/database/migrations/017_wallet_performance_fields.sql' with { type: 'text' };
import m018 from '../../infra/src/database/migrations/018_wallet_follow_copy.sql' with { type: 'text' };
import m019 from '../../infra/src/database/migrations/019_copy_cs2_volume_filters.sql' with { type: 'text' };
import m020 from '../../infra/src/database/migrations/020_copy_trade_settlement.sql' with { type: 'text' };
import m021 from '../../infra/src/database/migrations/021_sim_accounts.sql' with { type: 'text' };
import m022 from '../../infra/src/database/migrations/022_sim_bets.sql' with { type: 'text' };
import m023 from '../../infra/src/database/migrations/023_odds_snapshots.sql' with { type: 'text' };
import m024 from '../../infra/src/database/migrations/024_bet_reviews.sql' with { type: 'text' };
import m025 from '../../infra/src/database/migrations/025_sim_bets_match_meta.sql' with { type: 'text' };
import m026 from '../../infra/src/database/migrations/026_training_sessions.sql' with { type: 'text' };
import m027 from '../../infra/src/database/migrations/027_strategy_profiles.sql' with { type: 'text' };
import m028 from '../../infra/src/database/migrations/028_source_alignment.sql' with { type: 'text' };
import m029 from '../../infra/src/database/migrations/029_canonical_match_identity.sql' with { type: 'text' };
import m030 from '../../infra/src/database/migrations/030_copy_leader_roi_filter.sql' with { type: 'text' };
import m031 from '../../infra/src/database/migrations/031_review_sprint_b.sql' with { type: 'text' };
import m032 from '../../infra/src/database/migrations/032_multigame_esports_sources.sql' with { type: 'text' };
import m033 from '../../infra/src/database/migrations/033_analysis_runs.sql' with { type: 'text' };
import m034 from '../../infra/src/database/migrations/034_normalized_facts.sql' with { type: 'text' };
import m035 from '../../infra/src/database/migrations/035_paper_policy_profiles.sql' with { type: 'text' };
import m036 from '../../infra/src/database/migrations/036_fact_adapter_version.sql' with { type: 'text' };
import m037 from '../../infra/src/database/migrations/037_paper_policy_freshness.sql' with { type: 'text' };
import m038 from '../../infra/src/database/migrations/038_paper_risk_and_clv.sql' with { type: 'text' };
import m039 from '../../infra/src/database/migrations/039_performance_observability.sql' with { type: 'text' };
import m040 from '../../infra/src/database/migrations/040_release_audit_history.sql' with { type: 'text' };
import m041 from '../../infra/src/database/migrations/041_esports_match_source_identities.sql' with { type: 'text' };
import m042 from '../../infra/src/database/migrations/042_esports_team_aliases.sql' with { type: 'text' };

export const standaloneMigrationSources: Record<string, string> = {
  '001_initial_schema.sql': m001,
  '002_add_clob_token_ids.sql': m002,
  '003_add_bet_allocation.sql': m003,
  '004_add_risk_metrics.sql': m004,
  '005_add_prompt_ab_testing.sql': m005,
  '006_add_decision_journal.sql': m006,
  '007_add_alerts.sql': m007,
  '008_add_simulation_config.sql': m008,
  '009_esports_data_normalization.sql': m009,
  '010_tier_and_analysis_config.sql': m010,
  '011_history_months_config.sql': m011,
  '012_min_volume_usd_config.sql': m012,
  '013_signal_snapshots.sql': m013,
  '014_signal_tuning_config.sql': m014,
  '015_market_resolution_fields.sql': m015,
  '016_hltv_match_id.sql': m016,
  '017_wallet_performance_fields.sql': m017,
  '018_wallet_follow_copy.sql': m018,
  '019_copy_cs2_volume_filters.sql': m019,
  '020_copy_trade_settlement.sql': m020,
  '021_sim_accounts.sql': m021,
  '022_sim_bets.sql': m022,
  '023_odds_snapshots.sql': m023,
  '024_bet_reviews.sql': m024,
  '025_sim_bets_match_meta.sql': m025,
  '026_training_sessions.sql': m026,
  '027_strategy_profiles.sql': m027,
  '028_source_alignment.sql': m028,
  '029_canonical_match_identity.sql': m029,
  '030_copy_leader_roi_filter.sql': m030,
  '031_review_sprint_b.sql': m031,
  '032_multigame_esports_sources.sql': m032,
  '033_analysis_runs.sql': m033,
  '034_normalized_facts.sql': m034,
  '035_paper_policy_profiles.sql': m035,
  '036_fact_adapter_version.sql': m036,
  '037_paper_policy_freshness.sql': m037,
  '038_paper_risk_and_clv.sql': m038,
  '039_performance_observability.sql': m039,
  '040_release_audit_history.sql': m040,
  '041_esports_match_source_identities.sql': m041,
  '042_esports_team_aliases.sql': m042,
};
