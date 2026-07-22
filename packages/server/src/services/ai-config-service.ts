import type { AnalysisDataSource, LLMConfig, LLMAnalysisResult, LLMAggregation, ConnectivityResult, LLMProvider, Market, MatchInfo, Team, PromptVariant } from '@polyrader/core';
import { buildAnalysisDataSnapshot, KeyManager, MultiMarketAnalysisEngine, parsePolymarketMatch, PromptEngine, ResultAggregator, selectWeightedVariant, getLLMPricing } from '@polyrader/core';
import type { PromptTemplate } from '@polyrader/core';
import { LLMClientFactory, LLMRepository, MarketRepository, CircuitBreakerLLMClient } from '@polyrader/infra';
import { cacheGet, cacheSet } from '@polyrader/infra';
import { logger } from '../utils/logger';
import { buildFallbackTeam, buildTeamFromDbRow, mapLegacyMatchStatus, parseJsonField } from './match-helpers';
import { MarketService } from './market-service';
import { SourceAlignmentService } from './source-alignment-service';
import { AnalysisV1Bridge } from './analysis-v1-bridge';

export class AiConfigService {
  private llmRepo = new LLMRepository();
  private resultAggregator = new ResultAggregator();
  private keyManager: KeyManager | null = null;
  private circuitBreakers = new Map<string, CircuitBreakerLLMClient>();
  private marketService = new MarketService();
  private marketRepo = new MarketRepository();
  private multiMarketAnalysisEngine = new MultiMarketAnalysisEngine();
  private sourceAlignment = new SourceAlignmentService({ llmRepo: this.llmRepo });
  private analysisV1Bridge = new AnalysisV1Bridge();

  /**
   * Compute provider weights from historical calibration data.
   * Used by ResultAggregator to weight LLM predictions by reliability.
   */
  private getCalibratedWeights(): Record<string, number> | undefined {
    try {
      const stats = this.llmRepo.getAllStats();
      if (stats.length === 0) return undefined;
      return ResultAggregator.computeProviderWeights(stats);
    } catch {
      return undefined;
    }
  }

  private attachAnalysisV1Bridge(
    aggregation: LLMAggregation,
    input: {
      match: MatchInfo;
      teamA: Team;
      teamB: Team;
      marketProbA?: number;
      results: LLMAnalysisResult[];
    },
  ): void {
    const bridged = this.analysisV1Bridge.persistLegacyResults(input);
    this.applyBridgeSummaries(aggregation, bridged);
  }

  private bridgeSingleResult(input: {
    match: MatchInfo;
    teamA: Team;
    teamB: Team;
    marketProbA?: number;
    result: LLMAnalysisResult;
  }): LLMAnalysisResult {
    if (input.result.error) return input.result;
    try {
      const bridged = this.analysisV1Bridge.persistLegacyResults({
        match: input.match,
        teamA: input.teamA,
        teamB: input.teamB,
        marketProbA: input.marketProbA,
        results: [input.result],
      });
      const linked = bridged[0];
      if (!linked) return input.result;
      const next: LLMAnalysisResult = { ...input.result, analysisRunId: linked.runId };
      if (linked.decisionAction === 'paper_bet' || linked.decisionAction === 'pass' || linked.decisionAction === 'rejected') {
        next.paperDecisionAction = linked.decisionAction;
      }
      return next;
    } catch (err) {
      logger.warn('analysis.v1 per-provider bridge failed', {
        provider: input.result.provider,
        error: (err as Error).message,
      });
      return input.result;
    }
  }

  private applyBridgeSummaries(
    aggregation: LLMAggregation,
    bridged: Array<{ provider: string; runId: string; status: string; decisionAction?: string }>,
  ): void {
    if (bridged.length === 0) return;
    aggregation.analysisRuns = [...(aggregation.analysisRuns ?? []), ...bridged];
    const byProvider = new Map(bridged.map((item) => [item.provider, item]));
    for (const result of aggregation.results) {
      const linked = byProvider.get(result.provider);
      if (!linked) continue;
      result.analysisRunId = linked.runId;
      if (linked.decisionAction === 'paper_bet' || linked.decisionAction === 'pass' || linked.decisionAction === 'rejected') {
        result.paperDecisionAction = linked.decisionAction;
      }
    }
    logger.info('Persisted analysis.v1 runs from legacy LLM results', {
      matchId: aggregation.matchId,
      runs: bridged.map((item) => `${item.provider}:${item.runId}:${item.status}:${item.decisionAction ?? '-'}`),
    });
  }

  // In-flight analysis dedup: prevents duplicate LLM calls for the same matchId
  private inflightAnalyses = new Map<string, Promise<LLMAggregation>>();
  /** Stream-specific fan-out so late SSE clients still receive llm_result events. */
  private inflightStreamAnalyses = new Map<string, {
    promise: Promise<LLMAggregation>;
    listeners: Set<(result: LLMAnalysisResult) => void>;
  }>();

  // Global concurrency limiter: max simultaneous LLM calls across all matches
  private static readonly MAX_CONCURRENT_LLM = 4;
  private activeLlmCalls = 0;
  private waitQueue: Array<() => void> = [];

  /**
   * Acquire a concurrency slot. Blocks if MAX_CONCURRENT_LLM is reached.
   */
  private async acquireSlot(): Promise<void> {
    if (this.activeLlmCalls < AiConfigService.MAX_CONCURRENT_LLM) {
      this.activeLlmCalls++;
      return;
    }
    await new Promise<void>((resolve) => {
      this.waitQueue.push(() => {
        this.activeLlmCalls++;
        resolve();
      });
    });
  }

  /** Release a concurrency slot and wake up the next waiter */
  private releaseSlot(): void {
    this.activeLlmCalls--;
    const next = this.waitQueue.shift();
    if (next) next();
  }

  private getKeyManager(): KeyManager {
    if (!this.keyManager) {
      // Tauri sidecar mode: POLYRADER_ENCRYPTION_KEY set by Rust backend
      // Standalone mode: ENCRYPTION_KEY from .env
      const encKey = process.env.POLYRADER_ENCRYPTION_KEY ?? process.env.ENCRYPTION_KEY;
      if (!encKey) {
        throw new Error('Encryption key is required. Set POLYRADER_ENCRYPTION_KEY or ENCRYPTION_KEY.');
      }
      this.keyManager = new KeyManager(encKey);
    }
    return this.keyManager;
  }

  private getClient(provider: LLMProvider, apiKey: string, model: string): CircuitBreakerLLMClient {
    const key = `${provider}:${model}`;
    let wrapped = this.circuitBreakers.get(key);
    if (!wrapped) {
      const inner = LLMClientFactory.create(provider, apiKey, model);
      wrapped = new CircuitBreakerLLMClient(provider, inner);
      this.circuitBreakers.set(key, wrapped);
    }
    return wrapped;
  }

  private async getMarketProbA(matchId: string): Promise<number | undefined> {
    try {
      const market = await this.marketService.getMarket(matchId);
      const raw = market?.outcomePrices?.[0] ? parseFloat(market.outcomePrices[0]) : undefined;
      return raw !== undefined && Number.isFinite(raw) && raw > 0 && raw < 1 ? raw : undefined;
    } catch {
      return undefined;
    }
  }

  async getKeys(): Promise<LLMConfig[]> {
    const configs = await this.llmRepo.getAllConfigs();
    return configs.map((c) => ({
      ...c,
      apiKey: c.apiKey ? this.getKeyManager().maskKey(c.apiKey) : '',
    }));
  }

  async setKey(providerId: string, apiKey: string, model?: string): Promise<void> {
    const provider = providerId as LLMProvider;
    const encrypted = this.getKeyManager().encrypt(apiKey);
    await this.llmRepo.upsertConfig({
      provider,
      model: model ?? this.getDefaultModel(provider),
      apiKey: encrypted,
      isEnabled: true,
      isConnected: false,
      quotaUsed: 0,
      quotaLimit: 1000000,
      costEstimate: 0,
    });
    // Invalidate cached circuit breaker clients so the new API key takes effect
    this.circuitBreakers.clear();
  }

  async testConnection(providerId: string): Promise<ConnectivityResult> {
    const provider = providerId as LLMProvider;
    const config = await this.llmRepo.getConfig(provider);
    if (!config || !config.apiKey) {
      return { provider, success: false, latency: 0, error: 'API Key not configured', testedAt: new Date().toISOString() };
    }

    const startTime = Date.now();
    try {
      const apiKey = this.getKeyManager().decrypt(config.apiKey);
      const client = this.getClient(provider, apiKey, config.model);
      const success = await client.testConnection();
      const latency = Date.now() - startTime;
      await this.llmRepo.upsertConfig({ ...config, isConnected: success, lastTestedAt: new Date().toISOString() });
      return { provider, success, latency, testedAt: new Date().toISOString() };
    } catch (err) {
      return { provider, success: false, latency: Date.now() - startTime, error: (err as Error).message, testedAt: new Date().toISOString() };
    }
  }

  /** Execute an immutable analysis.v1 prompt without the legacy PromptEngine parser. */
  async completeStandardPrompt(input: {
    system: string;
    user: string;
    provider?: string;
  }): Promise<{ provider: LLMProvider; model: string; rawResponse: string; latencyMs: number }> {
    const configs = await this.llmRepo.getAllConfigs();
    const config = configs.find((item) => (
      item.isEnabled
      && Boolean(item.apiKey)
      && item.provider !== 'user'
      && (!input.provider || item.provider === input.provider)
    ));
    if (!config) {
      throw new Error(input.provider
        ? `LLM provider ${input.provider} is not configured or enabled`
        : 'No executable LLM provider is configured or enabled');
    }

    await this.acquireSlot();
    const startedAt = Date.now();
    try {
      const apiKey = this.getKeyManager().decrypt(config.apiKey);
      const client = this.getClient(config.provider, apiKey, config.model);
      const rawResponse = await this.invokeWithTimeout(client.complete({
        system: input.system,
        user: input.user,
      }), 100000);
      return {
        provider: config.provider,
        model: config.model,
        rawResponse,
        latencyMs: Date.now() - startedAt,
      };
    } finally {
      this.releaseSlot();
    }
  }

  async getUsage(): Promise<Array<{ provider: LLMProvider; used: number; limit: number; cost: number }>> {
    const configs = await this.llmRepo.getAllConfigs();
    const result: Array<{ provider: LLMProvider; used: number; limit: number; cost: number }> = [];

    for (const c of configs) {
      if (!c.isEnabled) continue;
      // Refresh quota from aggregated token usage
      try {
        const pricing = getLLMPricing(c.provider);
        this.llmRepo.refreshQuota(c.provider, pricing);
        const refreshed = this.llmRepo.getConfig(c.provider);
        result.push({
          provider: c.provider,
          used: refreshed?.quotaUsed ?? 0,
          limit: c.quotaLimit,
          cost: refreshed?.costEstimate ?? 0,
        });
      } catch {
        result.push({ provider: c.provider, used: c.quotaUsed, limit: c.quotaLimit, cost: c.costEstimate });
      }
    }
    return result;
  }

  /**
   * Select a prompt variant for A/B testing using weighted random selection.
   * Returns null if no enabled variants exist.
   */
  selectVariant(): PromptVariant | null {
    try {
      const variants = this.llmRepo.getEnabledVariants();
      return selectWeightedVariant(variants);
    } catch (err) {
      logger.warn('Failed to select prompt variant', { error: (err as Error).message });
      return null;
    }
  }

  /**
   * Run multi-LLM analysis for a match.
   * Loads real match/team/lineup data from SQLite.
   * Deduplicates concurrent calls for the same matchId.
   */
  async analyze(matchId: string, teamAId: string, teamBId: string, locale?: string): Promise<LLMAggregation> {
    // Dedup: if analysis for this matchId is already in-flight, return the same Promise
    const existing = this.inflightAnalyses.get(matchId);
    if (existing) return existing;

    const promise = this._doAnalyze(matchId, teamAId, teamBId, locale).finally(() => {
      this.inflightAnalyses.delete(matchId);
    });

    this.inflightAnalyses.set(matchId, promise);
    return promise;
  }

  private async _doAnalyze(matchId: string, teamAId: string, teamBId: string, locale?: string): Promise<LLMAggregation> {
    const promptEngine = new PromptEngine(undefined, undefined, { locale });

    // Select prompt variant for A/B testing
    const variant = this.selectVariant();
    const variantId = variant?.variantId;

    const configs = await this.llmRepo.getAllConfigs();
    const enabledConfigs = configs.filter((c) => c.isEnabled && c.apiKey);
    if (enabledConfigs.length === 0) {
      throw new Error('No LLM providers configured');
    }

    const prepared = await this.prepareAnalysisData(matchId, teamAId, teamBId);
    teamAId = prepared.teamAId;
    teamBId = prepared.teamBId;
    const { match, teamAData, teamBData } = prepared;
    const analysisTeamA = teamAData ?? buildFallbackTeam(teamAId, teamAId, 999, 0.5);
    const analysisTeamB = teamBData ?? buildFallbackTeam(teamBId, teamBId, 999, 0.5);

    const prompt = promptEngine.buildPrompt({
      match,
      teamA: analysisTeamA,
      teamB: analysisTeamB,
    });

    // Override prompts when an A/B variant was selected
    if (variant) {
      prompt.system = variant.systemPrompt;
      if (variant.contextTemplate?.trim()) {
        prompt.context = variant.contextTemplate;
      }
      if (variant.outputSchema?.trim()) {
        prompt.outputSchema = variant.outputSchema;
      }
    }

    // Run all LLMs in parallel with circuit breaker + timeout + fallback
    // Concurrency controlled: max MAX_CONCURRENT_LLM simultaneous calls
    const results = await Promise.allSettled(
      enabledConfigs.map(async (config) => {
        await this.acquireSlot();
        try {
          const apiKey = this.getKeyManager().decrypt(config.apiKey);
          const client = this.getClient(config.provider, apiKey, config.model);
          return this.invokeWithRetry(client, prompt, config.provider);
        } finally {
          this.releaseSlot();
        }
      }),
    );

    const analysisResults: LLMAnalysisResult[] = results.map((r, i) => {
      if (r.status === 'fulfilled') return { ...r.value, variantId };
      return {
        provider: enabledConfigs[i].provider,
        model: enabledConfigs[i].model,
        winProbability: { teamA: 0.5, teamB: 0.5 },
        confidence: 0, reasoning: '', keyFactors: [], riskAssessment: '',
        latency: 0, tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        error: (r.reason as Error)?.message ?? 'Unknown error',
        variantId,
      };
    });

    const providerWeights = this.getCalibratedWeights();
    const marketProbA = await this.getMarketProbA(matchId);
    const aggregation = this.resultAggregator.aggregate(matchId, analysisResults, providerWeights, marketProbA);
    aggregation.variantId = variantId;
    aggregation.analysisData = buildAnalysisDataSnapshot(match, analysisTeamA, analysisTeamB, {
      source: prepared.source,
      sourceUpdatedAt: prepared.sourceUpdatedAt,
    });
    this.attachMarketAnalyses(aggregation, match);

    // Persist analysis results to DB
    try {
      // Ensure teams + match rows exist (FK targets for llm_analyses).
      // HLTV may not have upserted them yet (e.g. 403 or manual analysis trigger).
      const existingMatch = this.llmRepo.getMatch(matchId);
      if (!existingMatch) {
        this.llmRepo.upsertTeam({
          teamId: teamAId, name: teamAData?.name ?? teamAId,
          rank: teamAData?.rank ?? 0, region: teamAData?.region ?? '',
          players: JSON.stringify(teamAData?.players ?? []),
          recentForm: JSON.stringify(teamAData?.recentForm ?? {}),
          mapPool: JSON.stringify(teamAData?.mapPool ?? {}),
        });
        this.llmRepo.upsertTeam({
          teamId: teamBId, name: teamBData?.name ?? teamBId,
          rank: teamBData?.rank ?? 0, region: teamBData?.region ?? '',
          players: JSON.stringify(teamBData?.players ?? []),
          recentForm: JSON.stringify(teamBData?.recentForm ?? {}),
          mapPool: JSON.stringify(teamBData?.mapPool ?? {}),
        });
        this.llmRepo.upsertMatch({
          matchId,
          teamAId,
          teamBId,
          teamAName: teamAData?.name ?? teamAId,
          teamBName: teamBData?.name ?? teamBId,
          eventName: match.eventName,
          eventType: match.eventType,
          format: match.format,
          scheduledAt: match.scheduledAt,
          status: 'scheduled',
          maps: [],
          hasTeamData: !!(teamAData && teamBData),
        });
      }
      for (const result of analysisResults) {
        this.llmRepo.insertAnalysis(matchId, result, variantId);
      }
      // Bridge successful provider outputs into analysis.v1 runs (strict schema + paper decision).
      try {
        this.attachAnalysisV1Bridge(aggregation, {
          match,
          teamA: analysisTeamA,
          teamB: analysisTeamB,
          marketProbA: marketProbA ?? undefined,
          results: analysisResults,
        });
      } catch (bridgeErr) {
        logger.warn('analysis.v1 bridge failed', { error: (bridgeErr as Error).message });
      }
      // Refresh quota/cost for each provider that participated
      for (const result of analysisResults) {
        if (!result.error && result.tokenUsage.totalTokens > 0) {
          const pricing = getLLMPricing(result.provider);
          this.llmRepo.refreshQuota(result.provider, pricing);
        }
      }
    } catch (err) {
      logger.warn('Failed to persist analysis results', { error: (err as Error).message });
    }

    // Cache result
    await cacheSet(`analysis:${matchId}`, aggregation, 600);

    return aggregation;
  }

  /**
   * Run multi-LLM analysis with streaming progress.
   * Calls onProgress as each LLM completes, then returns the full aggregation.
   */
  async analyzeWithProgress(
    matchId: string,
    teamAId: string,
    teamBId: string,
    onProgress: (result: LLMAnalysisResult) => void,
    locale?: string,
  ): Promise<LLMAggregation> {
    const existing = this.inflightStreamAnalyses.get(matchId);
    if (existing) {
      existing.listeners.add(onProgress);
      try {
        return await existing.promise;
      } finally {
        existing.listeners.delete(onProgress);
      }
    }

    const listeners = new Set<(result: LLMAnalysisResult) => void>([onProgress]);
    const broadcast = (result: LLMAnalysisResult) => {
      for (const listener of [...listeners]) {
        try {
          listener(result);
        } catch {
          // Listener failures must not break the shared analysis.
        }
      }
    };

    const promise = this._doAnalyzeWithProgress(matchId, teamAId, teamBId, broadcast, locale).finally(() => {
      this.inflightStreamAnalyses.delete(matchId);
    });
    this.inflightStreamAnalyses.set(matchId, { promise, listeners });
    return promise;
  }

  private async _doAnalyzeWithProgress(
    matchId: string,
    teamAId: string,
    teamBId: string,
    onProgress: (result: LLMAnalysisResult) => void,
    locale?: string,
  ): Promise<LLMAggregation> {
    const promptEngine = new PromptEngine(undefined, undefined, { locale });

    // Select prompt variant for A/B testing
    const variant = this.selectVariant();
    const variantId = variant?.variantId;

    const configs = await this.llmRepo.getAllConfigs();
    const enabledConfigs = configs.filter((c) => c.isEnabled && c.apiKey);
    if (enabledConfigs.length === 0) {
      throw new Error('No LLM providers configured');
    }

    const prepared = await this.prepareAnalysisData(matchId, teamAId, teamBId);
    teamAId = prepared.teamAId;
    teamBId = prepared.teamBId;
    const { match, teamAData, teamBData } = prepared;
    const analysisTeamA = teamAData ?? buildFallbackTeam(teamAId, teamAId, 999, 0.5);
    const analysisTeamB = teamBData ?? buildFallbackTeam(teamBId, teamBId, 999, 0.5);

    const prompt = promptEngine.buildPrompt({
      match,
      teamA: analysisTeamA,
      teamB: analysisTeamB,
    });

    // Override prompts when an A/B variant was selected
    if (variant) {
      prompt.system = variant.systemPrompt;
      if (variant.contextTemplate?.trim()) {
        prompt.context = variant.contextTemplate;
      }
      if (variant.outputSchema?.trim()) {
        prompt.outputSchema = variant.outputSchema;
      }
    }

    // Kick off market probability fetch in parallel with LLM calls.
    const marketProbPromise = this.getMarketProbA(matchId);

    // Run all LLMs in parallel — bridge + onProgress as each one resolves
    const results = await Promise.all(
      enabledConfigs.map(async (config) => {
        await this.acquireSlot();
        try {
          const apiKey = this.getKeyManager().decrypt(config.apiKey);
          const client = this.getClient(config.provider, apiKey, config.model);
          const result = await this.invokeWithRetry(client, prompt, config.provider);
          const marketProbA = await marketProbPromise;
          let tagged: LLMAnalysisResult = { ...result, variantId };
          tagged = this.bridgeSingleResult({
            match,
            teamA: analysisTeamA,
            teamB: analysisTeamB,
            marketProbA: marketProbA ?? undefined,
            result: tagged,
          });
          onProgress(tagged);
          return tagged;
        } catch (err) {
          const errorResult: LLMAnalysisResult = {
            provider: config.provider,
            model: config.model,
            winProbability: { teamA: 0.5, teamB: 0.5 },
            confidence: 0, reasoning: '', keyFactors: [], riskAssessment: '',
            latency: 0, tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            error: (err as Error)?.message ?? 'Unknown error',
            variantId,
          };
          onProgress(errorResult);
          return errorResult;
        } finally {
          this.releaseSlot();
        }
      }),
    );

    const marketProbA = await marketProbPromise;

    const providerWeights2 = this.getCalibratedWeights();
    const aggregation = this.resultAggregator.aggregate(matchId, results, providerWeights2, marketProbA);
    aggregation.variantId = variantId;
    aggregation.analysisData = buildAnalysisDataSnapshot(match, analysisTeamA, analysisTeamB, {
      source: prepared.source,
      sourceUpdatedAt: prepared.sourceUpdatedAt,
    });
    this.attachMarketAnalyses(aggregation, match);
    aggregation.analysisRuns = results
      .filter((r) => r.analysisRunId)
      .map((r) => ({
        provider: r.provider,
        runId: r.analysisRunId!,
        status: 'decision_ready',
        decisionAction: r.paperDecisionAction,
      }));

    // Persist analysis results to DB
    try {
      // Ensure teams + match rows exist (FK targets for llm_analyses).
      const existingMatch = this.llmRepo.getMatch(matchId);
      if (!existingMatch) {
        this.llmRepo.upsertTeam({
          teamId: teamAId, name: teamAData?.name ?? teamAId,
          rank: teamAData?.rank ?? 0, region: teamAData?.region ?? '',
          players: JSON.stringify(teamAData?.players ?? []),
          recentForm: JSON.stringify(teamAData?.recentForm ?? {}),
          mapPool: JSON.stringify(teamAData?.mapPool ?? {}),
        });
        this.llmRepo.upsertTeam({
          teamId: teamBId, name: teamBData?.name ?? teamBId,
          rank: teamBData?.rank ?? 0, region: teamBData?.region ?? '',
          players: JSON.stringify(teamBData?.players ?? []),
          recentForm: JSON.stringify(teamBData?.recentForm ?? {}),
          mapPool: JSON.stringify(teamBData?.mapPool ?? {}),
        });
        this.llmRepo.upsertMatch({
          matchId,
          teamAId,
          teamBId,
          teamAName: teamAData?.name ?? teamAId,
          teamBName: teamBData?.name ?? teamBId,
          eventName: match.eventName,
          eventType: match.eventType,
          format: match.format,
          scheduledAt: match.scheduledAt,
          status: 'scheduled',
          maps: [],
          hasTeamData: !!(teamAData && teamBData),
        });
      }
      for (const result of results) {
        this.llmRepo.insertAnalysis(matchId, result, variantId);
      }
      // Refresh quota/cost for each provider that participated
      for (const result of results) {
        if (!result.error && result.tokenUsage.totalTokens > 0) {
          const pricing = getLLMPricing(result.provider);
          this.llmRepo.refreshQuota(result.provider, pricing);
        }
      }
    } catch (err) {
      logger.warn('Failed to persist analysis results', { error: (err as Error).message });
    }

    await cacheSet(`analysis:${matchId}`, aggregation, 600);
    return aggregation;
  }

  async getAnalysis(analysisId: string): Promise<LLMAggregation | null> {
    return cacheGet<LLMAggregation>(`analysis:${analysisId}`);
  }

  private async prepareAnalysisData(
    matchId: string,
    requestedTeamAId: string,
    requestedTeamBId: string,
  ): Promise<{
    match: MatchInfo;
    teamAId: string;
    teamBId: string;
    teamAData: Team | null;
    teamBData: Team | null;
    source: AnalysisDataSource;
    sourceUpdatedAt?: string;
  }> {
    let matchData = this.llmRepo.getMatch(matchId);
    let teamAId = matchData?.team_a_id ? String(matchData.team_a_id) : requestedTeamAId;
    let teamBId = matchData?.team_b_id ? String(matchData.team_b_id) : requestedTeamBId;
    let teamAData = await this.loadTeamData(teamAId);
    let teamBData = await this.loadTeamData(teamBId);

    if (matchData?.hltv_match_id && this.needsHltvEnrichment(
      matchData,
      teamAData,
      teamBData,
      this.llmRepo.getTeam(teamAId),
      this.llmRepo.getTeam(teamBId),
    )) {
      const enrichment = await this.sourceAlignment.enrichHltvMatchForAnalysis(matchData);
      if (enrichment.refreshed) {
        logger.info('HLTV analysis data refreshed', { ...enrichment });
        matchData = this.llmRepo.getMatch(matchId);
        teamAId = matchData?.team_a_id ? String(matchData.team_a_id) : enrichment.teamAId ?? teamAId;
        teamBId = matchData?.team_b_id ? String(matchData.team_b_id) : enrichment.teamBId ?? teamBId;
        teamAData = await this.loadTeamData(teamAId);
        teamBData = await this.loadTeamData(teamBId);
      } else {
        logger.warn('HLTV analysis data remained incomplete', {
          matchId,
          hltvMatchId: String(matchData.hltv_match_id),
          message: enrichment.message,
        });
      }
    }

    const matchStatus = matchData ? String(matchData.status ?? 'scheduled') : 'scheduled';
    const scheduledAt = matchData ? String(matchData.scheduled_at ?? '') : '';
    if (!['scheduled', 'upcoming', 'pre_match'].includes(matchStatus)) {
      throw new Error(`Refused to analyze match ${matchId}: status is "${matchStatus}", only upcoming matches can be analyzed`);
    }
    if (scheduledAt && new Date(scheduledAt).getTime() < Date.now()) {
      throw new Error(`Refused to analyze match ${matchId}: scheduled time ${scheduledAt} is in the past`);
    }

    const mappedStatus = mapLegacyMatchStatus(matchStatus, scheduledAt || new Date().toISOString());
    const match: MatchInfo = {
      matchId,
      canonicalMatchId: matchData?.canonical_match_id ? String(matchData.canonical_match_id) : undefined,
      teamA: { teamId: teamAId, name: teamAData?.name ?? teamAId, logo: '', rank: teamAData?.rank ?? 999, region: teamAData?.region ?? '' },
      teamB: { teamId: teamBId, name: teamBData?.name ?? teamBId, logo: '', rank: teamBData?.rank ?? 999, region: teamBData?.region ?? '' },
      eventName: matchData ? String(matchData.event_name ?? 'Unknown Event') : 'Unknown Event',
      eventType: matchData ? (String(matchData.event_type ?? 'Online') as 'LAN' | 'Online') : 'Online',
      format: matchData ? (String(matchData.format ?? 'BO3') as 'BO1' | 'BO3' | 'BO5') : 'BO3',
      scheduledAt: scheduledAt || new Date().toISOString(),
      status: mappedStatus,
      maps: (parseJsonField(matchData?.maps) as string[]) ?? [],
      lineups: parseJsonField(matchData?.lineups) as MatchInfo['lineups'],
    };
    const teamARow = this.llmRepo.getTeam(teamAId);
    const teamBRow = this.llmRepo.getTeam(teamBId);
    return {
      match,
      teamAId,
      teamBId,
      teamAData,
      teamBData,
      source: !teamAData || !teamBData ? 'fallback' : matchData?.hltv_match_id ? 'hltv' : 'database',
      sourceUpdatedAt: latestTimestamp(teamARow?.updated_at, teamBRow?.updated_at, matchData?.updated_at),
    };
  }

  private attachMarketAnalyses(aggregation: LLMAggregation, match: MatchInfo): void {
    try {
      const relatedMarkets = this.findRelatedMarkets(aggregation.matchId, match);
      if (relatedMarkets.length === 0) return;

      const validResults = aggregation.results.filter((result) => !result.error && result.confidence > 0);
      const modelConfidence = validResults.length > 0
        ? validResults.reduce((sum, result) => sum + result.confidence, 0) / validResults.length
        : 0.5;
      const dataCompleteness = aggregation.analysisData?.completeness ?? 0.5;

      aggregation.marketAnalyses = this.multiMarketAnalysisEngine.analyze({
        markets: relatedMarkets,
        teamAName: match.teamA.name,
        teamBName: match.teamB.name,
        format: match.format,
        seriesWinProbabilityA: aggregation.aggregatedProbability.teamA,
        baseConfidence: modelConfidence * (0.6 + dataCompleteness * 0.4),
      });
    } catch (err) {
      logger.warn('Failed to derive multi-market analysis', {
        matchId: aggregation.matchId,
        error: (err as Error).message,
      });
    }
  }

  private findRelatedMarkets(matchId: string, match: MatchInfo): Market[] {
    const direct = [
      this.marketRepo.findByConditionId(matchId),
      this.marketRepo.findBySlug(matchId),
    ].filter((market): market is Market => market !== null);
    const canonicalMatchIds = new Set(
      [match.canonicalMatchId, ...direct.map((market) => market.canonicalMatchId)].filter(
        (value): value is string => Boolean(value),
      ),
    );
    const related = [
      ...direct,
      ...[...canonicalMatchIds].flatMap((canonicalMatchId) => this.marketRepo.findByCanonicalMatchId(canonicalMatchId)),
    ];

    if (related.length < 2) {
      related.push(...this.marketRepo.findAll(500, 0).filter((market) => this.marketMatchesTeams(market, match)));
    }

    return [...new Map(related
      .filter((market) => market.status === 'active')
      .map((market) => [market.conditionId, market])).values()];
  }

  private marketMatchesTeams(market: Market, match: MatchInfo): boolean {
    if (market.match) {
      return sameTeamPair(
        market.match.teamA.name,
        market.match.teamB.name,
        match.teamA.name,
        match.teamB.name,
      );
    }
    const parsed = parsePolymarketMatch(market.question);
    return parsed !== null && sameTeamPair(
      parsed.teamAName,
      parsed.teamBName,
      match.teamA.name,
      match.teamB.name,
    );
  }

  private needsHltvEnrichment(
    matchData: Record<string, unknown>,
    teamA: Team | null,
    teamB: Team | null,
    teamARow: Record<string, unknown> | null,
    teamBRow: Record<string, unknown> | null,
  ): boolean {
    const lineups = parseJsonField(matchData.lineups) as MatchInfo['lineups'];
    const completeTeam = (team: Team | null): boolean => !!team
      && team.rank > 0
      && team.rank < 999
      && team.players.length >= 5
      && team.recentForm?.last10Matches?.length > 0
      && team.mapPool?.maps?.length > 0;
    const completeLineups = !!lineups
      && lineups.teamA.players.length >= 5
      && lineups.teamB.players.length >= 5;
    const ttlHours = envNumber('POLYRADER_HLTV_TEAM_TTL_HOURS', 6, 1, 168);
    const teamsFresh = isFreshTimestamp(teamARow?.updated_at, ttlHours)
      && isFreshTimestamp(teamBRow?.updated_at, ttlHours);
    return !completeTeam(teamA) || !completeTeam(teamB) || !completeLineups || !teamsFresh;
  }

  /**
   * Race a promise against a timeout, always clearing the timer to avoid leaks.
   */
  private async invokeWithTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId!);
    }
  }

  /**
   * Invoke LLM with retry and timeout.
   * Strategy: 2 retries, exponential backoff (1s, 2s), 30s timeout per attempt.
   */
  private async invokeWithRetry(
    client: CircuitBreakerLLMClient,
    prompt: PromptTemplate,
    provider: string,
  ): Promise<LLMAnalysisResult> {
    const maxRetries = 2;
    const timeout = 100000;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.invokeWithTimeout(client.analyze(prompt), timeout);
        return result;
      } catch (err) {
        lastError = err as Error;
        logger.warn(`[LLM] ${provider} attempt ${attempt + 1}/${maxRetries + 1} failed: ${lastError.message}`);

        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    return {
      provider: provider as LLMProvider,
      model: 'unknown',
      winProbability: { teamA: 0.5, teamB: 0.5 },
      confidence: 0,
      reasoning: '',
      keyFactors: [],
      riskAssessment: '',
      latency: 0,
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      error: lastError?.message ?? 'All retries exhausted',
    };
  }

  private async loadTeamData(teamId: string): Promise<Team | null> {
    try {
      const teamRow = this.llmRepo.getTeam(teamId);
      if (!teamRow) return null;
      return buildTeamFromDbRow(teamRow, teamId);
    } catch (err) {
      logger.warn('Failed to load team data from DB', { error: (err as Error).message });
      return null;
    }
  }

  private getDefaultModel(provider: LLMProvider): string {
    const defaults: Record<LLMProvider, string> = {
      openai: 'gpt-4o', anthropic: 'claude-3-5-sonnet-20241022',
      google: 'gemini-2.0-flash', deepseek: 'deepseek-chat',
      xai: 'grok-2', groq: 'llama-3.3-70b-versatile',
      qwen: 'qwen-max', moonshot: 'moonshot-v1-128k',
      zhipu: 'glm-4-plus', doubao: 'doubao-seed-2.0-pro',
      minimax: 'abab6.5s-chat', hunyuan: 'hunyuan-large',
      user: 'manual',
    };
    return defaults[provider];
  }
}

function sameTeamPair(leftA: string, leftB: string, rightA: string, rightB: string): boolean {
  const left = [normalizeTeamName(leftA), normalizeTeamName(leftB)].sort();
  const right = [normalizeTeamName(rightA), normalizeTeamName(rightB)].sort();
  return left[0] === right[0] && left[1] === right[1];
}

function normalizeTeamName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function envNumber(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function isFreshTimestamp(value: unknown, ttlHours: number): boolean {
  if (!value) return false;
  const timestamp = parseDatabaseTimestamp(String(value));
  return Number.isFinite(timestamp) && Date.now() - timestamp <= ttlHours * 60 * 60 * 1000;
}

function latestTimestamp(...values: unknown[]): string | undefined {
  const timestamps = values
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map((value) => ({ value, timestamp: parseDatabaseTimestamp(value) }))
    .filter((item) => Number.isFinite(item.timestamp))
    .sort((a, b) => b.timestamp - a.timestamp);
  return timestamps[0]?.value;
}

function parseDatabaseTimestamp(value: string): number {
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  return Date.parse(normalized);
}
