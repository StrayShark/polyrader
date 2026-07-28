import { randomUUID } from 'crypto';
import type {
  AnalysisMarketKind,
  AnalysisReport,
  BetResultAnalysisArtifact,
  BetResultAnalysisRequestEnvelope,
  BetResultAnalysisValidationError,
  EsportsGame,
  LLMProvider,
} from '@polyrader/core';
import {
  buildBetResultAnalysisArtifacts,
  parseBetResultAnalysisResponseJson,
  validateBetResultAnalysisResponse,
} from '@polyrader/core';
import {
  AnalysisRunRepository,
  BetResultAnalysisRepository,
} from '@polyrader/infra';
import { AiConfigService } from './ai-config-service';
import { ReviewService } from './review-service';

interface BetResultPromptExecutor {
  completeStandardPrompt(input: {
    system: string;
    user: string;
    provider?: string;
  }): Promise<{ provider: LLMProvider; model: string; rawResponse: string; latencyMs: number }>;
}

const GAMES = new Set<EsportsGame>(['cs2', 'dota2', 'lol', 'valorant']);
const MARKET_KINDS = new Set<AnalysisMarketKind>([
  'match_winner',
  'map_winner',
  'handicap',
  'total_maps',
  'correct_score',
]);

function nullableNumber(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) ? value : null;
}

function normalizeLocale(locale?: string): string {
  if (!locale || locale === 'zh') return 'zh-CN';
  if (locale === 'en') return 'en-US';
  return locale;
}

function parseReport(value?: string): AnalysisReport | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as AnalysisReport;
  } catch {
    return null;
  }
}

export class BetResultAnalysisService {
  private readonly reviews: ReviewService;
  private readonly artifacts: BetResultAnalysisRepository;
  private readonly analysisRuns: AnalysisRunRepository;
  private readonly llm: BetResultPromptExecutor;

  constructor(deps?: {
    reviews?: ReviewService;
    artifacts?: BetResultAnalysisRepository;
    analysisRuns?: AnalysisRunRepository;
    llm?: BetResultPromptExecutor;
  }) {
    this.reviews = deps?.reviews ?? new ReviewService();
    this.artifacts = deps?.artifacts ?? new BetResultAnalysisRepository();
    this.analysisRuns = deps?.analysisRuns ?? new AnalysisRunRepository();
    this.llm = deps?.llm ?? new AiConfigService();
  }

  getLatest(betId: string): BetResultAnalysisArtifact | undefined {
    return this.artifacts.getLatestByBetId(betId);
  }

  async execute(input: {
    betId: string;
    provider?: string;
    locale?: string;
    force?: boolean;
  }): Promise<BetResultAnalysisArtifact> {
    const latest = this.artifacts.getLatestByBetId(input.betId);
    if (
      !input.force &&
      latest &&
      ['prompt_ready', 'provider_running', 'valid'].includes(latest.status)
    ) {
      return latest;
    }

    const envelope = this.buildEnvelope(input.betId, normalizeLocale(input.locale));
    const prompt = buildBetResultAnalysisArtifacts(envelope);
    this.artifacts.createPrompt({
      id: envelope.analysisId,
      envelope,
      ...prompt,
    });
    this.artifacts.markRunning(envelope.analysisId);

    try {
      const completed = await this.llm.completeStandardPrompt({
        system: prompt.systemPrompt,
        user: prompt.inputJson,
        provider: input.provider,
      });
      let parsed: unknown;
      let parseErrors: BetResultAnalysisValidationError[] = [];
      try {
        parsed = parseBetResultAnalysisResponseJson(completed.rawResponse);
      } catch (error) {
        parseErrors = [{
          code: 'INVALID_JSON',
          path: '$',
          message: (error as Error).message.slice(0, 500),
        }];
      }
      const validation = parseErrors.length > 0
        ? { ok: false as const, errors: parseErrors }
        : validateBetResultAnalysisResponse(parsed, envelope);
      return this.artifacts.complete({
        id: envelope.analysisId,
        status: validation.ok ? 'valid' : 'invalid',
        provider: completed.provider,
        model: completed.model,
        rawResponse: completed.rawResponse,
        normalizedResponse: validation.ok ? validation.value : undefined,
        validationErrors: validation.errors,
        latencyMs: completed.latencyMs,
      });
    } catch (error) {
      this.artifacts.fail(envelope.analysisId, (error as Error).message);
      throw error;
    }
  }

  private buildEnvelope(betId: string, locale: string): BetResultAnalysisRequestEnvelope {
    const detail = this.reviews.getReviewDetail(betId);
    if (!detail) throw new Error(`Bet ${betId} not found`);
    const { bet, review, snapshots } = detail;
    if (bet.status !== 'settled' || !bet.result) {
      throw new Error(`Bet ${betId} must be settled before result analysis`);
    }

    const now = new Date().toISOString();
    const reportRow = bet.runId ? this.analysisRuns.getReportByRun(bet.runId) : undefined;
    const report = parseReport(reportRow?.reportJson);
    const game = GAMES.has(bet.game as EsportsGame) ? bet.game as EsportsGame : 'unknown';
    const marketKind = MARKET_KINDS.has(bet.marketKind as AnalysisMarketKind)
      ? bet.marketKind as AnalysisMarketKind
      : 'unknown';
    const brierScore = nullableNumber(detail.brierScore);
    const closingLineValue = nullableNumber(detail.closingLineValue);
    const roi = nullableNumber(detail.roi);
    const placementOdds = nullableNumber(detail.placementOdds);
    const closingOdds = nullableNumber(detail.closingOdds);
    const preBetAnalysis = {
      runId: bet.runId ?? null,
      reportId: bet.reportId ?? report?.id ?? null,
      provider: report?.provider ?? bet.provider ?? null,
      model: report?.model ?? null,
      modelProbability: nullableNumber(bet.modelProbability),
      marketProbability: nullableNumber(bet.marketProbability),
      userProbability: nullableNumber(bet.userProbability),
      edgeAtEntry: nullableNumber(bet.edgeAtEntry ?? bet.edge),
      confidenceScore: report ? report.confidence.score : null,
      recommendationOutcomeId: report?.recommendation.outcomeId ?? null,
      decisionAction: report?.decision.action ?? null,
      decisionReasonCodes: report?.decision.reasonCodes ?? [],
      rationaleSummary: report?.rationaleSummary ?? null,
    };

    const evidence: BetResultAnalysisRequestEnvelope['evidence'] = [
      {
        evidenceId: 'bet:result',
        category: 'bet',
        observedAt: bet.settledAt ?? now,
        value: { result: bet.result, pnl: bet.pnl, stake: bet.stake, totalOdds: bet.totalOdds },
      },
      {
        evidenceId: 'bet:legs',
        category: 'bet',
        observedAt: bet.placedAt,
        value: (detail.legs ?? []).map((leg) => ({
          legId: leg.id,
          matchId: leg.matchId ?? null,
          marketId: leg.marketId ?? null,
          selection: leg.selection,
          odds: leg.odds,
          result: leg.result ?? null,
        })),
      },
      {
        evidenceId: 'settlement:source',
        category: 'settlement',
        observedAt: bet.settledAt ?? now,
        value: { source: bet.settlementSource ?? null, settledAt: bet.settledAt ?? null },
      },
      {
        evidenceId: 'metric:outcome-quality',
        category: 'metric',
        observedAt: bet.settledAt ?? now,
        value: { brierScore, closingLineValue, roi, placementOdds, closingOdds },
      },
    ];
    if (report || bet.runId) {
      evidence.push({
        evidenceId: 'prebet:analysis',
        category: 'pre_bet_analysis',
        observedAt: report?.audit.generatedAt ?? bet.placedAt,
        value: preBetAnalysis,
      });
    }
    if (snapshots.length > 0) {
      evidence.push({
        evidenceId: 'market:odds-timeline',
        category: 'market',
        observedAt: snapshots[snapshots.length - 1]?.capturedAt ?? now,
        value: snapshots.map((snapshot) => ({
          selection: snapshot.selection,
          odds: snapshot.odds,
          source: snapshot.source,
          capturedAt: snapshot.capturedAt,
        })),
      });
    }
    if (review?.note || (review?.errorTags.length ?? 0) > 0) {
      evidence.push({
        evidenceId: 'user:review',
        category: 'user_review',
        observedAt: review?.updatedAt ?? now,
        value: { errorTags: review?.errorTags ?? [], note: review?.note ?? null },
      });
    }

    return {
      contractVersion: 'bet-review.v1',
      analysisId: `bra-${randomUUID()}`,
      promptVersion: 'bet-review.v1.0.0',
      locale,
      generatedAt: now,
      bet: {
        betId: bet.id,
        accountId: bet.accountId,
        game,
        matchId: bet.matchId ?? null,
        matchName: detail.matchName ?? null,
        marketId: bet.marketId ?? null,
        marketKind,
        betType: bet.betType,
        status: 'settled',
        result: bet.result,
        stake: bet.stake,
        totalOdds: bet.totalOdds,
        pnl: bet.pnl,
        placedAt: bet.placedAt,
        settledAt: bet.settledAt ?? null,
        settlementSource: bet.settlementSource ?? null,
        reasoning: bet.reasoning ?? null,
        legs: (detail.legs ?? []).map((leg) => ({
          legId: leg.id,
          matchId: leg.matchId ?? null,
          marketId: leg.marketId ?? null,
          selection: leg.selection,
          odds: leg.odds,
          result: leg.result ?? null,
        })),
      },
      preBetAnalysis,
      metrics: { placementOdds, closingOdds, brierScore, closingLineValue, roi },
      userReview: {
        errorTags: review?.errorTags ?? [],
        note: review?.note ?? null,
      },
      evidence,
    };
  }

}
