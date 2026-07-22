import type { DailyDashboard, DeviationAlert, Market, MatchInfo } from '@polyrader/core';
import { DailyDashboardEngine, PredictionEngine, buildCanonicalMatchId, parsePolymarketMatch } from '@polyrader/core';
import { HLTVCrawler, LLMRepository, MarketRepository, WalletFollowRepository, cacheDelete, cacheGet, cacheSet } from '@polyrader/infra';
import { LLMClientFactory, CircuitBreakerLLMClient } from '@polyrader/infra';
import { KeyManager } from '@polyrader/core';
import type { LLMProvider } from '@polyrader/core';
import { MarketService } from './market-service';
import { WhaleService } from './whale-service';
import { buildMatchInfo, buildFallbackMatchInfo, loadTeamFromDb, buildFallbackTeam } from './match-helpers';
import { getLocalSeedMarkets } from './local-seed-data';
import { isOpenMarket } from './market-eligibility';
import { logger } from '../utils/logger';
import { envNumber, withTimeout } from '../utils/timeout';
import { SourceAlignmentService } from './source-alignment-service';
import { estimateLocalOdds } from './local-odds';
import { buildLocalMapWinnerMarkets, buildLocalSimulationMarket } from './local-simulation-market';

interface LightweightLLMResult {
  prob: number;
  provider: string;
}

export class DailyService {
  private engine = new DailyDashboardEngine();
  private predictionEngine = new PredictionEngine();
  private marketService = new MarketService();
  private llmRepo = new LLMRepository();
  private marketRepo = new MarketRepository();
  private hltvCrawler = new HLTVCrawler();
  private sourceAlignment = new SourceAlignmentService({ llmRepo: this.llmRepo, hltv: this.hltvCrawler });
  private whaleService = new WhaleService();
  private walletFollowRepo = new WalletFollowRepository();
  private keyManager: KeyManager | null = null;
  private circuitBreakers = new Map<string, CircuitBreakerLLMClient>();

  async getDashboard(): Promise<DailyDashboard> {
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `daily:${today}`;
    const cached = await cacheGet<DailyDashboard>(cacheKey);
    if (cached) return cached;

    return this.refreshDashboard();
  }

  async refreshDashboard(): Promise<DailyDashboard> {
    const today = new Date().toISOString().split('T')[0];

    try {
      const markets = await this.marketService.getMarkets(100, 0);
      const upcomingMatches = this.llmRepo.getUpcomingMatches(100);
      const matchMarkets = await this.buildDailyMarkets(markets, upcomingMatches, today);
      const matchMap = new Map<string, Record<string, unknown>>();
      for (const m of upcomingMatches) {
        matchMap.set(String(m.match_id ?? ''), m);
      }

      // Pre-fetch lightweight LLM predictions for all matches in parallel
      const llmPredictions = await this.batchLightweightPredictions(matchMarkets, upcomingMatches);

      const deviations = await Promise.all(
        matchMarkets.map(async (m) => {
          const rawProb = parseFloat(m.outcomePrices[0] ?? '0.5');
          const polymarketProb = Number.isNaN(rawProb) ? 0.5 : rawProb;

          const dbMatch = this.findDbMatchForMarket(m, upcomingMatches, matchMap);
          const matchInfo = this.matchInfoForPrediction(m, dbMatch);

          const teamA = m.match
            ? buildFallbackTeam(m.match.teamA.teamId, m.match.teamA.name, m.match.teamA.rank, this.winRateFromRank(m.match.teamA.rank))
            : dbMatch
            ? loadTeamFromDb(String(dbMatch.team_a_id ?? ''))
            : buildFallbackTeam('team-a', 'Team A', 10, 0.6);
          const teamB = m.match
            ? buildFallbackTeam(m.match.teamB.teamId, m.match.teamB.name, m.match.teamB.rank, this.winRateFromRank(m.match.teamB.rank))
            : dbMatch
            ? loadTeamFromDb(String(dbMatch.team_b_id ?? ''))
            : buildFallbackTeam('team-b', 'Team B', 20, 0.5);

          const prediction = this.predictionEngine.predict(
            matchInfo,
            teamA,
            teamB,
            polymarketProb,
          );

          const deviation = prediction.winProbability.teamA - polymarketProb;

          // Use LLM prediction if available, otherwise fall back to rule-based
          const llmResult = llmPredictions.get(m.conditionId);
          const alert: DeviationAlert = {
            marketId: m.conditionId,
            question: m.question,
            polymarketProb,
            predictedProb: prediction.winProbability.teamA,
            deviation,
            direction: deviation > 0 ? ('undervalued' as const) : ('overvalued' as const),
          };
          if (llmResult) {
            alert.llmProb = llmResult.prob;
          }

          return alert;
        }),
      );

      const whaleAlerts: Array<{ address: string; marketId: string; action: string; amount: number; timestamp: string; suspiciousScore: number }> = [];
      try {
        const whales = await this.whaleService.getWhales({ limit: 20 });
        for (const whale of whales) {
          for (const trade of whale.recentTrades.slice(0, 3)) {
            if (trade.amount >= 1000) {
              whaleAlerts.push({
                address: whale.address,
                marketId: trade.marketId,
                action: trade.type === 'buy' ? 'buy' : 'sell',
                amount: trade.amount,
                timestamp: trade.timestamp,
                suspiciousScore: whale.suspiciousScore.total,
              });
            }
          }
        }
      } catch {
        // whale service unavailable, continue with empty alerts
      }

      try {
        for (const signal of this.walletFollowRepo.listRecentFollowedSignals(8)) {
          whaleAlerts.push({
            address: signal.leaderAddress,
            marketId: signal.conditionId ?? signal.tokenId,
            action: 'followed_buy',
            amount: signal.leaderAmount,
            timestamp: signal.createdAt,
            suspiciousScore: Math.round((signal.leaderWinRate ?? 0.5) * 100),
          });
        }
      } catch {
        // followed copy signals optional
      }

      const dashboard = this.engine.generateDashboard(today, matchMarkets, deviations, whaleAlerts);
      await cacheSet(`daily:${today}`, dashboard, 300);
      return dashboard;
    } catch (err) {
      logger.warn('Failed to generate daily dashboard', { error: (err as Error).message });
      return this.engine.generateDashboard(today, [], [], []);
    }
  }

  private async buildDailyMarkets(
    markets: Market[],
    upcomingMatches: Array<Record<string, unknown>>,
    today: string,
  ): Promise<Market[]> {
    const matchMap = new Map<string, Record<string, unknown>>();
    for (const m of upcomingMatches) {
      matchMap.set(String(m.match_id ?? ''), m);
    }

    const liveMarkets = markets
      .filter((market) => isOpenMarket(market))
      .map((market) => this.withMatchInfo(market, upcomingMatches, matchMap, today))
      .filter((market): market is Market => market.match !== undefined);

    if (liveMarkets.length > 0) {
      this.persistDailyMarkets(liveMarkets);
      return liveMarkets;
    }

    const dbMarkets = this.buildMarketsFromDbMatches(upcomingMatches, today)
      .map((market) => this.repriceLocalMarket(this.hydrateMarketMatch(market)));
    if (dbMarkets.length > 0) {
      this.persistDailyMarkets(dbMarkets);
      return dbMarkets;
    }

    const hltvMarkets = await this.buildMarketsFromHltv(today);
    if (hltvMarkets.length > 0) {
      return hltvMarkets;
    }

    const seedMarkets = this.buildTodaySeedMarkets(today);
    this.persistDailyMarkets(seedMarkets);
    return seedMarkets;
  }

  private withMatchInfo(
    market: Market,
    upcomingMatches: Array<Record<string, unknown>>,
    matchMap: Map<string, Record<string, unknown>>,
    today: string,
  ): Market {
    if (market.match) {
      const canonicalMatchId = market.canonicalMatchId ?? market.match.canonicalMatchId ?? buildCanonicalMatchId({
        teamAId: market.match.teamA.teamId,
        teamBId: market.match.teamB.teamId,
        teamAName: market.match.teamA.name,
        teamBName: market.match.teamB.name,
        eventName: market.match.eventName,
        scheduledAt: market.match.scheduledAt,
      });
      return { ...market, canonicalMatchId, match: { ...market.match, canonicalMatchId } };
    }

    const dbMatch = this.findDbMatchForMarket(market, upcomingMatches, matchMap);
    if (dbMatch) {
      return { ...market, match: buildMatchInfo(dbMatch) };
    }

    const parsed = parsePolymarketMatch(market.question);
    if (!parsed) return market;

    const scheduledAt = this.normalizeScheduledAt(market.startDate || market.endDate, today, 0);
    const match: MatchInfo = {
      matchId: market.conditionId,
      teamA: {
        teamId: this.localTeamId(parsed.teamAName, 'a'),
        name: parsed.teamAName,
        logo: '',
        rank: 50,
        region: '',
      },
      teamB: {
        teamId: this.localTeamId(parsed.teamBName, 'b'),
        name: parsed.teamBName,
        logo: '',
        rank: 55,
        region: '',
      },
      eventName: parsed.eventName,
      eventType: 'Online',
      format: parsed.format ?? 'BO3',
      scheduledAt,
      status: 'scheduled',
      maps: [],
    };
    const canonicalMatchId = buildCanonicalMatchId({
      teamAName: parsed.teamAName,
      teamBName: parsed.teamBName,
      eventName: parsed.eventName,
      scheduledAt,
    });
    return { ...market, canonicalMatchId, match: { ...match, canonicalMatchId } };
  }

  private findDbMatchForMarket(
    market: Market,
    upcomingMatches: Array<Record<string, unknown>>,
    matchMap: Map<string, Record<string, unknown>>,
  ): Record<string, unknown> | undefined {
    const direct = matchMap.get(market.conditionId);
    if (direct) return direct;

    const question = (market.question ?? '').toLowerCase();
    return upcomingMatches.find((um) => {
      const nameA = String(um.team_a_name ?? '').toLowerCase();
      const nameB = String(um.team_b_name ?? '').toLowerCase();
      return nameA && nameB && question.includes(nameA) && question.includes(nameB);
    });
  }

  private matchInfoForPrediction(market: Market, dbMatch?: Record<string, unknown>): MatchInfo {
    if (market.match) return market.match;
    if (dbMatch) return buildMatchInfo(dbMatch);
    return buildFallbackMatchInfo(market.conditionId);
  }

  private buildMarketsFromDbMatches(upcomingMatches: Array<Record<string, unknown>>, today: string): Market[] {
    return upcomingMatches
      .filter((match) => this.isDashboardDate(String(match.scheduled_at ?? ''), today))
      .slice(0, 12)
      .map((match, index) => this.buildSimulationMarket({
        source: 'db',
        matchId: String(match.match_id ?? `db-${today}-${index}`),
        teamAName: String(match.team_a_name ?? 'Team A'),
        teamBName: String(match.team_b_name ?? 'Team B'),
        teamAId: String(match.team_a_id ?? ''),
        teamBId: String(match.team_b_id ?? ''),
        eventName: String(match.event_name ?? 'Local Schedule'),
        eventType: String(match.event_type ?? 'Online') === 'LAN' ? 'LAN' : 'Online',
        format: this.normalizeFormat(String(match.format ?? 'BO3')),
        scheduledAt: this.normalizeScheduledAt(String(match.scheduled_at ?? ''), today, index),
        today,
        index,
        hltvMatchId: String(match.hltv_match_id ?? ''),
      }));
  }

  private async buildMarketsFromHltv(today: string): Promise<Market[]> {
    try {
      const matches = await withTimeout(
        this.hltvCrawler.getMatches(),
        dailySourceTimeoutMs(),
        'hltv daily matches',
      );
      const markets = matches
        .filter((match) => match.teamAName && match.teamBName)
        .slice(0, 12)
        .map((match, index) => this.buildSimulationMarket({
          source: 'hltv',
          matchId: match.matchId,
          teamAName: match.teamAName,
          teamBName: match.teamBName,
          teamAId: match.teamAId,
          teamBId: match.teamBId,
          eventName: match.event || 'HLTV Upcoming',
          eventType: match.eventType === 'LAN' ? 'LAN' : 'Online',
          format: this.normalizeFormat(match.format),
          scheduledAt: this.normalizeScheduledAt(match.date, today, index),
          today,
          index,
          hltvMatchId: match.matchId,
        }));
      this.persistDailyMarkets(markets);

      try {
        const sync = await withTimeout(
          this.sourceAlignment.syncDiscoveredHltvMatches(matches),
          envNumber('POLYRADER_HLTV_DISCOVERY_TIMEOUT_MS', 120_000, 10_000, 300_000),
          'HLTV discovery enrichment',
        );
        logger.info('Proactive HLTV discovery enrichment completed', {
          discovered: sync.discovered,
          enriched: sync.enriched,
          lineupRefreshed: sync.lineupRefreshed,
          reused: sync.reused,
          failed: sync.failed,
        });
      } catch (err) {
        logger.warn('Proactive HLTV discovery enrichment did not complete', { error: (err as Error).message });
      }

      const hydrated = markets.map((market) => this.repriceLocalMarket(this.hydrateMarketMatch(market)));
      for (const market of hydrated) {
        this.marketRepo.upsert(market);
        const price = Number(market.outcomePrices[0] ?? 0.5);
        if (Number.isFinite(price)) this.marketRepo.insertPriceHistoryIfChanged(market.conditionId, price);
      }
      await Promise.all([
        cacheDelete('markets:50:0'),
        cacheDelete('markets:100:0'),
      ]);
      return hydrated;
    } catch (err) {
      logger.warn('Failed to build daily HLTV simulation markets', { error: (err as Error).message });
      return [];
    }
  }

  private hydrateMarketMatch(market: Market): Market {
    const row = this.llmRepo.getMatch(market.conditionId);
    if (!row) return market;
    const teamARow = this.llmRepo.getTeam(String(row.team_a_id ?? ''));
    const teamBRow = this.llmRepo.getTeam(String(row.team_b_id ?? ''));
    return { ...market, match: buildMatchInfo(row, teamARow, teamBRow) };
  }

  private buildTodaySeedMarkets(today: string): Market[] {
    return getLocalSeedMarkets(6, 0).slice(0, 3).map((market, index) => {
      const conditionId = `daily-${today}-${market.conditionId}`;
      const scheduledAt = this.todaySlotIso(today, index);
      const endDate = this.addHours(scheduledAt, 4);
      return {
        ...market,
        conditionId,
        canonicalMatchId: market.match ? buildCanonicalMatchId({
          teamAId: market.match.teamA.teamId,
          teamBId: market.match.teamB.teamId,
          teamAName: market.match.teamA.name,
          teamBName: market.match.teamB.name,
          eventName: market.match.eventName,
          scheduledAt,
        }) : undefined,
        slug: conditionId,
        startDate: scheduledAt,
        endDate,
        tags: Array.from(new Set([...market.tags, 'daily-fallback', 'local-sim'])),
        match: market.match
          ? {
            ...market.match,
            matchId: conditionId,
            canonicalMatchId: buildCanonicalMatchId({
              teamAId: market.match.teamA.teamId,
              teamBId: market.match.teamB.teamId,
              teamAName: market.match.teamA.name,
              teamBName: market.match.teamB.name,
              eventName: market.match.eventName,
              scheduledAt,
            }),
            scheduledAt,
            status: 'scheduled',
          }
          : undefined,
      };
    });
  }

  private buildSimulationMarket(input: {
    source: 'db' | 'hltv';
    matchId: string;
    teamAName: string;
    teamBName: string;
    teamAId?: string;
    teamBId?: string;
    eventName: string;
    eventType: 'LAN' | 'Online';
    format: 'BO1' | 'BO3' | 'BO5';
    scheduledAt: string;
    today: string;
    index: number;
    hltvMatchId?: string;
  }): Market {
    return buildLocalSimulationMarket(input);
  }

  private persistDailyMarkets(markets: Market[]): void {
    for (const market of markets) {
      const canonicalMatchId = market.canonicalMatchId ?? market.match?.canonicalMatchId ?? (market.match ? buildCanonicalMatchId({
        teamAId: market.match.teamA.teamId,
        teamBId: market.match.teamB.teamId,
        teamAName: market.match.teamA.name,
        teamBName: market.match.teamB.name,
        eventName: market.match.eventName,
        scheduledAt: market.match.scheduledAt,
      }) : undefined);
      const persistentMarket = canonicalMatchId ? {
        ...market,
        canonicalMatchId,
        match: market.match ? { ...market.match, canonicalMatchId } : undefined,
      } : market;
      try {
        this.marketRepo.upsert(persistentMarket);
        if (persistentMarket.tags.includes('local-sim')) {
          const price = Number(persistentMarket.outcomePrices[0] ?? 0.5);
          if (Number.isFinite(price)) this.marketRepo.insertPriceHistoryIfChanged(persistentMarket.conditionId, price);
        }
      } catch (err) {
        logger.warn('Failed to persist daily market', { conditionId: market.conditionId, error: (err as Error).message });
      }

      if (
        (persistentMarket.tags.includes('local-sim') || persistentMarket.tags.includes('local-seed'))
        && !persistentMarket.tags.includes('map-winner')
      ) {
        for (const mapMarket of buildLocalMapWinnerMarkets(persistentMarket)) {
          try {
            this.marketRepo.upsert(mapMarket);
            const price = Number(mapMarket.outcomePrices[0] ?? 0.5);
            if (Number.isFinite(price)) this.marketRepo.insertPriceHistoryIfChanged(mapMarket.conditionId, price);
          } catch (err) {
            logger.warn('Failed to persist map-winner market', {
              conditionId: mapMarket.conditionId,
              error: (err as Error).message,
            });
          }
        }
      }

      if (!persistentMarket.match) continue;
      try {
        this.llmRepo.upsertMatch({
          matchId: persistentMarket.conditionId,
          teamAId: persistentMarket.match.teamA.teamId,
          teamBId: persistentMarket.match.teamB.teamId,
          teamAName: persistentMarket.match.teamA.name,
          teamBName: persistentMarket.match.teamB.name,
          eventName: persistentMarket.match.eventName,
          eventType: persistentMarket.match.eventType,
          format: persistentMarket.match.format,
          scheduledAt: persistentMarket.match.scheduledAt,
          status: persistentMarket.match.status,
          maps: persistentMarket.match.maps ?? [],
          hasTeamData: false,
          lineups: persistentMarket.match.lineups ? JSON.stringify(persistentMarket.match.lineups) : null,
          hltvMatchId: persistentMarket.tags.includes('hltv') ? persistentMarket.conditionId.replace(/^local-hltv-/, '') : null,
          canonicalMatchId,
        });
      } catch (err) {
        logger.warn('Failed to persist daily match', { matchId: market.conditionId, error: (err as Error).message });
      }
    }
  }

  private isDashboardDate(value: string, today: string): boolean {
    const time = Date.parse(value);
    if (!Number.isFinite(time)) return false;
    return new Date(time).toISOString().split('T')[0] === today;
  }

  private normalizeScheduledAt(value: string | undefined, today: string, index: number): string {
    const time = Date.parse(value ?? '');
    if (Number.isFinite(time)) {
      const iso = new Date(time).toISOString();
      if (iso.split('T')[0] >= today) return iso;
    }
    return this.todaySlotIso(today, index);
  }

  private todaySlotIso(today: string, index: number): string {
    const date = new Date(`${today}T12:00:00.000Z`);
    date.setUTCMinutes(date.getUTCMinutes() + index * 45);
    return date.toISOString();
  }

  private addHours(iso: string, hours: number): string {
    const date = new Date(iso);
    date.setUTCHours(date.getUTCHours() + hours);
    return date.toISOString();
  }

  private normalizeFormat(value: string): 'BO1' | 'BO3' | 'BO5' {
    const upper = value.toUpperCase();
    if (upper === 'BO1' || upper === 'BO5') return upper;
    return 'BO3';
  }

  private localTeamId(name: string, side: 'a' | 'b'): string {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `local-team-${side}-${slug || 'unknown'}`;
  }

  private repriceLocalMarket(market: Market): Market {
    if (!market.match || !market.tags.includes('local-sim')) return market;
    const estimate = estimateLocalOdds(market.match);
    return {
      ...market,
      outcomePrices: [estimate.teamAProbability.toFixed(4), estimate.teamBProbability.toFixed(4)],
      description: `${market.description} Local evidence confidence: ${(estimate.confidence * 100).toFixed(0)}%.`,
    };
  }

  private winRateFromRank(rank: number): number {
    if (!Number.isFinite(rank) || rank <= 0) return 0.5;
    return Math.max(0.35, Math.min(0.68, 0.62 - rank / 400));
  }

  /**
   * Lightweight LLM pre-analysis: for each match, asks a single enabled LLM
   * for a quick win-probability estimate. Falls back gracefully if no LLM
   * is configured or if the call fails.
   */
  private async batchLightweightPredictions(
    matchMarkets: Market[],
    upcomingMatches: Array<Record<string, unknown>>,
  ): Promise<Map<string, LightweightLLMResult>> {
    const results = new Map<string, LightweightLLMResult>();
    if (matchMarkets.length === 0) return results;

    let configs: Array<{ provider: LLMProvider; apiKey: string; model: string }>;
    try {
      const allConfigs = await this.llmRepo.getAllConfigs();
      configs = allConfigs
        .filter((c) => c.isEnabled && c.apiKey)
        .map((c) => ({ provider: c.provider, apiKey: c.apiKey, model: c.model }));
    } catch {
      return results;
    }
    if (configs.length === 0) return results;

    // Use the first enabled provider for lightweight pre-analysis
    const config = configs[0];

    const matchMap = new Map<string, Record<string, unknown>>();
    for (const m of upcomingMatches) {
      matchMap.set(String(m.match_id ?? ''), m);
    }

    const promises = matchMarkets.map(async (m) => {
      try {
        const dbMatch = matchMap.get(m.conditionId)
          ?? upcomingMatches.find((um) => {
            const question = (m.question ?? '').toLowerCase();
            const nameA = String(um.team_a_name ?? '').toLowerCase();
            const nameB = String(um.team_b_name ?? '').toLowerCase();
            return nameA && nameB && question.includes(nameA) && question.includes(nameB);
          });

        const teamAName = m.match?.teamA.name ?? (dbMatch ? String(dbMatch.team_a_name ?? 'Team A') : 'Team A');
        const teamBName = m.match?.teamB.name ?? (dbMatch ? String(dbMatch.team_b_name ?? 'Team B') : 'Team B');

        const prob = await withTimeout(
          this.lightweightPredict(config, teamAName, teamBName, m.question),
          dailyLlmTimeoutMs(),
          `daily lightweight llm ${m.conditionId}`,
        );
        if (prob !== null) {
          results.set(m.conditionId, { prob, provider: config.provider });
        }
      } catch {
        // skip on error
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  private async lightweightPredict(
    config: { provider: LLMProvider; apiKey: string; model: string },
    teamAName: string,
    teamBName: string,
    question: string,
  ): Promise<number | null> {
    const encKey = process.env.POLYRADER_ENCRYPTION_KEY ?? process.env.ENCRYPTION_KEY;
    if (!encKey) return null;

    try {
      if (!this.keyManager) {
        this.keyManager = new KeyManager(encKey);
      }
      const apiKey = this.keyManager.decrypt(config.apiKey);

      const key = `${config.provider}:${config.model}`;
      let wrapped = this.circuitBreakers.get(key);
      if (!wrapped) {
        const inner = LLMClientFactory.create(config.provider, apiKey, config.model);
        wrapped = new CircuitBreakerLLMClient(config.provider, inner);
        this.circuitBreakers.set(key, wrapped);
      }

      const system = 'You are a CS2 esports analyst. Given a match, output ONLY a JSON object: {"teamAProb": 0.0-1.0}. No other text.';
      const user = `Match: ${question}\nTeam A: ${teamAName}\nTeam B: ${teamBName}\nEstimate Team A win probability (0.0-1.0).`;

      const raw = await wrapped.complete({ system, user });
      const match = raw.match(/"teamAProb"\s*:\s*([0-9.]+)/i);
      if (match) {
        const prob = parseFloat(match[1]);
        if (!isNaN(prob) && prob >= 0 && prob <= 1) return prob;
      }
      return null;
    } catch {
      return null;
    }
  }

}

function dailyLlmTimeoutMs(): number {
  return envNumber('POLYRADER_DAILY_LLM_TIMEOUT_MS', envNumber('POLYRADER_EXTERNAL_TIMEOUT_MS', 7000, 250, 30000), 250, 30000);
}

function dailySourceTimeoutMs(): number {
  return envNumber('POLYRADER_DAILY_SOURCE_TIMEOUT_MS', envNumber('POLYRADER_EXTERNAL_TIMEOUT_MS', 10000, 250, 30000), 250, 30000);
}
