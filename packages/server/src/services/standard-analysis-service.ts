import type {
  AnalysisMarketKind,
  AnalysisRequestEnvelope,
  EsportsGame,
  LLMProvider,
  NormalizedMatchFacts,
} from '@polyrader/core';
import { buildRunId, findSettlementRule } from '@polyrader/core';
import { FactRepository, LLMRepository, MarketRepository } from '@polyrader/infra';
import { AiConfigService } from './ai-config-service';
import { AnalysisFactPreparationService } from './analysis-fact-preparation-service';
import { AnalysisRunService, type AnalysisRunDetail } from './analysis-run-service';
import { PaperPolicyService } from './paper-policy-service';

export interface ExecuteStandardAnalysisInput {
  game: EsportsGame;
  matchId?: string;
  provider?: string;
  locale?: string;
  market?: {
    marketId?: string;
    kind?: AnalysisMarketKind;
    line?: number | null;
    liquidityUsd?: number;
    observedAt?: string;
    outcomes?: Array<{
      outcomeId: string;
      label: string;
      marketProbability: number;
    }>;
  };
}

interface StandardPromptExecutor {
  completeStandardPrompt(input: {
    system: string;
    user: string;
    provider?: string;
  }): Promise<{ provider: LLMProvider; model: string; rawResponse: string; latencyMs: number }>;
}

/** Real analysis.v1 executor: normalized facts -> frozen prompt -> provider -> validated report. */
export class StandardAnalysisService {
  private readonly facts: FactRepository;
  private readonly runs: AnalysisRunService;
  private readonly policy: PaperPolicyService;
  private readonly llm: StandardPromptExecutor;
  private readonly llmConfigs: LLMRepository;
  private readonly markets: MarketRepository;
  private readonly factPreparation: Pick<AnalysisFactPreparationService, 'prepare'>;

  constructor(deps?: {
    facts?: FactRepository;
    runs?: AnalysisRunService;
    policy?: PaperPolicyService;
    llm?: StandardPromptExecutor;
    llmConfigs?: LLMRepository;
    markets?: MarketRepository;
    factPreparation?: Pick<AnalysisFactPreparationService, 'prepare'>;
  }) {
    this.facts = deps?.facts ?? new FactRepository();
    this.runs = deps?.runs ?? new AnalysisRunService();
    this.policy = deps?.policy ?? new PaperPolicyService();
    this.llm = deps?.llm ?? new AiConfigService();
    this.llmConfigs = deps?.llmConfigs ?? new LLMRepository();
    this.markets = deps?.markets ?? new MarketRepository();
    this.factPreparation = deps?.factPreparation ?? new AnalysisFactPreparationService();
  }

  async execute(input: ExecuteStandardAnalysisInput): Promise<AnalysisRunDetail> {
    await this.factPreparation.prepare(input.game, input.matchId);
    const facts = this.resolveFacts(input.game, input.matchId);
    const activePolicy = this.policy.getActive();
    const storedMarket = input.market ? undefined : this.resolveStoredMarket(input.game, facts);
    const kind = input.market?.kind ?? storedMarket?.kind ?? 'match_winner';
    const marketId =
      input.market?.marketId ??
      storedMarket?.marketId ??
      `local-practice:${facts.externalMatchId}:${kind}`;
    const runId = buildRunId({ game: input.game, matchId: facts.externalMatchId, marketId });
    const outcomes =
      input.market?.outcomes ??
      storedMarket?.outcomes ??
      facts.participants.map((participant) => ({
        outcomeId: participant.participantId,
        label: participant.name,
        marketProbability: 1 / facts.participants.length,
      }));

    const envelope: AnalysisRequestEnvelope = {
      contractVersion: 'analysis.v1',
      runId,
      promptVersion: `${input.game}.${kind}.v1.0.0`,
      game: input.game,
      locale: input.locale ?? 'zh-CN',
      generatedAt: new Date().toISOString(),
      match: {
        matchId: facts.externalMatchId,
        eventId: facts.eventId,
        eventName: facts.eventName,
        startsAt: facts.startsAt,
        format: facts.format,
        status: facts.status,
        participants: facts.participants.map((participant) => ({
          participantId: participant.participantId,
          name: participant.name,
          side: participant.side,
        })),
      },
      market: {
        marketId,
        kind,
        line: input.market?.line ?? null,
        outcomes,
        liquidityUsd: input.market?.liquidityUsd ?? storedMarket?.liquidityUsd ?? 0,
        observedAt:
          input.market?.observedAt ?? storedMarket?.observedAt ?? new Date().toISOString(),
      },
      dataSnapshot: {
        dataSnapshotHash: facts.dataSnapshotHash,
        completeness: facts.completeness,
        freshnessSeconds: facts.freshnessSeconds,
        facts: facts.facts,
        missing: [...facts.missing, ...facts.conflictFlags],
      },
      policy: {
        minimumCompleteness: activePolicy.minimumCompleteness,
        maximumFreshnessSeconds: activePolicy.maximumFreshnessSeconds,
        minimumConfidence: activePolicy.minimumConfidence,
        minimumEdge: activePolicy.minimumEdge,
        lowLiquidityThresholdUsd: activePolicy.lowLiquidityThresholdUsd,
        allowedActions: ['recommend_outcome', 'pass'],
      },
    };

    const selected = await this.selectProvider(input.provider);
    const created = this.runs.createRun({
      envelope,
      provider: selected.provider,
      model: selected.model,
      gameAdapterVersion: facts.adapterVersion,
      marketAdapterVersion: 'market.v1',
    });
    if (!created) throw new Error(`Failed to create analysis run ${runId}`);
    if (!created.prompt) throw new Error(`Prompt artifact missing for run ${runId}`);

    this.runs.markProviderRunning(runId);
    try {
      const completed = await this.llm.completeStandardPrompt({
        system: created.prompt.systemPrompt,
        user: created.prompt.userEnvelopeJson,
        provider: selected.provider,
      });
      const isUpcoming =
        ['scheduled', 'upcoming', 'pre_match'].includes(facts.status) &&
        Date.parse(facts.startsAt) >= Date.now();
      const settlementRulesAvailable =
        Boolean(findSettlementRule(input.game, kind)?.supported) && isUpcoming;
      return this.runs.ingestResponse({
        runId,
        rawResponse: completed.rawResponse,
        latencyMs: completed.latencyMs,
        allowRepair: true,
        policy: activePolicy,
        settlementRulesAvailable,
      });
    } catch (error) {
      this.runs.markFailed(runId, (error as Error).message);
      throw error;
    }
  }

  private resolveFacts(game: EsportsGame, matchId?: string): NormalizedMatchFacts {
    const facts = matchId
      ? this.facts.getByGameExternalId(game, matchId)
      : this.facts.listByGame(game, 1)[0];
    if (!facts) throw new Error(`No normalized ${game} match facts available`);
    if (facts.participants.length !== 2) {
      throw new Error(`Match ${facts.externalMatchId} must have exactly two participants`);
    }
    return facts;
  }

  private async selectProvider(requested?: string): Promise<{ provider: string; model: string }> {
    const configs = await this.llmConfigs.getAllConfigs();
    const config = configs.find(
      (item) =>
        item.isEnabled &&
        Boolean(item.apiKey) &&
        item.provider !== 'user' &&
        (!requested || item.provider === requested),
    );
    if (!config) {
      throw new Error(
        requested
          ? `LLM provider ${requested} is not configured or enabled`
          : 'No executable LLM provider is configured or enabled',
      );
    }
    return { provider: config.provider, model: config.model };
  }

  private resolveStoredMarket(game: EsportsGame, facts: NormalizedMatchFacts) {
    const canonicalId =
      game === 'cs2' ? `hltv:${facts.externalMatchId}` : `${game}:${facts.externalMatchId}`;
    const market = this.markets
      .findByCanonicalMatchId(canonicalId)
      .find(
        (item) => item.status === 'active' && item.outcomes.length === facts.participants.length,
      );
    if (!market) return undefined;
    const rawPrices = market.outcomePrices.map((value) => Number(value));
    const validPrices =
      rawPrices.length === market.outcomes.length &&
      rawPrices.every((value) => Number.isFinite(value) && value >= 0);
    const total = validPrices ? rawPrices.reduce((sum, value) => sum + value, 0) : 0;
    const outcomes = market.outcomes.map((label, index) => {
      const participant = facts.participants.find(
        (item) => normalizeName(item.name) === normalizeName(label),
      );
      return {
        outcomeId: participant?.participantId ?? `o${index}`,
        label,
        marketProbability: total > 0 ? rawPrices[index] / total : 1 / market.outcomes.length,
      };
    });
    return {
      marketId: market.conditionId,
      kind: 'match_winner' as const,
      liquidityUsd: market.liquidity,
      observedAt: new Date().toISOString(),
      outcomes,
    };
  }
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}
