import type {
  AnalysisMarketKind,
  AnalysisRequestEnvelope,
  EsportsGame,
  LLMProvider,
  MarketAlignmentResult,
  NormalizedMatchFacts,
} from '@polyrader/core';
import {
  alignMarketsForMatch,
  buildRunId,
  classifySettledMarketKind,
  evaluateDotaAnalysisEligibility,
  evaluateLolAnalysisEligibility,
  evaluateValorantAnalysisEligibility,
  extractHandicapLine,
  extractTotalMapsLine,
  findSettlementRule,
  type DotaAnalysisEligibility,
  type LolAnalysisEligibility,
  type ValorantAnalysisEligibility,
} from '@polyrader/core';
import { FactRepository, LLMRepository, MarketRepository } from '@polyrader/infra';
import { AiConfigService } from './ai-config-service';
import { AnalysisFactPreparationService } from './analysis-fact-preparation-service';
import { AnalysisRunService, type AnalysisRunDetail } from './analysis-run-service';
import { PaperPolicyService } from './paper-policy-service';
import { Dota2MarketDiscoveryService } from './dota2-market-discovery-service';
import {
  LolMarketDiscoveryService,
  ValorantMarketDiscoveryService,
} from './riot-games-market-discovery-service';

type AnalysisEligibilityGate =
  | DotaAnalysisEligibility
  | LolAnalysisEligibility
  | ValorantAnalysisEligibility;

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

interface StandardFactPreparation {
  prepare(game: EsportsGame, matchId?: string): Promise<unknown>;
}

export class AnalysisEligibilityError extends Error {
  readonly code = 'ANALYSIS_NOT_ELIGIBLE';

  constructor(
    message: string,
    readonly eligibility: AnalysisEligibilityGate,
  ) {
    super(message);
    this.name = 'AnalysisEligibilityError';
  }
}

/** Real analysis.v1 executor: normalized facts -> frozen prompt -> provider -> validated report. */
export class StandardAnalysisService {
  private readonly facts: FactRepository;
  private readonly runs: AnalysisRunService;
  private readonly policy: PaperPolicyService;
  private readonly llm: StandardPromptExecutor;
  private readonly llmConfigs: LLMRepository;
  private readonly markets: MarketRepository;
  private readonly factPreparation: StandardFactPreparation;
  private readonly dotaMarketDiscovery: Pick<Dota2MarketDiscoveryService, 'discoverForFacts'>;
  private readonly lolMarketDiscovery: Pick<LolMarketDiscoveryService, 'discoverForFacts'>;
  private readonly valorantMarketDiscovery: Pick<
    ValorantMarketDiscoveryService,
    'discoverForFacts'
  >;

  constructor(deps?: {
    facts?: FactRepository;
    runs?: AnalysisRunService;
    policy?: PaperPolicyService;
    llm?: StandardPromptExecutor;
    llmConfigs?: LLMRepository;
    markets?: MarketRepository;
    factPreparation?: StandardFactPreparation;
    dotaMarketDiscovery?: Pick<Dota2MarketDiscoveryService, 'discoverForFacts'>;
    lolMarketDiscovery?: Pick<LolMarketDiscoveryService, 'discoverForFacts'>;
    valorantMarketDiscovery?: Pick<ValorantMarketDiscoveryService, 'discoverForFacts'>;
  }) {
    this.facts = deps?.facts ?? new FactRepository();
    this.runs = deps?.runs ?? new AnalysisRunService();
    this.policy = deps?.policy ?? new PaperPolicyService();
    this.llm = deps?.llm ?? new AiConfigService();
    this.llmConfigs = deps?.llmConfigs ?? new LLMRepository();
    this.markets = deps?.markets ?? new MarketRepository();
    this.factPreparation = deps?.factPreparation ?? new AnalysisFactPreparationService();
    this.dotaMarketDiscovery = deps?.dotaMarketDiscovery ?? new Dota2MarketDiscoveryService();
    this.lolMarketDiscovery = deps?.lolMarketDiscovery ?? new LolMarketDiscoveryService();
    this.valorantMarketDiscovery =
      deps?.valorantMarketDiscovery ?? new ValorantMarketDiscoveryService();
  }

  async execute(input: ExecuteStandardAnalysisInput): Promise<AnalysisRunDetail> {
    await this.factPreparation.prepare(input.game, input.matchId);
    const facts = this.resolveFacts(input.game, input.matchId);
    if (!isPrematchAnalysisEligible(facts)) {
      throw new Error(
        `Match ${facts.externalMatchId} is not an eligible current pre-match event`,
      );
    }
    const activePolicy = this.policy.getActive();
    if (input.game === 'dota2' || input.game === 'lol' || input.game === 'valorant') {
      try {
        if (input.game === 'dota2') await this.dotaMarketDiscovery.discoverForFacts(facts);
        else if (input.game === 'lol') await this.lolMarketDiscovery.discoverForFacts(facts);
        else await this.valorantMarketDiscovery.discoverForFacts(facts);
      } catch {
        // Public market discovery is optional; an existing synthetic practice market remains valid.
      }
    }
    const storedMarkets = this.resolveStoredMarkets(input.game, facts);
    const requestedStoredMarket = input.market?.marketId
      ? storedMarkets.find((market) => market.marketId === input.market?.marketId)
      : input.market?.kind
        ? storedMarkets.find((market) => market.kind === input.market?.kind)
        : undefined;
    const alignment = this.buildMarketAlignment(input, facts, storedMarkets);
    const eligibility = evaluateGameAnalysisEligibility({
      game: input.game,
      facts,
      marketAlignment: alignment,
      selectedMarketId: input.market?.marketId,
      policy: activePolicy,
    });
    if (eligibility && !eligibility.analysisEligible) {
      const label =
        input.game === 'dota2' ? 'Dota' : input.game === 'lol' ? 'LoL' : 'Valorant';
      throw new AnalysisEligibilityError(
        `${label} analysis blocked: ${eligibility.reasonCodes.join(', ')}`,
        eligibility,
      );
    }
    const storedMarket =
      requestedStoredMarket ??
      (eligibility?.selectedMarket
        ? storedMarkets.find((market) => market.marketId === eligibility.selectedMarket?.marketId)
        : storedMarkets[0]);
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
    const analysisFacts = eligibility
      ? [
          ...facts.facts,
          {
            factId:
              input.game === 'dota2'
                ? 'dota-analysis-eligibility'
                : input.game === 'lol'
                  ? 'lol-analysis-eligibility'
                  : 'valorant-analysis-eligibility',
            entityType: 'quality',
            source: 'polyrader-runtime',
            observedAt: eligibility.checkedAt,
            field: 'analysis_gate',
            value: eligibility,
          },
        ]
      : facts.facts;

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
        line: input.market?.line ?? storedMarket?.line ?? null,
        evidenceType: storedMarket?.evidenceType ?? (input.market ? 'real' : 'synthetic'),
        liquidityStatus:
          storedMarket?.liquidityStatus ??
          ((input.market?.liquidityUsd ?? 0) < activePolicy.lowLiquidityThresholdUsd
            ? 'low'
            : 'normal'),
        outcomes,
        liquidityUsd: input.market?.liquidityUsd ?? storedMarket?.liquidityUsd ?? 0,
        observedAt:
          input.market?.observedAt ?? storedMarket?.observedAt ?? new Date().toISOString(),
      },
      dataSnapshot: {
        dataSnapshotHash: facts.dataSnapshotHash,
        completeness: facts.completeness,
        freshnessSeconds: facts.freshnessSeconds,
        facts: analysisFacts,
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
        ['scheduled', 'upcoming', 'pre_match', 'prematch', 'not_started'].includes(
          facts.status.toLowerCase(),
        ) &&
        Date.parse(facts.startsAt) >= Date.now();
      const settlementRulesAvailable =
        Boolean(findSettlementRule(input.game, kind)?.supported) &&
        isUpcoming &&
        (!eligibility || eligibility.analysisEligible);
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
    const candidates = configs.filter(
      (item) =>
        item.isEnabled &&
        Boolean(item.apiKey) &&
        item.provider !== 'user' &&
        (!requested || item.provider === requested),
    );
    const config = candidates.find((item) => item.isConnected) ?? candidates[0];
    if (!config) {
      throw new Error(
        requested
          ? `LLM provider ${requested} is not configured or enabled`
          : 'No executable LLM provider is configured or enabled',
      );
    }
    return { provider: config.provider, model: config.model };
  }

  private resolveStoredMarkets(game: EsportsGame, facts: NormalizedMatchFacts) {
    const canonicalId =
      game === 'cs2' ? `hltv:${facts.externalMatchId}` : `${game}:${facts.externalMatchId}`;
    const markets = this.markets
      .findByCanonicalMatchId(canonicalId)
      .filter((item) => item.status === 'active' && item.outcomes.length >= 2);
    return markets
      .map((market) => {
        const marketAlignment = alignMarketsForMatch({
          game,
          matchId: facts.externalMatchId,
          markets: [
            {
              marketId: market.conditionId,
              question: market.question,
              line: marketLine(market.question),
              outcomes: market.outcomes.map((label) => ({ label })),
              liquidityUsd: market.liquidity,
              tags: market.tags,
            },
          ],
        });
        const identity = marketAlignment.markets[0];
        if (!identity?.settlementSupported) return undefined;
        const rawPrices = market.outcomePrices.map((value) => Number(value));
        const validPrices =
          rawPrices.length === market.outcomes.length &&
          rawPrices.every((value) => Number.isFinite(value) && value >= 0);
        const total = validPrices ? rawPrices.reduce((sum, value) => sum + value, 0) : 0;
        return {
          marketId: market.conditionId,
          kind: identity.kind as AnalysisMarketKind,
          line: identity.line,
          liquidityUsd: market.liquidity,
          liquidityStatus: identity.liquidityStatus,
          evidenceType: identity.evidenceType,
          observedAt: new Date().toISOString(),
          question: market.question,
          tags: market.tags,
          outcomes: market.outcomes.map((label, index) => {
            const normalizedLabel = normalizeName(label);
            const participant = facts.participants.find((item) =>
              normalizedLabel.includes(normalizeName(item.name)),
            );
            return {
              outcomeId: participant?.participantId ?? `${market.conditionId}:o${index}`,
              label,
              marketProbability: total > 0 ? rawPrices[index] / total : 1 / market.outcomes.length,
            };
          }),
        };
      })
      .filter((market): market is NonNullable<typeof market> => Boolean(market))
      .sort((a, b) => {
        const real = Number(b.evidenceType === 'real') - Number(a.evidenceType === 'real');
        const winner = Number(b.kind === 'match_winner') - Number(a.kind === 'match_winner');
        return real || winner || b.liquidityUsd - a.liquidityUsd;
      });
  }

  private buildMarketAlignment(
    input: ExecuteStandardAnalysisInput,
    facts: NormalizedMatchFacts,
    storedMarkets: ReturnType<StandardAnalysisService['resolveStoredMarkets']>,
  ): MarketAlignmentResult {
    const customMarket =
      input.market &&
      (input.market.outcomes?.length ?? 0) >= 2 &&
      !storedMarkets.some((market) => market.marketId === input.market?.marketId)
        ? [
            {
              marketId: input.market.marketId,
              kind: input.market.kind,
              line: input.market.line,
              outcomes: (input.market.outcomes ?? []).map((outcome) => ({
                outcomeId: outcome.outcomeId,
                label: outcome.label,
              })),
              liquidityUsd: input.market.liquidityUsd,
            },
          ]
        : [];
    return alignMarketsForMatch({
      game: input.game,
      matchId: facts.externalMatchId,
      markets: [
        ...storedMarkets.map((market) => ({
          marketId: market.marketId,
          question: market.question,
          kind: market.kind,
          line: market.line,
          outcomes: market.outcomes.map((outcome) => ({
            outcomeId: outcome.outcomeId,
            label: outcome.label,
          })),
          liquidityUsd: market.liquidityUsd,
          tags: market.tags,
        })),
        ...customMarket,
      ],
    });
  }
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isPrematchAnalysisEligible(facts: NormalizedMatchFacts): boolean {
  const prematchStatuses = ['scheduled', 'upcoming', 'pre_match', 'prematch', 'not_started'];
  const timestamp = Date.parse(facts.startsAt);
  return (
    prematchStatuses.includes(facts.status.toLowerCase()) &&
    Number.isFinite(timestamp) &&
    timestamp >= Date.now() - 15 * 60 * 1000
  );
}

function marketLine(question: string): number | null {
  const kind = classifySettledMarketKind(question);
  if (kind === 'handicap') return extractHandicapLine(question);
  if (kind === 'total_maps') return extractTotalMapsLine(question);
  return null;
}

function evaluateGameAnalysisEligibility(input: {
  game: EsportsGame;
  facts: NormalizedMatchFacts;
  marketAlignment: MarketAlignmentResult;
  selectedMarketId?: string;
  policy: {
    minimumCompleteness: number;
    maximumFreshnessSeconds: number;
    lowLiquidityThresholdUsd: number;
  };
}): AnalysisEligibilityGate | undefined {
  if (input.game === 'dota2') {
    return evaluateDotaAnalysisEligibility({
      facts: input.facts,
      marketAlignment: input.marketAlignment,
      selectedMarketId: input.selectedMarketId,
      policy: input.policy,
    });
  }
  if (input.game === 'lol') {
    return evaluateLolAnalysisEligibility({
      facts: input.facts,
      marketAlignment: input.marketAlignment,
      selectedMarketId: input.selectedMarketId,
      policy: input.policy,
    });
  }
  if (input.game === 'valorant') {
    return evaluateValorantAnalysisEligibility({
      facts: input.facts,
      marketAlignment: input.marketAlignment,
      selectedMarketId: input.selectedMarketId,
      policy: input.policy,
    });
  }
  return undefined;
}
