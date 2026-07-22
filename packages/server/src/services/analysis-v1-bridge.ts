import type {
  AnalysisFact,
  AnalysisRequestEnvelope,
  EsportsGame,
  LLMAnalysisResult,
  MatchInfo,
  Team,
} from '@polyrader/core';
import { buildRunId, hashDataSnapshot, legacyResultToAnalysisResponse } from '@polyrader/core';
import { AnalysisRunService } from './analysis-run-service';
import { PaperPolicyService } from './paper-policy-service';

export interface PersistLegacyAnalysisV1Input {
  match: MatchInfo;
  teamA: Team;
  teamB: Team;
  marketProbA?: number;
  results: LLMAnalysisResult[];
  liquidityUsd?: number;
}

/**
 * Bridge existing CS2 LLMAnalysisResult outputs into analysis.v1 runs + paper decisions.
 */
export class AnalysisV1Bridge {
  constructor(
    private readonly runs = new AnalysisRunService(),
    private readonly paperPolicy = new PaperPolicyService(),
  ) {}

  persistLegacyResults(input: PersistLegacyAnalysisV1Input): Array<{
    provider: string;
    runId: string;
    status: string;
    decisionAction?: string;
  }> {
    const summaries: Array<{
      provider: string;
      runId: string;
      status: string;
      decisionAction?: string;
    }> = [];
    const activePolicy = this.paperPolicy.getActive();
    for (const result of input.results) {
      if (result.error) continue;
      try {
        const envelope = this.buildCs2Envelope(input, result.provider);
        const created = this.runs.createRun({
          envelope,
          provider: result.provider,
          model: result.model,
          gameAdapterVersion: 'cs2.legacy-bridge.v1',
        });
        if (!created) continue;
        const response = legacyResultToAnalysisResponse({ envelope, result });
        const detail = this.runs.ingestResponse({
          runId: created.run.runId,
          rawResponse: JSON.stringify(response),
          attempt: 0,
          allowRepair: true,
          latencyMs: result.latency,
          promptTokens: result.tokenUsage?.promptTokens,
          completionTokens: result.tokenUsage?.completionTokens,
          totalTokens: result.tokenUsage?.totalTokens,
          settlementRulesAvailable: true,
          policy: activePolicy,
        });
        summaries.push({
          provider: result.provider,
          runId: detail.run.runId,
          status: detail.run.status,
          decisionAction: detail.decision?.action,
        });
      } catch {
        // Bridge failures must never break the legacy analyze path.
      }
    }
    return summaries;
  }

  buildCs2Envelope(input: PersistLegacyAnalysisV1Input, provider: string): AnalysisRequestEnvelope {
    const teamAId = input.teamA.teamId || input.match.teamA.teamId || 'team-a';
    const teamBId = input.teamB.teamId || input.match.teamB.teamId || 'team-b';
    const marketProbA = clamp01(input.marketProbA ?? 0.5);
    const marketProbB = clamp01(1 - marketProbA);
    const facts = buildFactsFromTeams(input.teamA, input.teamB, input.match);
    const missing: string[] = [];
    if (!input.teamA.mapPool.maps.length) missing.push('team_a_map_pool');
    if (!input.teamB.mapPool.maps.length) missing.push('team_b_map_pool');
    if (!(input.match.lineups?.teamA.isConfirmed && input.match.lineups?.teamB.isConfirmed)) {
      missing.push('lineup_confirmed');
    }
    const completeness = Math.max(0.4, 1 - missing.length * 0.1);
    const dataSnapshotHash = hashDataSnapshot({
      dataSnapshotHash: '',
      completeness,
      freshnessSeconds: 0,
      facts,
      missing,
    });

    const runId = buildRunId({
      game: 'cs2',
      matchId: input.match.matchId,
      marketId: 'match-winner',
      nonce: `${provider.slice(0, 4)}${Math.random().toString(36).slice(2, 5)}`,
    });

    return {
      contractVersion: 'analysis.v1',
      runId,
      promptVersion: 'cs2.match-winner.v1.0.0',
      game: 'cs2' satisfies EsportsGame,
      locale: 'zh-CN',
      generatedAt: new Date().toISOString(),
      match: {
        matchId: input.match.matchId,
        eventName: input.match.eventName || 'CS2 Match',
        startsAt: input.match.scheduledAt || new Date().toISOString(),
        format: (input.match.format as 'BO1' | 'BO3' | 'BO5') || 'BO3',
        status: input.match.status || 'scheduled',
        participants: [
          { participantId: teamAId, name: input.teamA.name || input.match.teamA.name, side: 'a' },
          { participantId: teamBId, name: input.teamB.name || input.match.teamB.name, side: 'b' },
        ],
      },
      market: {
        marketId: `${input.match.matchId}:match_winner`,
        kind: 'match_winner',
        line: null,
        outcomes: [
          {
            outcomeId: teamAId,
            label: input.teamA.name || 'Team A',
            marketProbability: marketProbA,
          },
          {
            outcomeId: teamBId,
            label: input.teamB.name || 'Team B',
            marketProbability: marketProbB,
          },
        ],
        liquidityUsd: input.liquidityUsd ?? 5000,
        observedAt: new Date().toISOString(),
      },
      dataSnapshot: {
        dataSnapshotHash,
        completeness,
        freshnessSeconds: 0,
        facts,
        missing,
      },
      policy: (() => {
        const active = this.paperPolicy.getActive();
        return {
          minimumCompleteness: active.minimumCompleteness,
          maximumFreshnessSeconds: active.maximumFreshnessSeconds,
          minimumConfidence: active.minimumConfidence,
          minimumEdge: active.minimumEdge,
          lowLiquidityThresholdUsd: active.lowLiquidityThresholdUsd,
          allowedActions: ['recommend_outcome', 'pass'],
        };
      })(),
    };
  }
}

function buildFactsFromTeams(teamA: Team, teamB: Team, match: MatchInfo): AnalysisFact[] {
  const now = new Date().toISOString();
  const facts: AnalysisFact[] = [
    {
      factId: 'team-a-rank',
      entityType: 'team',
      source: 'database',
      observedAt: now,
      field: 'rank',
      value: teamA.rank,
    },
    {
      factId: 'team-b-rank',
      entityType: 'team',
      source: 'database',
      observedAt: now,
      field: 'rank',
      value: teamB.rank,
    },
    {
      factId: 'team-a-form',
      entityType: 'team',
      source: 'database',
      observedAt: now,
      field: 'recent_win_rate',
      value: teamA.recentForm.winRate,
    },
    {
      factId: 'team-b-form',
      entityType: 'team',
      source: 'database',
      observedAt: now,
      field: 'recent_win_rate',
      value: teamB.recentForm.winRate,
    },
  ];
  if (match.lineups?.teamA.players.length) {
    facts.push({
      factId: 'team-a-lineup',
      entityType: 'roster',
      source: 'database',
      observedAt: now,
      field: 'players',
      value: match.lineups.teamA.players.map((p) => p.nickname),
    });
  }
  if (match.lineups?.teamB.players.length) {
    facts.push({
      factId: 'team-b-lineup',
      entityType: 'roster',
      source: 'database',
      observedAt: now,
      field: 'players',
      value: match.lineups.teamB.players.map((p) => p.nickname),
    });
  }
  return facts;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(0.99, Math.max(0.01, value));
}
