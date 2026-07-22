import type { Request, Response } from 'express';
import { EsportsService } from '../services/esports-service';
import { trackTask } from '../services/task-tracker-service';
import { logger } from '../utils/logger';
import { cacheDelete, HLTVCrawler, CsApiClient, LLMRepository, EsportsRepository, GridClient, MarketRepository, query, queryOne } from '@polyrader/infra';
import { EsportsEnricher, type EnricherSources } from '@polyrader/core';
import type { Team, Player, HeadToHead, EnrichedMatch } from '@polyrader/core';
import { SourceAlignmentService } from '../services/source-alignment-service';
import { buildMatchInfo } from '../services/match-helpers';
import { MatchReconciliationService } from '../services/match-reconciliation-service';
import { envNumber, withTimeout } from '../utils/timeout';
import { buildLocalSimulationMarket } from '../services/local-simulation-market';
import { estimateLocalOdds } from '../services/local-odds';

export class EsportsController {
  private service = new EsportsService();
  private hltv = new HLTVCrawler();
  private csApi = new CsApiClient();
  private grid = new GridClient();
  private llmRepo = new LLMRepository();
  private esportsRepo = new EsportsRepository();
  private marketRepo = new MarketRepository();
  private matchSelfHealAttempts = new Map<string, number>();
  private hltvEnrichmentTask: Promise<void> | null = null;
  private enricher = new EsportsEnricher();
  private sourceAlignment = new SourceAlignmentService({
    esportsRepo: this.esportsRepo,
    llmRepo: this.llmRepo,
    hltv: this.hltv,
  });
  private matchReconciliation = new MatchReconciliationService({
    hltv: this.hltv,
    llmRepo: this.llmRepo,
    esportsRepo: this.esportsRepo,
    marketRepo: this.marketRepo,
  });

  /**
   * Manually fetch upcoming matches from Polymarket + HLTV.
   * Returns a list of matches available for analysis.
   */
  async fetchUpcomingMatches(req: Request, res: Response): Promise<void> {
    try {
      let payload: {
        hltvMatches: Array<{ matchId: string; teamAId: string; teamBId: string; teamAName: string; teamBName: string; event: string; eventType: string; format: string; date: string }>;
        polymarketMarkets: Array<{ conditionId: string; question: string; outcomes: string[]; outcomePrices: string[]; volume: number; endDate: string }>;
        total: number;
        enrichment: { discovered: number; enriched: number; lineupRefreshed: number; reused: number; failed: number };
        enrichmentQueued: boolean;
      } = {
        hltvMatches: [],
        polymarketMarkets: [],
        total: 0,
        enrichment: { discovered: 0, enriched: 0, lineupRefreshed: 0, reused: 0, failed: 0 },
        enrichmentQueued: false,
      };

      await trackTask('esports-fetch-upcoming', {
        name: '手动拉取赛程',
        category: 'esports',
        trigger: 'manual',
      }, async (ctx) => {
        const refreshTimeoutMs = envNumber('POLYRADER_ESPORTS_REFRESH_TIMEOUT_MS', 10_000, 1_000, 30_000);
        const { MarketService } = await import('../services/market-service');
        const marketService = new MarketService();

        ctx.setProgress(10, '并行刷新赛事与盘口');
        const hltvRequest = withTimeout(
          this.hltv.getMatches(),
          refreshTimeoutMs,
          'HLTV upcoming matches',
        ).catch((err) => {
          ctx.log(`HLTV 失败: ${(err as Error).message}`, 'warn');
          return [];
        });
        const gridRequest = withTimeout(
          this.grid.getUpcomingSeries(),
          refreshTimeoutMs,
          'GRID upcoming series',
        ).catch((err) => {
          ctx.log(`GRID 失败: ${(err as Error).message}`, 'warn');
          return [];
        });
        const marketRequest = withTimeout(
          marketService.refreshMarkets(),
          refreshTimeoutMs,
          'Polymarket market refresh',
        ).catch((err) => {
          ctx.log(`Polymarket 失败: ${(err as Error).message}`, 'warn');
          return [];
        });

        const [hltvResult, gridUpcoming, markets] = await Promise.all([
          hltvRequest,
          gridRequest,
          marketRequest,
        ]);

        let hltvMatches: Array<{ matchId: string; teamAId: string; teamBId: string; teamAName: string; teamBName: string; event: string; eventType: string; format: string; date: string }> = [];
        let enrichment = { discovered: 0, enriched: 0, lineupRefreshed: 0, reused: 0, failed: 0 };
        let enrichmentQueued = false;

        if (hltvResult.length > 0) {
          hltvMatches = hltvResult.map((m) => ({
            matchId: m.matchId, teamAId: m.teamAId, teamBId: m.teamBId,
            teamAName: m.teamAName, teamBName: m.teamBName,
            event: m.event, eventType: m.eventType, format: m.format, date: m.date,
          }));
          ctx.log(`HLTV: ${hltvMatches.length} 场比赛`);
          ctx.setProgress(55, '写入最新赛程');

          try {
            const discovery = await this.sourceAlignment.syncDiscoveredHltvMatches(hltvResult, { limit: 0 });
            const localMarketCount = this.persistHltvSimulationMarkets(hltvResult);
            enrichment = {
              discovered: discovery.discovered,
              enriched: 0,
              lineupRefreshed: 0,
              reused: 0,
              failed: 0,
            };
            await this.hydrateStoredHltvMarkets(hltvResult.map((match) => match.matchId));
            await marketService.primeLocalMarketsCache(100);
            const enrichmentStarted = this.queueHltvEnrichment(hltvResult, req.headers['x-request-id']);
            enrichmentQueued = enrichmentStarted || this.hltvEnrichmentTask !== null;
            ctx.log(`本地模拟盘口: ${localMarketCount} 个`);
            ctx.log(enrichmentStarted ? 'HLTV 详细情报已进入后台补全队列' : 'HLTV 详细情报补全任务已在运行');
          } catch (err) {
            ctx.log(`HLTV 赛程写入失败: ${(err as Error).message}`, 'warn');
          }
        }

        const existingIds = new Set(hltvMatches.map((m) => m.matchId));
        for (const m of gridUpcoming) {
          if (!m.teamAId || !m.teamBId || existingIds.has(m.seriesId)) continue;
          hltvMatches.push({
            matchId: m.seriesId,
            teamAId: m.teamAId,
            teamBId: m.teamBId,
            teamAName: m.teamAName,
            teamBName: m.teamBName,
            event: m.eventName,
            eventType: 'Online',
            format: m.format,
            date: m.date,
          });
          existingIds.add(m.seriesId);
        }
        ctx.log(`GRID: ${gridUpcoming.length} 场`);

        const polymarketMarkets = markets
          .filter((m) => {
            const q = m.question.toLowerCase();
            return q.startsWith('counter-strike') || q.includes('cs2') || q.includes('csgo');
          })
          .map((m) => ({
            conditionId: m.conditionId, question: m.question,
            outcomes: m.outcomes, outcomePrices: m.outcomePrices,
            volume: m.volume, endDate: m.endDate,
          }));
        ctx.log(`Polymarket CS2: ${polymarketMarkets.length} 个市场`);

        payload = {
          hltvMatches: hltvMatches.slice(0, 50),
          polymarketMarkets,
          total: hltvMatches.length + polymarketMarkets.length,
          enrichment,
          enrichmentQueued,
        };
        ctx.setProgress(100);
        return { hltvCount: hltvMatches.length, marketCount: polymarketMarkets.length, enrichmentQueued };
      });

      res.json({ data: payload });
    } catch (err) {
      logger.error('Failed to fetch upcoming matches', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch upcoming matches', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  private queueHltvEnrichment(
    hltvMatches: Awaited<ReturnType<HLTVCrawler['getMatches']>>,
    requestId: string | string[] | undefined,
  ): boolean {
    if (hltvMatches.length === 0 || this.hltvEnrichmentTask) return false;

    const task = trackTask('hltv-discovery-enrichment', {
      name: 'HLTV 队伍与选手情报补全',
      category: 'esports',
      trigger: 'manual',
      metadata: { discovered: hltvMatches.length, requestId },
    }, async (ctx) => {
      ctx.setProgress(10, '补全近期战绩、排名、阵容与地图池');
      const sync = await this.sourceAlignment.syncDiscoveredHltvMatches(hltvMatches);
      ctx.setProgress(90, '更新赛事大厅本地快照');
      await this.hydrateStoredHltvMarkets(hltvMatches.map((match) => match.matchId));
      const { MarketService } = await import('../services/market-service');
      await new MarketService().primeLocalMarketsCache(100);
      ctx.log(`补全 ${sync.enriched}，阵容刷新 ${sync.lineupRefreshed}，复用 ${sync.reused}，失败 ${sync.failed}`);
      return {
        discovered: sync.discovered,
        enriched: sync.enriched,
        lineupRefreshed: sync.lineupRefreshed,
        reused: sync.reused,
        failed: sync.failed,
      };
    });

    this.hltvEnrichmentTask = task;
    void task.finally(() => {
      if (this.hltvEnrichmentTask === task) this.hltvEnrichmentTask = null;
    });
    return true;
  }

  private persistHltvSimulationMarkets(
    hltvMatches: Awaited<ReturnType<HLTVCrawler['getMatches']>>,
  ): number {
    const today = new Date().toISOString().slice(0, 10);
    const now = Date.now();
    let persisted = 0;

    hltvMatches.forEach((match, index) => {
      if (!match.teamAName || !match.teamBName || !Number.isFinite(Date.parse(match.date))) return;
      const localMarket = buildLocalSimulationMarket({
        source: 'hltv',
        matchId: match.matchId,
        teamAName: match.teamAName,
        teamBName: match.teamBName,
        teamAId: match.teamAId,
        teamBId: match.teamBId,
        eventName: match.event,
        eventType: match.eventType,
        format: match.format,
        scheduledAt: match.date,
        today,
        index,
        hltvMatchId: match.matchId,
      });
      if (Date.parse(localMarket.endDate) < now - 5 * 60 * 1000) return;

      try {
        const existing = this.marketRepo.findByConditionId(localMarket.conditionId);
        if (existing?.status === 'resolved') return;
        const existingPrices = existing?.outcomePrices.length === 2
          && existing.outcomePrices.every((price) => Number.isFinite(Number(price)))
          ? existing.outcomePrices
          : localMarket.outcomePrices;
        const market = {
          ...localMarket,
          outcomePrices: existingPrices,
          volume: existing?.volume ?? localMarket.volume,
          volume24h: existing?.volume24h ?? localMarket.volume24h,
          liquidity: existing?.liquidity ?? localMarket.liquidity,
        };
        this.marketRepo.upsert(market);
        const price = Number(market.outcomePrices[0]);
        if (Number.isFinite(price)) this.marketRepo.insertPriceHistoryIfChanged(market.conditionId, price);
        persisted++;
      } catch (err) {
        logger.warn('Failed to persist HLTV simulation market', {
          hltvMatchId: match.matchId,
          error: (err as Error).message,
        });
      }
    });

    return persisted;
  }

  private async hydrateStoredHltvMarkets(hltvMatchIds: string[]): Promise<void> {
    for (const hltvMatchId of hltvMatchIds) {
      const conditionId = `local-hltv-${hltvMatchId}`;
      const market = this.marketRepo.findByConditionId(conditionId);
      const match = this.llmRepo.getMatch(conditionId);
      if (!market || !match) continue;
      const teamARow = this.llmRepo.getTeam(String(match.team_a_id ?? ''));
      const teamBRow = this.llmRepo.getTeam(String(match.team_b_id ?? ''));
      const matchInfo = buildMatchInfo(match, teamARow, teamBRow);
      const nextMarket = { ...market, match: matchInfo };
      if (market.tags.includes('local-sim')) {
        const estimate = estimateLocalOdds(matchInfo);
        nextMarket.outcomePrices = [
          estimate.teamAProbability.toFixed(4),
          estimate.teamBProbability.toFixed(4),
        ];
        this.marketRepo.insertPriceHistoryIfChanged(conditionId, estimate.teamAProbability);
      }
      this.marketRepo.upsert(nextMarket);
    }
    await Promise.all([
      cacheDelete('markets:50:0'),
      cacheDelete('markets:100:0'),
    ]);
  }

  /**
   * Manually enrich a specific Polymarket market with team data (roster, maps, H2H).
   * Body: { question: string, conditionId: string, outcomes: string[], endDate: string }
   */
  async enrichMatch(req: Request, res: Response): Promise<void> {
    try {
      const { conditionId, question, outcomes, outcomePrices, volume, endDate } = req.body;

      if (!question || !conditionId) {
        res.status(400).json({ error: 'question and conditionId are required' });
        return;
      }

      let result: EnrichedMatch | undefined;
      await trackTask('esports-enrich-match', {
        name: '手动 Enrich 比赛',
        category: 'esports',
        trigger: 'manual',
        metadata: { conditionId, question: String(question).slice(0, 80) },
      }, async (ctx) => {
        const market = {
          conditionId, slug: '', question, description: '',
          outcomes: outcomes ?? [], outcomePrices: outcomePrices ?? [],
          volume: volume ?? 0, volume24h: 0, liquidity: 0,
          endDate: endDate ?? '', startDate: '',
          status: 'active' as const, tags: [],
        };

        const historyMonths = this.esportsRepo.getAnalysisFilterConfig().historyMonths;
        const sources = this.buildSources(historyMonths);
        ctx.setProgress(30, '拉取战队数据');
        const enrichResult = await this.enricher.enrich(market, sources, historyMonths);

        if (enrichResult.teamA && enrichResult.teamB) {
          let hltvMatchId: string | null = null;
          try {
            hltvMatchId = await this.hltv.findMatchIdByTeams(enrichResult.teamA.name, enrichResult.teamB.name);
          } catch {
            // best-effort
          }
          const fallbackLineups = this.sourceAlignment.buildRosterFallbackLineups(enrichResult.teamA, enrichResult.teamB);
          this.llmRepo.upsertMatch({
            matchId: conditionId,
            teamAId: enrichResult.teamA.teamId,
            teamBId: enrichResult.teamB.teamId,
            teamAName: enrichResult.teamA.name,
            teamBName: enrichResult.teamB.name,
            eventName: enrichResult.parsed.eventName,
            eventType: enrichResult.parsed.eventName.toLowerCase().includes('online') ? 'Online' : 'LAN',
            format: enrichResult.parsed.format ?? 'BO3',
            scheduledAt: endDate || new Date().toISOString(),
            status: 'scheduled',
            maps: [],
            hasTeamData: true,
            hltvMatchId,
            lineups: fallbackLineups,
          });
          this.sourceAlignment.linkPolymarketMatch(conditionId, String(question));
          this.sourceAlignment.linkHltvMatch(conditionId, hltvMatchId);
          await this.sourceAlignment.syncLiquipediaTeamsForMatch(enrichResult.teamA, enrichResult.teamB);
          if (hltvMatchId) {
            await this.sourceAlignment.refreshHltvLineupForMatch({
              match_id: conditionId,
              hltv_match_id: hltvMatchId,
              team_a_id: enrichResult.teamA.teamId,
              team_b_id: enrichResult.teamB.teamId,
            });
          }
          ctx.log(`${enrichResult.teamA.name} vs ${enrichResult.teamB.name}`);
        } else {
          ctx.log('未能匹配到完整战队数据', 'warn');
        }

        result = enrichResult;
        ctx.setProgress(100);
      });

      logger.info('Manual enrichment completed', {
        market: question.substring(0, 60),
        teamA: result?.teamA?.name,
        teamB: result?.teamB?.name,
      });

      res.json({ data: result });
    } catch (err) {
      logger.error('Failed to enrich match', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to enrich match', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  private buildSources(historyMonths = 3): EnricherSources {
    return {
      // ── GRID (priority 1: official data) ──
      getTeamFromGrid: async (teamId: string) => this.grid.getTeam(teamId),
      searchTeamsGrid: async (name: string) => this.grid.searchTeams(name),
      getRosterFromGrid: async (teamId: string, months?: number) =>
        this.grid.getTeamRoster(teamId, months ?? historyMonths),
      getH2HFromGrid: async (a: string, b: string, months?: number) =>
        this.grid.getHeadToHead(a, b, months ?? historyMonths),
      // ── CS API (priority 2) ──
      getTeamFromCsApi: async (teamId: string) => this.csApi.getTeam(teamId),
      searchTeamsCsApi: async (name: string) => this.csApi.searchTeams(name),
      // ── HLTV (priority 3: fallback) ──
      getTeamFromHltv: async (teamId: string) => this.hltv.getTeam(teamId),
      getH2HFromCsApi: async (a: string, b: string, months?: number) =>
        this.csApi.getHeadToHead(a, b, months ?? historyMonths),
      getH2HFromHltv: async (a: string, b: string) => this.hltv.getHeadToHead(a, b),
      lookupTeamInDb: (name: string) => {
        const row = queryOne<{ team_id: string; name: string; rank: number }>(
          `SELECT team_id, name, rank FROM teams WHERE LOWER(name) = LOWER(?) COLLATE NOCASE ORDER BY (players != '[]' AND players != '') DESC, rank DESC LIMIT 1`,
          name,
        );
        return row ? { teamId: row.team_id, name: row.name, rank: row.rank } : null;
      },
      getAllTeamsFromDb: () => {
        return query<{ team_id: string; name: string; rank: number }>(
          `SELECT team_id, name, rank FROM teams WHERE name != ''`,
        ).map((r) => ({ teamId: r.team_id, name: r.name, rank: r.rank }));
      },
      upsertTeam: (team: Team) => {
        this.llmRepo.upsertTeam({
          teamId: team.teamId, name: team.name, rank: team.rank, region: team.region,
          players: JSON.stringify(team.players), recentForm: JSON.stringify(team.recentForm),
          mapPool: JSON.stringify(team.mapPool),
        });
      },
      upsertPlayer: (player: Player, source: string) => {
        this.esportsRepo.upsertPlayer({
          playerId: player.playerId, nickname: player.nickname, realName: player.name,
          role: player.role, rating: player.rating, kdRatio: player.kdRatio,
          hsPercent: player.headshotPercent, mapsPlayed: player.mapsPlayed, source,
        });
      },
      upsertRoster: (teamId: string, playerIds: string[]) => this.esportsRepo.upsertTeamRoster(teamId, playerIds),
      upsertH2H: (a: string, b: string, h2h: HeadToHead) => this.esportsRepo.upsertHeadToHead(a, b, h2h),
    };
  }

  async getEvents(req: Request, res: Response): Promise<void> {
    try {
      const events = await this.service.getEvents();
      res.json({ data: events });
    } catch (err) {
      logger.error('Failed to fetch events', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch events', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async getRankings(req: Request, res: Response): Promise<void> {
    try {
      const rankings = await this.service.getRankings();
      res.json({ data: rankings });
    } catch (err) {
      logger.error('Failed to fetch rankings', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch rankings', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async getTeam(req: Request, res: Response): Promise<void> {
    try {
      const team = await this.service.getTeam(req.params.teamId);
      if (!team) {
        res.status(404).json({ error: 'Team not found' });
        return;
      }
      res.json({ data: team });
    } catch (err) {
      logger.error('Failed to fetch team', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch team', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async getTeamSources(req: Request, res: Response): Promise<void> {
    try {
      const links = this.esportsRepo.getTeamSourceLinks(req.params.teamId);
      const rosterSnapshots = this.esportsRepo.getRosterSourceSnapshots(req.params.teamId, undefined, 10);
      res.json({ data: { links, rosterSnapshots } });
    } catch (err) {
      logger.error('Failed to fetch team source links', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch team source links', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async upsertTeamSource(req: Request, res: Response): Promise<void> {
    try {
      const teamId = req.params.teamId;
      const source = req.params.source;
      const dbTeam = this.llmRepo.getTeam(teamId);
      if (!dbTeam) {
        res.status(404).json({ error: 'Team not found' });
        return;
      }

      const body = req.body as {
        sourceId: string;
        sourceName?: string;
        sourceSlug?: string;
        sourceUrl?: string;
        confidence?: number;
        isPrimary?: boolean;
        metadata?: Record<string, unknown>;
      };
      this.esportsRepo.upsertTeamSourceLink({
        teamId,
        source,
        sourceId: body.sourceId,
        sourceName: body.sourceName,
        sourceSlug: body.sourceSlug,
        sourceUrl: body.sourceUrl,
        confidence: body.confidence ?? 1,
        isPrimary: body.isPrimary ?? false,
        metadata: { ...(body.metadata ?? {}), confirmedManually: true },
      });

      const links = this.esportsRepo.getTeamSourceLinks(teamId);
      const rosterSnapshots = this.esportsRepo.getRosterSourceSnapshots(teamId, undefined, 10);
      res.json({ data: { links, rosterSnapshots } });
    } catch (err) {
      logger.error('Failed to upsert team source link', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to upsert team source link', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async syncLiquipediaTeam(req: Request, res: Response): Promise<void> {
    try {
      const teamId = req.params.teamId;
      const body = req.body as { name?: string };
      const dbTeam = this.llmRepo.getTeam(teamId);
      if (!dbTeam) {
        res.status(404).json({ error: 'Team not found' });
        return;
      }
      const teamName = body.name ?? String(dbTeam?.name ?? teamId);
      const result = await this.sourceAlignment.syncLiquipediaTeam(teamId, teamName);
      res.json({ data: result });
    } catch (err) {
      logger.error('Failed to sync Liquipedia team', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to sync Liquipedia team', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async getMatch(req: Request, res: Response): Promise<void> {
    try {
      const matchId = req.params.matchId;
      const stored = this.llmRepo.getMatch(matchId);
      if (stored?.hltv_match_id) {
        const teamARow = this.llmRepo.getTeam(String(stored.team_a_id ?? ''));
        const teamBRow = this.llmRepo.getTeam(String(stored.team_b_id ?? ''));
        const snapshot = buildMatchInfo(stored, teamARow, teamBRow);
        const lastAttempt = this.matchSelfHealAttempts.get(matchId) ?? 0;
        const missingVisualAssets = !snapshot.teamA.logo || !snapshot.teamB.logo;
        if ((!snapshot.teamDetails?.isComplete || missingVisualAssets) && Date.now() - lastAttempt > 10 * 60 * 1000) {
          this.matchSelfHealAttempts.set(matchId, Date.now());
          const result = await this.sourceAlignment.enrichHltvMatchForAnalysis(stored);
          if (!result.refreshed) {
            logger.warn('Match detail self-heal did not complete', { matchId, message: result.message ?? 'unknown' });
          }
        }
      }
      const match = await this.service.getMatch(matchId);
      if (!match) {
        res.status(404).json({ error: 'Match not found' });
        return;
      }
      res.json({ data: match });
    } catch (err) {
      logger.error('Failed to fetch match', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch match', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async reconcileMatch(req: Request, res: Response): Promise<void> {
    try {
      const result = await this.matchReconciliation.reconcileMatch(req.params.matchId);
      if (!result) {
        res.status(404).json({ error: 'HLTV-backed match not found or source unavailable' });
        return;
      }
      res.json({ data: result });
    } catch (err) {
      logger.error('Failed to reconcile match', { matchId: req.params.matchId, error: (err as Error).message });
      res.status(500).json({ error: 'Failed to reconcile match' });
    }
  }

  async getMatchSources(req: Request, res: Response): Promise<void> {
    try {
      const links = this.esportsRepo.getMatchSourceLinks(req.params.matchId);
      res.json({ data: links });
    } catch (err) {
      logger.error('Failed to fetch match source links', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch match source links', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async refreshMatchLineup(req: Request, res: Response): Promise<void> {
    try {
      const match = this.llmRepo.getMatch(req.params.matchId);
      if (!match) {
        res.status(404).json({ error: 'Match not found' });
        return;
      }
      const result = await this.sourceAlignment.refreshHltvLineupForMatch(match);
      res.json({ data: result });
    } catch (err) {
      logger.error('Failed to refresh match lineup', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to refresh match lineup', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }

  async getMapPool(req: Request, res: Response): Promise<void> {
    try {
      const mapPool = await this.service.getMapPool();
      res.json({ data: mapPool });
    } catch (err) {
      logger.error('Failed to fetch map pool', { error: (err as Error).message, requestId: req.headers['x-request-id'] });
      res.status(500).json({ error: 'Failed to fetch map pool', message: process.env.NODE_ENV === 'development' ? (err as Error).message : undefined });
    }
  }
}
