import type { EsportsGame } from '../analysis/types';
import {
  buildCs2FixtureFacts,
  buildCs2FixtureSnapshots,
  normalizeCs2MatchFacts,
} from './cs2-adapter';
import {
  buildDota2FixtureFacts,
  buildDota2FixtureSnapshots,
  normalizeDota2MatchFacts,
} from './dota2-adapter';
import {
  buildLolFixtureFacts,
  buildLolFixtureSnapshots,
  normalizeLolMatchFacts,
} from './lol-adapter';
import {
  buildValorantFixtureFacts,
  buildValorantFixtureSnapshots,
  normalizeValorantMatchFacts,
} from './valorant-adapter';
import type { BoardValidationSummary, NormalizedMatchFacts, SourceSnapshotLike } from './types';
import type { MarketAlignmentResult } from '../markets/identity';
import { evaluateDotaAnalysisEligibility } from './dota2-analysis-eligibility';
import { evaluateLolAnalysisEligibility } from './lol-analysis-eligibility';
import { evaluateValorantAnalysisEligibility } from './valorant-analysis-eligibility';

export * from './types';
export * from './cs2-adapter';
export * from './dota2-adapter';
export * from './dota2-identity';
export * from './dota2-analysis-eligibility';
export * from './lol-adapter';
export * from './lol-identity';
export * from './lol-analysis-eligibility';
export * from './valorant-adapter';
export * from './valorant-identity';
export * from './valorant-analysis-eligibility';
export * from './riot-team-identity';

export function normalizeMatchFacts(
  game: EsportsGame,
  snapshots: SourceSnapshotLike[],
  options?: { now?: Date; matchExternalId?: string },
): NormalizedMatchFacts | null {
  if (game === 'cs2') return normalizeCs2MatchFacts(snapshots, options);
  if (game === 'dota2') return normalizeDota2MatchFacts(snapshots, options);
  if (game === 'lol') return normalizeLolMatchFacts(snapshots, options);
  if (game === 'valorant') return normalizeValorantMatchFacts(snapshots, options);
  return null;
}

export function buildFixtureFacts(
  game: EsportsGame,
  now = new Date(),
): NormalizedMatchFacts | null {
  if (game === 'cs2') return buildCs2FixtureFacts(now);
  if (game === 'dota2') return buildDota2FixtureFacts(now);
  if (game === 'lol') return buildLolFixtureFacts(now);
  if (game === 'valorant') return buildValorantFixtureFacts(now);
  return null;
}

export function buildFixtureSnapshots(
  game: EsportsGame,
  now = new Date(),
): SourceSnapshotLike[] {
  if (game === 'cs2') return buildCs2FixtureSnapshots(now);
  if (game === 'dota2') return buildDota2FixtureSnapshots(now);
  if (game === 'lol') return buildLolFixtureSnapshots(now);
  if (game === 'valorant') return buildValorantFixtureSnapshots(now);
  return [];
}

export function buildBoardValidationSummary(input: {
  game: EsportsGame;
  snapshots: SourceSnapshotLike[];
  sampleMatch?: NormalizedMatchFacts | null;
  sourcesConfigured: number;
  marketAlignment?: MarketAlignmentResult | null;
  maximumFreshnessSeconds?: number;
  now?: Date;
  allowFixtureFallback?: boolean;
}): BoardValidationSummary {
  const now = input.now ?? new Date();
  let sample = input.sampleMatch ?? normalizeMatchFacts(input.game, input.snapshots, { now });

  if (!sample && input.allowFixtureFallback === true) {
    sample = buildFixtureFacts(input.game, now);
  }

  if (!sample) {
    return {
      game: input.game,
      boardState: input.sourcesConfigured > 0 ? 'needs_data' : 'unconfigured',
      completeness: 0,
      freshnessSeconds: Number.POSITIVE_INFINITY,
      missing: ['match'],
      conflictFlags: [],
      sourceCount: input.sourcesConfigured,
      matchCount: input.snapshots.filter((item) => item.entityType === 'match').length,
      stages: [
        {
          stage: 'source_sync',
          status: input.sourcesConfigured > 0 ? 'warning' : 'failed',
          detail:
            input.sourcesConfigured > 0
              ? 'sources configured but no match facts'
              : 'no sources configured',
        },
        { stage: 'fact_normalize', status: 'failed', detail: 'no normalized match' },
        { stage: 'market_align', status: 'waiting', detail: 'blocked on facts' },
        { stage: 'prompt', status: 'waiting', detail: 'blocked on facts' },
        { stage: 'validate', status: 'waiting', detail: 'blocked on facts' },
        { stage: 'paper_decision', status: 'waiting', detail: 'blocked on facts' },
        { stage: 'settlement', status: 'waiting', detail: 'waiting for match end' },
      ],
    };
  }

  const alignment = input.marketAlignment;
  const maximumFreshnessSeconds = input.maximumFreshnessSeconds ?? 60 * 60;
  const factsAreFresh =
    Number.isFinite(sample.freshnessSeconds) && sample.freshnessSeconds <= maximumFreshnessSeconds;
  const marketStage = !alignment
    ? {
        stage: 'market_align',
        status: 'waiting' as const,
        detail: 'market alignment not evaluated',
      }
    : {
        stage: 'market_align',
        status: alignment.aligned && alignment.evidenceType !== 'synthetic'
          ? ('passed' as const)
          : alignment.status === 'supported' || alignment.evidenceType === 'synthetic'
            ? ('warning' as const)
            : ('failed' as const),
        detail: alignment.detail,
      };

  const boardState: BoardValidationSummary['boardState'] =
    sample.completeness >= 0.7 &&
    factsAreFresh &&
    sample.conflictFlags.length === 0 &&
    Boolean(alignment && (alignment.aligned || alignment.status === 'supported'))
      ? 'paper_ready'
      : sample.completeness >= 0.4
        ? 'needs_data'
        : 'blocked';
  const analysisEligibility =
    input.game === 'dota2'
      ? evaluateDotaAnalysisEligibility({
          facts: sample,
          marketAlignment: alignment,
          policy: {
            minimumCompleteness: 0.7,
            maximumFreshnessSeconds,
            lowLiquidityThresholdUsd: 1_000,
          },
          now,
        })
      : input.game === 'lol'
        ? evaluateLolAnalysisEligibility({
            facts: sample,
            marketAlignment: alignment,
            policy: {
              minimumCompleteness: 0.7,
              maximumFreshnessSeconds,
              lowLiquidityThresholdUsd: 1_000,
            },
            now,
          })
        : input.game === 'valorant'
          ? evaluateValorantAnalysisEligibility({
              facts: sample,
              marketAlignment: alignment,
              policy: {
                minimumCompleteness: 0.7,
                maximumFreshnessSeconds,
                lowLiquidityThresholdUsd: 1_000,
              },
              now,
            })
          : undefined;

  return {
    game: input.game,
    boardState,
    completeness: sample.completeness,
    freshnessSeconds: sample.freshnessSeconds,
    missing: sample.missing,
    conflictFlags: sample.conflictFlags,
    sourceCount: new Set(sample.sourceLinks.map((item) => item.source)).size,
    matchCount: input.snapshots.filter((item) => item.entityType === 'match').length,
    sampleMatch: sample,
    marketAlignment: alignment ?? undefined,
    analysisEligibility,
    stages: [
      {
        stage: 'source_sync',
        status: sample.sourceLinks.length === 0 ? 'failed' : factsAreFresh ? 'passed' : 'warning',
        detail: factsAreFresh
          ? `${sample.sourceLinks.length} source links`
          : `${sample.sourceLinks.length} source links · stale ${formatFreshness(sample.freshnessSeconds)} > ${formatFreshness(maximumFreshnessSeconds)}`,
      },
      {
        stage: 'fact_normalize',
        status: sample.completeness >= 0.7 ? 'passed' : 'warning',
        detail: `completeness ${(sample.completeness * 100).toFixed(0)}% · hash ${sample.dataSnapshotHash.slice(0, 18)}`,
      },
      marketStage,
      {
        stage: 'prompt',
        status:
          analysisEligibility && !analysisEligibility.analysisEligible
            ? 'waiting'
            : sample.completeness >= 0.7 && factsAreFresh
              ? 'passed'
              : 'waiting',
        detail: analysisEligibility
          ? analysisEligibility.analysisEligible
            ? `${analysisEligibility.mode} · ${sample.adapterVersion} snapshot ready`
            : eligibilityBlockedDetail(analysisEligibility.reasonCodes)
          : factsAreFresh
            ? `${sample.adapterVersion} snapshot ready`
            : `${sample.adapterVersion} snapshot is stale`,
      },
      {
        stage: 'validate',
        status: 'waiting',
        detail: 'awaiting provider response',
      },
      {
        stage: 'paper_decision',
        status:
          boardState === 'paper_ready' &&
          (!analysisEligibility || analysisEligibility.analysisEligible)
            ? 'passed'
            : 'waiting',
        detail:
          analysisEligibility
            ? analysisEligibility.analysisEligible
              ? analysisEligibility.paperOrderEligible
                ? `${analysisEligibility.mode} clears deterministic paper gate`
                : `${analysisEligibility.mode} · no paper order`
              : eligibilityBlockedDetail(analysisEligibility.reasonCodes)
            : boardState === 'paper_ready'
              ? 'facts and market alignment clear paper gate'
            : factsAreFresh
              ? 'blocked by facts or market alignment'
              : 'blocked by stale facts',
      },
      {
        stage: 'settlement',
        status: 'waiting',
        detail:
          input.game === 'lol' || input.game === 'valorant'
            ? hasAuthoritativeGridSeriesLink(sample)
              ? 'waiting for authoritative GRID result'
              : 'liquipedia-only · no authoritative GRID series link'
            : 'waiting for authoritative result',
      },
    ],
  };
}

function hasAuthoritativeGridSeriesLink(sample: NormalizedMatchFacts): boolean {
  return sample.sourceLinks.some(
    (link) =>
      link.source === 'grid' &&
      link.entityType === 'match' &&
      link.externalId === sample.externalMatchId,
  );
}

function eligibilityBlockedDetail(reasonCodes: string[]): string {
  const labels = [
    reasonCodes.includes('INPUT_STALE') ? 'stale' : '',
    reasonCodes.includes('INPUT_INCOMPLETE') ? 'incomplete' : '',
  ].filter(Boolean);
  return `blocked${labels.length > 0 ? ` · ${labels.join(' / ')}` : ''} · ${reasonCodes.join(',')}`;
}

function formatFreshness(seconds: number): string {
  if (!Number.isFinite(seconds)) return 'unknown';
  if (seconds >= 60 * 60) return `${(seconds / (60 * 60)).toFixed(1)}h`;
  if (seconds >= 60) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds)}s`;
}
