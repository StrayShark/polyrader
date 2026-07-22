import type {
  AnalysisReport,
  AnalysisRequestEnvelope,
  AnalysisResponseV1,
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
import { AnalysisRunRepository } from '@polyrader/infra';
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
  const runId = buildRunId({
    game: 'cs2',
    matchId: '2395534',
    marketId: 'match-winner',
    now: options?.now ?? new Date('2026-07-21T12:00:00.000Z'),
    nonce: options?.nonce ?? 'a1b2',
  });

  const envelope: AnalysisRequestEnvelope = {
    contractVersion: 'analysis.v1',
    runId,
    promptVersion: 'cs2.match-winner.v1.0.0',
    game: 'cs2',
    locale: 'zh-CN',
    generatedAt: '2026-07-21T12:00:00.000Z',
    match: {
      matchId: '2395534',
      eventId: 'iem-cologne-2026',
      eventName: 'IEM Cologne',
      startsAt: '2026-07-21T20:00:00.000Z',
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
      observedAt: '2026-07-21T11:59:30.000Z',
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
          observedAt: '2026-07-21T11:50:00.000Z',
          field: 'rating',
          value: 1.12,
        },
        {
          factId: 'team-a-mirage',
          entityType: 'team',
          source: 'hltv',
          observedAt: '2026-07-21T11:40:00.000Z',
          field: 'map_winrate',
          value: 0.64,
        },
        {
          factId: 'lineup-confirmed',
          entityType: 'match',
          source: 'liquipedia',
          observedAt: '2026-07-21T11:30:00.000Z',
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
        this.repo.addEvent(
          input.runId,
          'paper_order',
          'failed',
          (err as Error).message.slice(0, 240),
        );
      }
    }

    return this.getDetail(input.runId)!;
  }

  /** End-to-end CS2 fixture: create prompt artifacts, ingest valid response, decide paper order. */
  runCs2FixturePipeline(options?: {
    invalid?: boolean;
    provider?: string;
    model?: string;
    /** Keep fixed for reproducible tests; omit for unique API demo runs. */
    nonce?: string;
    now?: Date;
  }): AnalysisRunDetail {
    const { envelope, response } = buildCs2AnalysisFixture({
      nonce: options?.nonce,
      now: options?.now,
    });
    const created = this.createRun({
      envelope,
      provider: options?.provider ?? 'fixture',
      model: options?.model ?? 'cs2-fixture-v1',
    });
    if (!created) throw new Error('Failed to create fixture run');

    const raw = options?.invalid
      ? JSON.stringify({
          ...response,
          prediction: { outcomes: [{ outcomeId: 'navi', probability: 1 }] },
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
