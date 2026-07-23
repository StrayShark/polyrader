import type {
  AnalysisReport,
  AnalysisRequestEnvelope,
  AnalysisResponseV1,
  EsportsGame,
  PaperDecisionResult,
  PaperPolicyProfile,
} from '@polyrader/core';
import {
  buildAnalysisReport,
  buildPromptArtifacts,
  buildRunId,
  decidePaperOrder,
  findSettlementRule,
  validateWithOptionalRepair,
} from '@polyrader/core';
import { AnalysisRunRepository, PaperRiskLimitError } from '@polyrader/infra';
import { randomUUID } from 'crypto';
import { PaperPolicyService } from './paper-policy-service';
import { SimBetService } from './sim-bet-service';

export interface CreateAnalysisRunInput {
  envelope: AnalysisRequestEnvelope;
  provider?: string;
  model?: string;
  gameAdapterVersion?: string;
  marketAdapterVersion?: string;
}

export interface IngestAnalysisResponseInput {
  runId: string;
  rawResponse: string;
  attempt?: number;
  allowRepair?: boolean;
  latencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  policy?: Partial<PaperPolicyProfile>;
  settlementRulesAvailable?: boolean;
  bankroll?: number;
}

export interface AnalysisRunDetail {
  run: NonNullable<ReturnType<AnalysisRunRepository['getRun']>>;
  prompt: ReturnType<AnalysisRunRepository['getPromptArtifact']>;
  responses: ReturnType<AnalysisRunRepository['listResponseArtifacts']>;
  events: ReturnType<AnalysisRunRepository['listEvents']>;
  report: AnalysisReport | null;
  decision: PaperDecisionResult | null;
  envelope: AnalysisRequestEnvelope | null;
  /** Linked practice bet created from a paper_bet decision, if any. */
  linkedBet: {
    id: string;
    status: string;
    result: string | null;
    stake: number;
    pnl: number;
    edgeAtEntry?: number;
    policyVersion?: string;
    game?: string;
    marketKind?: string;
    clvStatus?: string;
    closingOdds?: number;
    clv?: number;
    placedAt: string;
    settledAt?: string;
  } | null;
  decisionBetId: string | null;
}

/** Deterministic CS2 fixture used by API demo mode and integration tests. */
export function buildCs2AnalysisFixture(options?: { nonce?: string; now?: Date }): {
  envelope: AnalysisRequestEnvelope;
  response: AnalysisResponseV1;
} {
  const now = options?.now ?? new Date();
  const generatedAt = now.toISOString();
  const startsAt = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();
  const runId = buildRunId({
    game: 'cs2',
    matchId: '2395534',
    marketId: 'match-winner',
    now,
    nonce: options?.nonce ?? 'a1b2',
  });

  const envelope: AnalysisRequestEnvelope = {
    contractVersion: 'analysis.v1',
    runId,
    promptVersion: 'cs2.match-winner.v1.0.0',
    game: 'cs2',
    locale: 'zh-CN',
    generatedAt,
    match: {
      matchId: '2395534',
      eventId: 'iem-cologne-2026',
      eventName: 'IEM Cologne',
      startsAt,
      format: 'BO3',
      status: 'scheduled',
      participants: [
        { participantId: 'navi', name: 'Natus Vincere', side: 'a' },
        { participantId: 'faze', name: 'FaZe Clan', side: 'b' },
      ],
    },
    market: {
      marketId: 'market-1',
      kind: 'match_winner',
      line: null,
      outcomes: [
        { outcomeId: 'navi', label: 'Natus Vincere', marketProbability: 0.56 },
        { outcomeId: 'faze', label: 'FaZe Clan', marketProbability: 0.44 },
      ],
      liquidityUsd: 8200,
      observedAt: new Date(now.getTime() - 30 * 1000).toISOString(),
    },
    dataSnapshot: {
      dataSnapshotHash: 'sha256:cs2-fixture-navi-faze',
      completeness: 0.88,
      freshnessSeconds: 1800,
      facts: [
        {
          factId: 'team-a-rating',
          entityType: 'team',
          source: 'hltv',
          observedAt: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
          field: 'rating',
          value: 1.12,
        },
        {
          factId: 'team-a-mirage',
          entityType: 'team',
          source: 'hltv',
          observedAt: new Date(now.getTime() - 20 * 60 * 1000).toISOString(),
          field: 'map_winrate',
          value: 0.64,
        },
        {
          factId: 'lineup-confirmed',
          entityType: 'match',
          source: 'liquipedia',
          observedAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
          field: 'lineup_confirmed',
          value: true,
        },
      ],
      missing: ['veto'],
    },
    policy: {
      minimumCompleteness: 0.7,
      maximumFreshnessSeconds: 3600,
      minimumConfidence: 0.6,
      minimumEdge: 0.05,
      lowLiquidityThresholdUsd: 1000,
      allowedActions: ['recommend_outcome', 'pass'],
    },
  };

  const response: AnalysisResponseV1 = {
    contractVersion: 'analysis-response.v1',
    runId,
    prediction: {
      outcomes: [
        { outcomeId: 'navi', probability: 0.62 },
        { outcomeId: 'faze', probability: 0.38 },
      ],
    },
    confidence: {
      score: 0.68,
      grade: 'medium',
      reasonCodes: ['VETO_UNAVAILABLE'],
    },
    recommendation: {
      action: 'recommend_outcome',
      outcomeId: 'navi',
    },
    evidence: [
      {
        factIds: ['team-a-rating'],
        direction: 'supports',
        impact: 'medium',
        summary: 'NaVi has the stronger recent rating sample.',
      },
      {
        factIds: ['team-a-mirage'],
        direction: 'supports',
        impact: 'medium',
        summary: 'Mirage map sample favors NaVi.',
      },
      {
        factIds: ['lineup-confirmed'],
        direction: 'supports',
        impact: 'low',
        summary: 'Both starting lineups are confirmed.',
      },
    ],
    risks: [
      {
        code: 'VETO_UNAVAILABLE',
        severity: 'medium',
        summary: 'Map veto is not published yet.',
      },
    ],
    rationaleSummary: 'NaVi has a modest evidence-backed advantage, reduced by veto uncertainty.',
  };

  return { envelope, response };
}

/** Deterministic Dota 2 fixture for the Sprint 2 paper-order and settlement loop. */
export function buildDota2AnalysisFixture(options?: { nonce?: string; now?: Date }): {
  envelope: AnalysisRequestEnvelope;
  response: AnalysisResponseV1;
} {
  const now = options?.now ?? new Date();
  const generatedAt = now.toISOString();
  const observedAt = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  const matchId = '8906069414';
  const runId = buildRunId({
    game: 'dota2',
    matchId,
    marketId: 'match-winner',
    now,
    nonce: options?.nonce ?? 'd2a1',
  });

  const envelope: AnalysisRequestEnvelope = {
    contractVersion: 'analysis.v1',
    runId,
    promptVersion: 'dota2.match-winner.v1.0.0',
    game: 'dota2',
    locale: 'zh-CN',
    generatedAt,
    match: {
      matchId,
      eventId: 'dota2-sprint-2',
      eventName: 'Dota 2 Practice Series',
      startsAt: new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString(),
      format: 'BO1',
      status: 'scheduled',
      participants: [
        { participantId: 'liquid', name: 'Team Liquid', side: 'a' },
        { participantId: 'falcons', name: 'Team Falcons', side: 'b' },
      ],
    },
    market: {
      marketId: `local-dota2-${matchId}`,
      kind: 'match_winner',
      line: null,
      evidenceType: 'synthetic',
      liquidityStatus: 'synthetic',
      outcomes: [
        { outcomeId: 'liquid', label: 'Team Liquid', marketProbability: 0.52 },
        { outcomeId: 'falcons', label: 'Team Falcons', marketProbability: 0.48 },
      ],
      liquidityUsd: 0,
      observedAt: generatedAt,
    },
    dataSnapshot: {
      dataSnapshotHash: 'sha256:dota2-fixture-liquid-falcons-v2',
      completeness: 0.95,
      freshnessSeconds: 600,
      facts: [
        {
          factId: 'team-a-rating',
          entityType: 'team',
          source: 'opendota',
          observedAt,
          field: 'rating',
          value: 1542.5,
        },
        {
          factId: 'team-b-rating',
          entityType: 'team',
          source: 'opendota',
          observedAt,
          field: 'rating',
          value: 1510.2,
        },
        {
          factId: 'patch-current',
          entityType: 'patch',
          source: 'opendota',
          observedAt,
          field: 'patch',
          value: '7.41',
        },
        {
          factId: 'team-a-roster',
          entityType: 'team',
          source: 'opendota',
          observedAt,
          field: 'roster',
          value: ['Liquid 1', 'Liquid 2', 'Liquid 3', 'Liquid 4', 'Liquid 5'],
        },
        {
          factId: 'draft-context',
          entityType: 'match',
          source: 'opendota',
          observedAt,
          field: 'draft_context',
          value: { status: 'pre_match', picksBans: [] },
        },
      ],
      missing: [],
    },
    policy: {
      minimumCompleteness: 0.7,
      maximumFreshnessSeconds: 3600,
      minimumConfidence: 0.6,
      minimumEdge: 0.05,
      lowLiquidityThresholdUsd: 1000,
      allowedActions: ['recommend_outcome', 'pass'],
    },
  };

  const response: AnalysisResponseV1 = {
    contractVersion: 'analysis-response.v1',
    runId,
    prediction: {
      outcomes: [
        { outcomeId: 'liquid', probability: 0.62 },
        { outcomeId: 'falcons', probability: 0.38 },
      ],
    },
    confidence: {
      score: 0.72,
      grade: 'medium',
      reasonCodes: ['PRE_MATCH_DRAFT'],
    },
    recommendation: { action: 'recommend_outcome', outcomeId: 'liquid' },
    evidence: [
      {
        factIds: ['team-a-rating', 'team-b-rating'],
        direction: 'supports',
        impact: 'medium',
        summary: 'OpenDota team ratings give Team Liquid a modest baseline advantage.',
      },
      {
        factIds: ['patch-current', 'team-a-roster'],
        direction: 'supports',
        impact: 'low',
        summary: 'Patch and roster context are present in the frozen snapshot.',
      },
    ],
    risks: [
      {
        code: 'PRE_MATCH_DRAFT',
        severity: 'medium',
        summary: 'The final draft is unavailable before the game begins.',
      },
      {
        code: 'LOW_LIQUIDITY',
        severity: 'high',
        summary: 'The local practice market has no external liquidity.',
      },
    ],
    rationaleSummary: 'Team Liquid has a measured edge, with stake reduced for zero liquidity.',
  };

  return { envelope, response };
}

export function buildLolAnalysisFixture(options?: { nonce?: string; now?: Date }): {
  envelope: AnalysisRequestEnvelope;
  response: AnalysisResponseV1;
} {
  return buildGridGameAnalysisFixture('lol', options);
}

export function buildValorantAnalysisFixture(options?: { nonce?: string; now?: Date }): {
  envelope: AnalysisRequestEnvelope;
  response: AnalysisResponseV1;
} {
  return buildGridGameAnalysisFixture('valorant', options);
}

function buildGridGameAnalysisFixture(
  game: Extract<EsportsGame, 'lol' | 'valorant'>,
  options?: { nonce?: string; now?: Date },
): { envelope: AnalysisRequestEnvelope; response: AnalysisResponseV1 } {
  const now = options?.now ?? new Date();
  const generatedAt = now.toISOString();
  const observedAt = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  const isLol = game === 'lol';
  const matchId = isLol ? 'lck-104' : 'vct-82';
  const teamA = isLol ? { id: 't1', name: 'T1' } : { id: 'sen', name: 'Sentinels' };
  const teamB = isLol
    ? { id: 'hle', name: 'Hanwha Life Esports' }
    : { id: 'g2', name: 'G2 Esports' };
  const event = isLol
    ? { id: 'lck-2026-summer', name: 'LCK' }
    : { id: 'vct-2026-americas', name: 'VCT Americas' };
  const runId = buildRunId({
    game,
    matchId,
    marketId: 'match-winner',
    now,
    nonce: options?.nonce ?? (isLol ? 'lol3' : 'val3'),
  });
  const contextFactId = isLol ? 'patch-current' : 'map-pool-current';

  const envelope: AnalysisRequestEnvelope = {
    contractVersion: 'analysis.v1',
    runId,
    promptVersion: `${game}.match-winner.v1.0.0`,
    game,
    locale: 'zh-CN',
    generatedAt,
    match: {
      matchId,
      eventId: event.id,
      eventName: event.name,
      startsAt: new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString(),
      format: 'BO3',
      status: 'scheduled',
      participants: [
        { participantId: teamA.id, name: teamA.name, side: 'a' },
        { participantId: teamB.id, name: teamB.name, side: 'b' },
      ],
    },
    market: {
      marketId: `local-${game}-${matchId}`,
      kind: 'match_winner',
      line: null,
      outcomes: [
        { outcomeId: teamA.id, label: teamA.name, marketProbability: 0.5 },
        { outcomeId: teamB.id, label: teamB.name, marketProbability: 0.5 },
      ],
      liquidityUsd: 0,
      observedAt: generatedAt,
    },
    dataSnapshot: {
      dataSnapshotHash: `sha256:${game}-sprint-3-fixture`,
      completeness: 0.9,
      freshnessSeconds: 600,
      facts: [
        {
          factId: 'team-a-roster',
          entityType: 'roster',
          source: 'grid',
          observedAt,
          field: 'players',
          value: Array.from({ length: 5 }, (_, index) => `${teamA.name} ${index + 1}`),
        },
        {
          factId: 'team-b-roster',
          entityType: 'roster',
          source: 'grid',
          observedAt,
          field: 'players',
          value: Array.from({ length: 5 }, (_, index) => `${teamB.name} ${index + 1}`),
        },
        {
          factId: contextFactId,
          entityType: isLol ? 'patch' : 'map',
          source: isLol ? 'riot-data-dragon' : 'riot',
          observedAt,
          field: isLol ? 'patch' : 'map_pool',
          value: isLol
            ? '16.14.1'
            : ['Ascent', 'Bind', 'Haven', 'Lotus', 'Split', 'Icebox', 'Sunset'],
        },
      ],
      missing: [isLol ? 'draft' : 'agent_bans'],
    },
    policy: {
      minimumCompleteness: 0.7,
      maximumFreshnessSeconds: 3600,
      minimumConfidence: 0.6,
      minimumEdge: 0.05,
      lowLiquidityThresholdUsd: 1000,
      allowedActions: ['recommend_outcome', 'pass'],
    },
  };

  const response: AnalysisResponseV1 = {
    contractVersion: 'analysis-response.v1',
    runId,
    prediction: {
      outcomes: [
        { outcomeId: teamA.id, probability: 0.59 },
        { outcomeId: teamB.id, probability: 0.41 },
      ],
    },
    confidence: {
      score: 0.68,
      grade: 'medium',
      reasonCodes: [isLol ? 'DRAFT_UNAVAILABLE' : 'AGENT_BANS_UNAVAILABLE'],
    },
    recommendation: { action: 'recommend_outcome', outcomeId: teamA.id },
    evidence: [
      {
        factIds: ['team-a-roster', 'team-b-roster'],
        direction: 'supports',
        impact: 'medium',
        summary: 'Both starting rosters are present in the frozen GRID snapshot.',
      },
      {
        factIds: [contextFactId],
        direction: 'supports',
        impact: 'low',
        summary: isLol
          ? 'The current Riot patch is attached to the match facts.'
          : 'The current Riot map pool is attached to the match facts.',
      },
    ],
    risks: [
      {
        code: isLol ? 'DRAFT_UNAVAILABLE' : 'AGENT_BANS_UNAVAILABLE',
        severity: 'medium',
        summary: isLol
          ? 'Champion draft is unavailable before the series begins.'
          : 'Agent selections and map veto are unavailable before the series begins.',
      },
      {
        code: 'LOW_LIQUIDITY',
        severity: 'high',
        summary: 'The local practice market has no external liquidity.',
      },
    ],
    rationaleSummary: `${teamA.name} has a modest fixture edge with uncertainty reduced by the zero-liquidity policy.`,
  };

  return { envelope, response };
}

export function buildAnalysisFixture(game: EsportsGame, options?: { nonce?: string; now?: Date }) {
  if (game === 'dota2') return buildDota2AnalysisFixture(options);
  if (game === 'lol') return buildLolAnalysisFixture(options);
  if (game === 'valorant') return buildValorantAnalysisFixture(options);
  return buildCs2AnalysisFixture(options);
}

export class AnalysisRunService {
  private repo = new AnalysisRunRepository();
  private paperPolicy = new PaperPolicyService();
  private simBets = new SimBetService();

  createRun(input: CreateAnalysisRunInput) {
    const envelope = {
      ...input.envelope,
      runId:
        input.envelope.runId ||
        buildRunId({
          game: input.envelope.game,
          matchId: input.envelope.match.matchId,
          marketId: input.envelope.market.marketId,
        }),
    };

    const artifacts = buildPromptArtifacts(envelope);
    const run = this.repo.createRun({
      runId: envelope.runId,
      envelope,
      promptHash: artifacts.promptHash,
      provider: input.provider,
      model: input.model,
      gameAdapterVersion: input.gameAdapterVersion,
      marketAdapterVersion: input.marketAdapterVersion,
    });
    this.repo.savePromptArtifact({
      runId: envelope.runId,
      systemPrompt: artifacts.systemPrompt,
      userEnvelopeJson: artifacts.userEnvelopeJson,
      outputSchemaJson: artifacts.outputSchemaJson,
      promptHash: artifacts.promptHash,
    });
    this.repo.updateRunStatus(envelope.runId, {
      status: 'prompt_ready',
      promptHash: artifacts.promptHash,
    });
    this.repo.addEvent(
      envelope.runId,
      'prompt',
      'passed',
      `prompt frozen · ${artifacts.promptHash.slice(0, 18)}`,
    );
    return this.getDetail(run.runId);
  }

  ingestResponse(input: IngestAnalysisResponseInput): AnalysisRunDetail {
    const detail = this.getDetail(input.runId);
    if (!detail) throw new Error(`Analysis run ${input.runId} not found`);
    if (!detail.envelope) throw new Error(`Prompt envelope missing for run ${input.runId}`);
    if (detail.report && detail.decision) return detail;

    this.repo.updateRunStatus(input.runId, { status: 'provider_running' });
    this.repo.addEvent(input.runId, 'provider', 'running', 'response ingest started');

    const allowRepair = input.allowRepair !== false;
    const { validation, repairAttempted, repairChanges, effectiveRaw } = validateWithOptionalRepair(
      input.rawResponse,
      detail.envelope,
      allowRepair,
    );

    const attempt = input.attempt ?? 0;
    this.repo.saveResponseArtifact({
      runId: input.runId,
      attempt,
      rawResponse: input.rawResponse,
      normalizedResponseJson: validation.ok ? JSON.stringify(validation.value) : null,
      validationErrors: validation.ok
        ? repairAttempted
          ? [{ code: 'REPAIRED', path: '$', message: repairChanges.join(',') }]
          : []
        : validation.errors,
      isValid: validation.ok,
      latencyMs: input.latencyMs,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens: input.totalTokens,
    });

    if (repairAttempted) {
      this.repo.addEvent(
        input.runId,
        'repair',
        validation.ok ? 'passed' : 'failed',
        repairChanges.join(',') || 'bounded repair attempted',
      );
      // Persist the repaired payload as attempt+1 for auditability.
      if (validation.ok && effectiveRaw !== input.rawResponse) {
        this.repo.saveResponseArtifact({
          runId: input.runId,
          attempt: attempt + 1,
          rawResponse: effectiveRaw,
          normalizedResponseJson: JSON.stringify(validation.value),
          validationErrors: [],
          isValid: true,
          latencyMs: input.latencyMs,
        });
      }
    }

    if (!validation.ok || !validation.value) {
      this.repo.updateRunStatus(input.runId, {
        status: 'invalid_response',
        validationStatus: 'invalid',
      });
      this.repo.addEvent(
        input.runId,
        'validate',
        'failed',
        validation.errors.map((e) => e.code).join(',') || 'schema invalid',
      );
      return this.getDetail(input.runId)!;
    }

    this.repo.updateRunStatus(input.runId, {
      status: 'validated',
      validationStatus: repairAttempted ? 'repaired' : 'valid',
    });
    this.repo.addEvent(
      input.runId,
      'validate',
      'passed',
      repairAttempted ? 'schema valid after one repair' : 'schema and evidence validated',
    );

    const isUpcoming =
      ['scheduled', 'upcoming', 'pre_match'].includes(detail.envelope.match.status) &&
      Date.parse(detail.envelope.match.startsAt) >= Date.now();
    const defaultSettlementAvailable =
      Boolean(findSettlementRule(detail.envelope.game, detail.envelope.market.kind)?.supported) &&
      isUpcoming;
    const decision = decidePaperOrder({
      envelope: detail.envelope,
      response: validation.value,
      reportId: `rp-${randomUUID()}`,
      policy: input.policy ?? this.paperPolicy.getActive(),
      bankroll: input.bankroll,
      settlementRulesAvailable: input.settlementRulesAvailable ?? defaultSettlementAvailable,
    });

    const reportId = `rp-${randomUUID()}`;
    const report = buildAnalysisReport({
      reportId,
      envelope: detail.envelope,
      response: validation.value,
      decision,
      provider: detail.run.provider ?? undefined,
      model: detail.run.model ?? undefined,
      repairCount: repairAttempted ? 1 : 0,
      latencyMs: input.latencyMs,
      tokenUsage:
        input.promptTokens != null
          ? {
              promptTokens: input.promptTokens,
              completionTokens: input.completionTokens ?? 0,
              totalTokens: input.totalTokens ?? input.promptTokens + (input.completionTokens ?? 0),
            }
          : undefined,
    });

    let decisionRowId: string | undefined;
    this.repo.persistValidatedPipeline(() => {
      this.repo.saveReport({
        reportId,
        runId: input.runId,
        report,
        decision,
      });
      const decisionRow = this.repo.savePaperDecision({
        runId: input.runId,
        reportId,
        envelope: detail.envelope!,
        decision,
        provider: detail.run.provider ?? undefined,
      });
      decisionRowId = decisionRow.id;
      this.repo.updateRunStatus(input.runId, { status: 'decision_ready' });
      this.repo.addEvent(
        input.runId,
        'decision',
        decision.action === 'paper_bet'
          ? 'passed'
          : decision.action === 'rejected'
            ? 'warning'
            : 'passed',
        `${decision.action} · ${decision.reasonCodes.join(',')}`,
      );
    });

    if (
      decision.action === 'paper_bet' &&
      decision.outcomeId &&
      decision.stake > 0 &&
      decision.price &&
      decisionRowId
    ) {
      try {
        const existing = this.simBets.getBetByRunId(input.runId);
        const placedBetId =
          existing?.bet.id ??
          this.simBets.placeBet({
            matchId: detail.envelope!.match.matchId,
            marketId: detail.envelope!.market.marketId,
            betType: 'single',
            stake: decision.stake,
            modelProbability: decision.modelProbability ?? undefined,
            userProbability: decision.modelProbability ?? undefined,
            marketProbability: decision.marketProbability ?? undefined,
            matchFormat: detail.envelope!.match.format,
            reasoning: `analysis.v1 ${input.runId} · ${decision.reasonCodes.join(',')}`,
            runId: input.runId,
            reportId,
            policyVersion: decision.policyVersion,
            provider: detail.run.provider ?? 'analysis.v1',
            game: detail.envelope!.game,
            marketKind: detail.envelope!.market.kind,
            edgeAtEntry: decision.edgeAtEntry ?? undefined,
            legs: [
              {
                matchId: detail.envelope!.match.matchId,
                marketId: detail.envelope!.market.marketId,
                selection:
                  detail.envelope!.market.outcomes.find(
                    (item) => item.outcomeId === decision.outcomeId,
                  )?.label ?? decision.outcomeId,
                odds: decision.price,
                source: detail.run.provider ?? 'analysis.v1',
              },
            ],
          }).bet.id;
        this.repo.attachBetToDecision(decisionRowId, placedBetId);
        this.repo.addEvent(input.runId, 'paper_order', 'passed', `sim bet ${placedBetId}`);
      } catch (err) {
        if (err instanceof PaperRiskLimitError && decisionRowId) {
          this.repo.rejectPaperDecision(decisionRowId, err.code);
        }
        this.repo.addEvent(
          input.runId,
          'paper_order',
          'failed',
          `${err instanceof PaperRiskLimitError ? `${err.code} · ` : ''}${(err as Error).message}`.slice(
            0,
            240,
          ),
        );
      }
    }

    return this.getDetail(input.runId)!;
  }

  /** End-to-end fixture: freeze prompt artifacts, validate response and decide a paper order. */
  runFixturePipeline(options?: {
    game?: EsportsGame;
    invalid?: boolean;
    provider?: string;
    model?: string;
    /** Keep fixed for reproducible tests; omit for unique API demo runs. */
    nonce?: string;
    now?: Date;
  }): AnalysisRunDetail {
    const game = options?.game ?? 'cs2';
    const { envelope, response } = buildAnalysisFixture(game, {
      nonce: options?.nonce,
      now: options?.now,
    });
    const created = this.createRun({
      envelope,
      provider: options?.provider ?? 'fixture',
      model: options?.model ?? `${game}-fixture-v1`,
      gameAdapterVersion: `${game}.fixture.v1`,
      marketAdapterVersion: 'market.v1',
    });
    if (!created) throw new Error('Failed to create fixture run');

    const raw = options?.invalid
      ? JSON.stringify({
          ...response,
          prediction: {
            outcomes: [{ outcomeId: response.prediction.outcomes[0]?.outcomeId, probability: 1 }],
          },
        })
      : JSON.stringify(response);

    return this.ingestResponse({
      runId: created.run.runId,
      rawResponse: raw,
      attempt: 0,
      allowRepair: !options?.invalid,
      latencyMs: 42,
      promptTokens: 1200,
      completionTokens: 380,
      totalTokens: 1580,
      settlementRulesAvailable: true,
    });
  }

  runCs2FixturePipeline(options?: {
    invalid?: boolean;
    provider?: string;
    model?: string;
    nonce?: string;
    now?: Date;
  }): AnalysisRunDetail {
    return this.runFixturePipeline({ ...options, game: 'cs2' });
  }

  getDetail(runId: string): AnalysisRunDetail | null {
    const run = this.repo.getRun(runId);
    if (!run) return null;
    const prompt = this.repo.getPromptArtifact(runId);
    const responses = this.repo.listResponseArtifacts(runId);
    const events = this.repo.listEvents(runId);
    const reportRow = this.repo.getReportByRun(runId);
    const decisionRow = this.repo.getPaperDecisionByRun(runId);

    let envelope: AnalysisRequestEnvelope | null = null;
    if (prompt?.userEnvelopeJson) {
      try {
        envelope = JSON.parse(prompt.userEnvelopeJson) as AnalysisRequestEnvelope;
      } catch {
        envelope = null;
      }
    }

    let report: AnalysisReport | null = null;
    if (reportRow) {
      try {
        report = JSON.parse(reportRow.reportJson) as AnalysisReport;
      } catch {
        report = null;
      }
    }

    let decision: PaperDecisionResult | null = null;
    if (decisionRow) {
      decision = {
        action: decisionRow.action as PaperDecisionResult['action'],
        reasonCodes: JSON.parse(decisionRow.reasonCodesJson) as string[],
        outcomeId: decisionRow.outcomeId,
        modelProbability: decisionRow.modelProbability,
        marketProbability: decisionRow.marketProbability,
        edgeAtEntry: decisionRow.edgeAtEntry,
        stake: decisionRow.stake ?? 0,
        price: decisionRow.price,
        policyVersion: decisionRow.policyVersion,
      };
    }

    const linked =
      this.simBets.getBetByRunId(runId)?.bet ??
      (decisionRow?.betId ? this.simBets.getBet(decisionRow.betId)?.bet : undefined);

    return {
      run,
      prompt,
      responses,
      events,
      report,
      decision,
      envelope,
      decisionBetId: decisionRow?.betId ?? linked?.id ?? null,
      linkedBet: linked
        ? {
            id: linked.id,
            status: linked.status,
            result: linked.result,
            stake: linked.stake,
            pnl: linked.pnl,
            edgeAtEntry: linked.edgeAtEntry,
            policyVersion: linked.policyVersion,
            game: linked.game,
            marketKind: linked.marketKind,
            clvStatus: linked.clvStatus,
            closingOdds: linked.closingOdds,
            clv: linked.clv,
            placedAt: linked.placedAt,
            settledAt: linked.settledAt,
          }
        : null,
    };
  }

  listRuns(limit = 50, game?: string) {
    return this.repo.listRuns(limit, game);
  }

  markProviderRunning(runId: string): void {
    this.repo.updateRunStatus(runId, { status: 'provider_running' });
    this.repo.addEvent(runId, 'provider', 'running', 'provider request started');
  }

  markFailed(runId: string, message: string): void {
    this.repo.updateRunStatus(runId, { status: 'failed' });
    this.repo.addEvent(runId, 'provider', 'failed', message.slice(0, 240));
  }
}
