import type { AnalysisFact, EsportsGame } from '../analysis/types';
import type { EsportsSourceSyncResult } from '../types/index';
import type { MarketAlignmentResult } from '../markets/identity';
import type { DotaAnalysisEligibility } from './dota2-analysis-eligibility';
import type { LolAnalysisEligibility } from './lol-analysis-eligibility';
import type { ValorantAnalysisEligibility } from './valorant-analysis-eligibility';
import { sha256Hex, stableStringify } from '../analysis/hash';

export type { AnalysisFact, EsportsGame };

export type FactConflictFlag =
  | 'roster_mismatch'
  | 'schedule_mismatch'
  | 'identity_collision'
  | 'stale_source';

export interface NormalizedParticipant {
  participantId: string;
  side: 'a' | 'b';
  name: string;
  rating?: number;
  source: string;
}

export interface NormalizedPlayer {
  participantId: string;
  playerId: string;
  displayName: string;
  position?: string;
  isStarter: boolean;
  source: string;
}

export interface NormalizedSourceLink {
  source: string;
  entityType: string;
  externalId: string;
  precedence: number;
  observedAt: string;
}

export interface DotaFieldQuality {
  field:
    | 'identity'
    | 'rating'
    | 'recent_form'
    | 'roster'
    | 'player_metrics'
    | 'hero_pool'
    | 'patch';
  status: 'available' | 'missing' | 'stale' | 'conflict';
  source?: string;
  sources?: string[];
  observedAt?: string;
  ageSeconds?: number;
  reason?: string;
}

export interface DotaDataQuality {
  contractVersion: 'dota-quality.v1';
  freshnessLimitSeconds: number;
  bothTeamsComplete: boolean;
  bothTeamsFresh: boolean;
  sides: Array<{
    side: 'a' | 'b';
    participantId: string;
    name: string;
    complete: boolean;
    fresh: boolean;
    fields: DotaFieldQuality[];
    targetEnrichment?: {
      selected: boolean;
      rosterFetched: number;
      matchesFetched: number;
      detailSampleSize: number;
      errors: string[];
    };
  }>;
  match: {
    patch: DotaFieldQuality;
  };
}

export interface RiotGameFieldQuality {
  field: 'identity' | 'roster' | 'patch' | 'map_pool';
  status: 'available' | 'missing' | 'stale' | 'conflict';
  source?: string;
  sources?: string[];
  observedAt?: string;
  ageSeconds?: number;
  reason?: string;
}

/** Shared quality contract for LoL (`lol-quality.v1`) and Valorant (`valorant-quality.v1`). */
export interface RiotGameDataQuality {
  contractVersion: 'lol-quality.v1' | 'valorant-quality.v1';
  freshnessLimitSeconds: number;
  bothTeamsComplete: boolean;
  bothTeamsFresh: boolean;
  sides: Array<{
    side: 'a' | 'b';
    participantId: string;
    name: string;
    complete: boolean;
    fresh: boolean;
    fields: RiotGameFieldQuality[];
  }>;
  match: {
    patch?: RiotGameFieldQuality;
    mapPool?: RiotGameFieldQuality;
  };
}

export interface NormalizedMatchFacts {
  id: string;
  game: EsportsGame;
  externalMatchId: string;
  eventId?: string;
  eventName: string;
  startsAt: string;
  format: 'BO1' | 'BO3' | 'BO5';
  status: string;
  patchVersion?: string;
  mapPool: string[];
  participants: NormalizedParticipant[];
  players: NormalizedPlayer[];
  sourceLinks: NormalizedSourceLink[];
  facts: AnalysisFact[];
  missing: string[];
  conflictFlags: FactConflictFlag[];
  completeness: number;
  freshnessSeconds: number;
  dataSnapshotHash: string;
  adapterVersion: string;
}

export interface SourceSnapshotLike {
  game: EsportsGame;
  source: string;
  entityType: string;
  externalId: string;
  name: string;
  startsAt?: string | null;
  status?: string;
  payload: Record<string, unknown>;
  observedAt: string;
}

export interface BoardValidationSummary {
  game: EsportsGame;
  boardState: 'paper_ready' | 'needs_data' | 'blocked' | 'unconfigured';
  completeness: number;
  freshnessSeconds: number;
  missing: string[];
  conflictFlags: FactConflictFlag[];
  sourceCount: number;
  matchCount: number;
  sampleMatch?: NormalizedMatchFacts;
  marketAlignment?: MarketAlignmentResult;
  analysisEligibility?:
    | DotaAnalysisEligibility
    | LolAnalysisEligibility
    | ValorantAnalysisEligibility;
  stages: Array<{
    stage: string;
    status: 'passed' | 'warning' | 'failed' | 'waiting' | 'skipped';
    detail: string;
  }>;
}

export type ReleaseGateStageName =
  | 'source'
  | 'facts'
  | 'market'
  | 'prompt'
  | 'response'
  | 'report'
  | 'decision'
  | 'settlement'
  | 'statistics';

export interface ReleaseGateStage {
  stage: ReleaseGateStageName;
  status: 'passed' | 'blocked' | 'missing';
  detail: string;
}

export interface ReleaseGateEvidence {
  status: 'passed' | 'blocked' | 'missing';
  runId?: string;
  checkedAt: string;
  stages: ReleaseGateStage[];
  blockers: string[];
}

export interface BoardReleaseGateSummary {
  game: EsportsGame;
  status: 'verified' | 'fixture_ready' | 'blocked';
  fixture: ReleaseGateEvidence;
  currentSource: ReleaseGateEvidence;
}

export interface ReleaseGateReport {
  generatedAt: string;
  releaseReady: boolean;
  verifiedCount: number;
  fixtureReadyCount: number;
  blockedCount: number;
  boards: BoardReleaseGateSummary[];
}

export type ReleaseAuditStageName =
  | 'source_sync'
  | 'fact_normalize'
  | 'provider_execute'
  | 'gate_evaluate';

export interface ReleaseAuditStageTiming {
  stage: ReleaseAuditStageName;
  status: 'passed' | 'blocked' | 'skipped' | 'failed';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  detail: string;
}

export type ProviderFailureCategory =
  | 'authentication'
  | 'subscription'
  | 'quota'
  | 'rate_limit'
  | 'timeout'
  | 'schema_validation'
  | 'not_configured'
  | 'upstream'
  | 'unknown';

export interface ProviderFailureSummary {
  category: ProviderFailureCategory;
  detail: string;
}

export interface ReleaseAuditHistoryEntry {
  auditId: string;
  game: EsportsGame;
  outcome: 'verified' | 'blocked' | 'failed';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  boardState: BoardValidationSummary['boardState'];
  externalMatchId?: string;
  dataSnapshotHash?: string;
  syncStatus: EsportsSourceSyncResult['status'];
  sourceRecords: number;
  analysisStatus: 'completed' | 'skipped' | 'failed';
  analysisRunId?: string;
  provider?: string;
  providerFailure?: ProviderFailureSummary;
  gateStatus: BoardReleaseGateSummary['status'];
  stageTimings: ReleaseAuditStageTiming[];
  blockers: string[];
}

export interface ReleaseDiagnosticsBundle {
  contractVersion: 'release-diagnostics.v1';
  generatedAt: string;
  releaseReport: ReleaseGateReport;
  audits: ReleaseAuditHistoryEntry[];
  database: {
    migrationCount: number;
    latestMigration: string | null;
    tableCount: number;
  };
  releaseEnvironment: {
    nodeEnv: string;
    updaterSigningConfigured: boolean;
    notarizationConfigured: boolean;
  };
  redaction: {
    omitted: string[];
  };
}

export interface ReleaseLifecycleSummary {
  game: EsportsGame;
  checkedAt: string;
  runId?: string;
  betId?: string;
  decisionAction?: 'paper_bet' | 'pass' | 'rejected';
  closing: 'waiting' | 'captured' | 'unavailable' | 'not_applicable';
  settlement: 'waiting' | 'settled' | 'void' | 'not_applicable';
  statistics: 'waiting' | 'complete' | 'not_applicable';
  nextAction: string;
}

export interface CurrentSourceReleaseAuditResult {
  auditId: string;
  game: EsportsGame;
  startedAt: string;
  finishedAt: string;
  sync: EsportsSourceSyncResult;
  board: BoardValidationSummary;
  analysis: {
    status: 'completed' | 'skipped' | 'failed';
    runId?: string;
    provider?: string;
    failure?: ProviderFailureSummary;
    detail: string;
  };
  stageTimings: ReleaseAuditStageTiming[];
  gate: BoardReleaseGateSummary;
}

export function hashNormalizedFacts(
  input: Omit<NormalizedMatchFacts, 'id' | 'dataSnapshotHash'>,
): string {
  const payload = {
    game: input.game,
    externalMatchId: input.externalMatchId,
    eventName: input.eventName,
    startsAt: input.startsAt,
    format: input.format,
    status: input.status,
    patchVersion: input.patchVersion ?? null,
    mapPool: input.mapPool,
    participants: input.participants,
    players: input.players,
    facts: input.facts,
    missing: input.missing,
    conflictFlags: input.conflictFlags,
    completeness: input.completeness,
  };
  return `sha256:${sha256Hex(stableStringify(payload))}`;
}

export function computeCompleteness(required: string[], missing: string[]): number {
  if (required.length === 0) return 1;
  const miss = new Set(missing);
  const present = required.filter((item) => !miss.has(item)).length;
  return present / required.length;
}

export function freshnessSeconds(observedAts: string[], now = new Date()): number {
  const stamps = observedAts
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));
  if (stamps.length === 0) return Number.POSITIVE_INFINITY;
  const newest = Math.max(...stamps);
  return Math.max(0, Math.floor((now.getTime() - newest) / 1000));
}
