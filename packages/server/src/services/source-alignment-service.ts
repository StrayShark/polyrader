import type { EnrichedTeam, Lineup, MatchLineups, Player, Team } from '@polyrader/core';
import { cacheDelete, EsportsRepository, HLTVCrawler, LiquipediaClient, LLMRepository } from '@polyrader/infra';
import type { HltvMatchSummary } from '@polyrader/infra';
import { logger } from '../utils/logger';

export interface LiquipediaSyncResult {
  teamId: string;
  teamName: string;
  linked: boolean;
  rosterPlayers: number;
  sourceId?: string;
  sourceUrl?: string;
  message?: string;
}

export interface HltvLineupRefreshResult {
  matchId: string;
  hltvMatchId?: string;
  refreshed: boolean;
  teamAPlayers: number;
  teamBPlayers: number;
  message?: string;
}

export interface HltvAnalysisEnrichmentResult {
  matchId: string;
  hltvMatchId?: string;
  refreshed: boolean;
  teamAId?: string;
  teamBId?: string;
  teamAPlayers: number;
  teamBPlayers: number;
  teamARecentMatches: number;
  teamBRecentMatches: number;
  teamAMaps: number;
  teamBMaps: number;
  lineupsConfirmed: boolean;
  sourceUrl?: string;
  message?: string;
}

export interface HltvDiscoverySyncResult {
  discovered: number;
  enriched: number;
  lineupRefreshed: number;
  reused: number;
  failed: number;
  results: HltvAnalysisEnrichmentResult[];
}

interface MatchLike {
  match_id?: unknown;
  hltv_match_id?: unknown;
  team_a_id?: unknown;
  team_b_id?: unknown;
  team_a_name?: unknown;
  team_b_name?: unknown;
  event_name?: unknown;
  event_type?: unknown;
  format?: unknown;
  scheduled_at?: unknown;
  status?: unknown;
  maps?: unknown;
}

export class SourceAlignmentService {
  private esportsRepo: EsportsRepository;
  private llmRepo: LLMRepository;
  private hltv: HLTVCrawler;
  private liquipedia: LiquipediaClient;

  constructor(options: {
    esportsRepo?: EsportsRepository;
    llmRepo?: LLMRepository;
    hltv?: HLTVCrawler;
    liquipedia?: LiquipediaClient;
  } = {}) {
    this.esportsRepo = options.esportsRepo ?? new EsportsRepository();
    this.llmRepo = options.llmRepo ?? new LLMRepository();
    this.hltv = options.hltv ?? new HLTVCrawler();
    this.liquipedia = options.liquipedia ?? new LiquipediaClient();
  }

  linkPolymarketMatch(matchId: string, question: string): void {
    this.esportsRepo.upsertMatchSourceLink({
      matchId,
      source: 'polymarket',
      sourceId: matchId,
      sourceName: question.slice(0, 120),
      confidence: 1,
    });
  }

  linkHltvMatch(matchId: string, hltvMatchId: string | null | undefined, sourceUrl?: string): void {
    if (!hltvMatchId) return;
    this.esportsRepo.upsertMatchSourceLink({
      matchId,
      source: 'hltv',
      sourceId: hltvMatchId,
      sourceUrl: sourceUrl ?? `https://www.hltv.org/matches/${hltvMatchId}/_`,
      confidence: 0.85,
    });
  }

  buildRosterFallbackLineups(teamA: EnrichedTeam, teamB: EnrichedTeam): string | null {
    if (teamA.players.length === 0 || teamB.players.length === 0) return null;
    const lineups: MatchLineups = {
      teamA: this.playersToUnconfirmedLineup(teamA.players),
      teamB: this.playersToUnconfirmedLineup(teamB.players),
    };
    return JSON.stringify(lineups);
  }

  async syncLiquipediaTeam(teamId: string, teamName: string): Promise<LiquipediaSyncResult> {
    const resultBase = { teamId, teamName, linked: false, rosterPlayers: 0 };
    if (!teamId || !teamName) {
      return { ...resultBase, message: 'teamId and teamName are required' };
    }

    try {
      const candidates = await this.liquipedia.searchTeams(teamName, 5);
      const best = candidates[0];
      if (!best || best.confidence < liquipediaConfidenceThreshold()) {
        return { ...resultBase, message: 'no confident Liquipedia team match' };
      }

      this.esportsRepo.upsertTeamSourceLink({
        teamId,
        source: 'liquipedia',
        sourceId: best.sourceId,
        sourceName: best.canonicalName,
        sourceSlug: best.title.replace(/ /g, '_'),
        sourceUrl: best.sourceUrl,
        confidence: best.confidence,
        isPrimary: true,
        metadata: { pageId: best.pageId, matchedFrom: teamName },
      });

      const roster = await this.liquipedia.getCurrentRoster(best.title);
      if (roster.players.length > 0) {
        for (const player of roster.players) {
          this.esportsRepo.upsertPlayer({
            playerId: player.playerId,
            nickname: player.nickname,
            realName: player.name,
            role: player.role,
            rating: player.rating,
            kdRatio: player.kdRatio,
            hsPercent: player.headshotPercent,
            mapsPlayed: player.mapsPlayed,
            source: 'liquipedia',
          });
        }

        const playerIds = roster.players.map((player) => player.playerId);
        const rosterHash = this.esportsRepo.upsertTeamRoster(teamId, playerIds);
        this.esportsRepo.upsertRosterSourceSnapshot({
          teamId,
          source: 'liquipedia',
          sourceId: best.sourceId,
          rosterHash,
          playerIds,
          players: roster.players,
          isCurrent: true,
          metadata: {
            sourceUrl: roster.sourceUrl,
            fetchedAt: roster.fetchedAt,
            rawLength: roster.rawLength,
          },
        });
      }

      return {
        ...resultBase,
        linked: true,
        rosterPlayers: roster.players.length,
        sourceId: best.sourceId,
        sourceUrl: best.sourceUrl,
      };
    } catch (err) {
      logger.warn('Liquipedia team sync failed', { teamId, teamName, error: (err as Error).message });
      return { ...resultBase, message: (err as Error).message };
    }
  }

  async syncLiquipediaTeamsForMatch(teamA: EnrichedTeam, teamB: EnrichedTeam): Promise<LiquipediaSyncResult[]> {
    if (process.env.POLYRADER_ENABLE_LIQUIPEDIA_SYNC !== '1') return [];
    const maxTeams = envNumber('POLYRADER_LIQUIPEDIA_MAX_TEAMS_PER_RUN', 4, 0, 20);
    const teams = [teamA, teamB].slice(0, maxTeams);
    const results: LiquipediaSyncResult[] = [];
    for (const team of teams) {
      results.push(await this.syncLiquipediaTeam(team.teamId, team.name));
    }
    return results;
  }

  async refreshHltvLineupForMatch(match: MatchLike, summary?: HltvMatchSummary): Promise<HltvLineupRefreshResult> {
    const matchId = String(match.match_id ?? '');
    const hltvMatchId = match.hltv_match_id ? String(match.hltv_match_id) : undefined;
    if (!matchId || !hltvMatchId) {
      return { matchId, hltvMatchId, refreshed: false, teamAPlayers: 0, teamBPlayers: 0, message: 'missing hltv match id' };
    }

    try {
      const matchSummary = summary
        ?? this.getLinkedHltvSummary(match, hltvMatchId)
        ?? (await this.hltv.getMatches()).find((item) => item.matchId === hltvMatchId);
      const lineups = await this.hltv.getMatchLineups(hltvMatchId, matchSummary?.url);
      if (!lineups) {
        return { matchId, hltvMatchId, refreshed: false, teamAPlayers: 0, teamBPlayers: 0, message: 'HLTV lineup not available' };
      }

      const teamAId = String(match.team_a_id ?? '');
      const teamBId = String(match.team_b_id ?? '');
      if (teamAId && teamBId) {
        this.esportsRepo.upsertMatchLineup(matchId, teamAId, teamBId, lineups.teamA, lineups.teamB);
      }
      this.llmRepo.updateMatchLineups(matchId, JSON.stringify(lineups), true);
      this.linkHltvMatch(matchId, hltvMatchId, matchSummary?.url);
      await cacheDelete(`esports:match:${matchId}`);

      return {
        matchId,
        hltvMatchId,
        refreshed: true,
        teamAPlayers: lineups.teamA.players.length,
        teamBPlayers: lineups.teamB.players.length,
      };
    } catch (err) {
      logger.warn('HLTV lineup refresh failed', { matchId, hltvMatchId, error: (err as Error).message });
      return { matchId, hltvMatchId, refreshed: false, teamAPlayers: 0, teamBPlayers: 0, message: (err as Error).message };
    }
  }

  /**
   * Persist newly discovered HLTV matches immediately, then proactively fetch
   * the bounded set closest to start. Fresh complete team profiles are reused.
   */
  async syncDiscoveredHltvMatches(
    summaries: HltvMatchSummary[],
    options: { limit?: number; teamTtlHours?: number } = {},
  ): Promise<HltvDiscoverySyncResult> {
    const valid = summaries.filter((summary) => (
      summary.matchId && summary.teamAId && summary.teamBId && summary.teamAName && summary.teamBName
    ));
    const limit = options.limit ?? envNumber('POLYRADER_HLTV_DISCOVERY_ENRICH_LIMIT', 3, 0, 12);
    const teamTtlHours = options.teamTtlHours ?? envNumber('POLYRADER_HLTV_TEAM_TTL_HOURS', 6, 1, 168);

    for (const summary of valid) {
      const matchId = `local-hltv-${summary.matchId}`;
      const existing = this.llmRepo.getMatch(matchId);
      this.llmRepo.upsertMatch({
        matchId,
        teamAId: summary.teamAId,
        teamBId: summary.teamBId,
        teamAName: summary.teamAName,
        teamBName: summary.teamBName,
        eventName: summary.event || 'HLTV Upcoming',
        eventType: summary.eventType,
        format: summary.format,
        scheduledAt: summary.date || String(existing?.scheduled_at ?? new Date().toISOString()),
        status: String(existing?.status ?? 'scheduled'),
        maps: parseStringArray(existing?.maps),
        hasTeamData: Number(existing?.has_team_data ?? 0) === 1,
        lineups: typeof existing?.lineups === 'string' ? existing.lineups : null,
        hltvMatchId: summary.matchId,
      });
      this.linkHltvMatch(matchId, summary.matchId, summary.url);
    }

    const prioritized = [...valid].sort((a, b) => discoveryPriority(a) - discoveryPriority(b));
    const results: HltvAnalysisEnrichmentResult[] = [];
    let enriched = 0;
    let lineupRefreshed = 0;
    let reused = 0;
    let failed = 0;

    for (const summary of prioritized.slice(0, limit)) {
      const matchId = `local-hltv-${summary.matchId}`;
      const match = this.llmRepo.getMatch(matchId) ?? {
        match_id: matchId,
        hltv_match_id: summary.matchId,
        team_a_id: summary.teamAId,
        team_b_id: summary.teamBId,
        status: 'scheduled',
      };
      const teamARow = this.llmRepo.getTeam(summary.teamAId);
      const teamBRow = this.llmRepo.getTeam(summary.teamBId);
      const teamsFresh = isCompleteTeamRow(teamARow) && isCompleteTeamRow(teamBRow)
        && isFreshTeamRow(teamARow, teamTtlHours) && isFreshTeamRow(teamBRow, teamTtlHours);
      const hasLineups = hasCompleteLineups(match.lineups);

      if (teamsFresh && hasLineups) {
        reused++;
        continue;
      }
      if (teamsFresh) {
        const lineup = await this.refreshHltvLineupForMatch(match, summary);
        if (lineup.refreshed) lineupRefreshed++;
        else failed++;
        continue;
      }

      const result = await this.enrichHltvMatchForAnalysis(match, summary);
      results.push(result);
      if (result.refreshed) enriched++;
      else failed++;
    }

    return { discovered: valid.length, enriched, lineupRefreshed, reused, failed, results };
  }

  /**
   * Populate all HLTV-backed inputs required by pre-match analysis and replace
   * any locally generated placeholder team IDs with canonical HLTV IDs.
   */
  async enrichHltvMatchForAnalysis(match: MatchLike, summary?: HltvMatchSummary): Promise<HltvAnalysisEnrichmentResult> {
    const matchId = String(match.match_id ?? '');
    const hltvMatchId = match.hltv_match_id ? String(match.hltv_match_id) : undefined;
    const emptyResult = {
      matchId,
      hltvMatchId,
      refreshed: false,
      teamAPlayers: 0,
      teamBPlayers: 0,
      teamARecentMatches: 0,
      teamBRecentMatches: 0,
      teamAMaps: 0,
      teamBMaps: 0,
      lineupsConfirmed: false,
    };
    if (!matchId || !hltvMatchId) {
      return { ...emptyResult, message: 'missing match id or hltv match id' };
    }

    try {
      const matchSummary = summary
        ?? this.getLinkedHltvSummary(match, hltvMatchId)
        ?? (await this.hltv.getMatches()).find((item) => item.matchId === hltvMatchId);
      if (!matchSummary?.url) return { ...emptyResult, message: 'HLTV match URL not found' };

      const detail = await this.hltv.getMatchDetail(hltvMatchId, matchSummary.url);
      const teamAId = detail.teamAId || matchSummary.teamAId;
      const teamBId = detail.teamBId || matchSummary.teamBId;
      if (!teamAId || !teamBId) {
        return { ...emptyResult, sourceUrl: matchSummary.url, message: 'canonical HLTV team IDs not found' };
      }

      const [rawTeamA, rawTeamB] = await Promise.all([
        this.hltv.getTeam(teamAId),
        this.hltv.getTeam(teamBId),
      ]);
      const teamA = this.mergeLineupData(rawTeamA, detail.lineups?.teamA, detail.teamARank);
      const teamB = this.mergeLineupData(rawTeamB, detail.lineups?.teamB, detail.teamBRank);
      this.persistHltvTeam(teamA);
      this.persistHltvTeam(teamB);

      const lineupsJson = detail.lineups ? JSON.stringify(detail.lineups) : null;
      this.llmRepo.upsertMatch({
        matchId,
        teamAId,
        teamBId,
        teamAName: detail.teamA || teamA.name || matchSummary.teamAName,
        teamBName: detail.teamB || teamB.name || matchSummary.teamBName,
        eventName: detail.event || matchSummary.event || String(match.event_name ?? 'Unknown Event'),
        eventType: matchSummary.eventType || String(match.event_type ?? 'Online'),
        format: detail.format || matchSummary.format || String(match.format ?? 'BO3'),
        scheduledAt: detail.date || matchSummary.date || String(match.scheduled_at ?? ''),
        status: String(match.status ?? 'scheduled'),
        maps: detail.maps.length > 0 ? detail.maps : parseStringArray(match.maps),
        hasTeamData: hasCompleteTeamData(teamA) && hasCompleteTeamData(teamB),
        lineups: lineupsJson,
        hltvMatchId,
      });

      if (detail.lineups) {
        this.esportsRepo.upsertMatchLineup(
          matchId,
          teamAId,
          teamBId,
          detail.lineups.teamA,
          detail.lineups.teamB,
        );
      }
      this.linkHltvMatch(matchId, hltvMatchId, detail.url || matchSummary.url);
      await Promise.all([
        cacheDelete(`esports:match:${matchId}`),
        cacheDelete(`esports:team:${teamAId}`),
        cacheDelete(`esports:team:${teamBId}`),
      ]);

      return {
        matchId,
        hltvMatchId,
        refreshed: true,
        teamAId,
        teamBId,
        teamAPlayers: teamA.players.length,
        teamBPlayers: teamB.players.length,
        teamARecentMatches: teamA.recentForm.last10Matches.length,
        teamBRecentMatches: teamB.recentForm.last10Matches.length,
        teamAMaps: teamA.mapPool.maps.length,
        teamBMaps: teamB.mapPool.maps.length,
        lineupsConfirmed: !!detail.lineups?.teamA.isConfirmed && !!detail.lineups?.teamB.isConfirmed,
        sourceUrl: detail.url || matchSummary.url,
      };
    } catch (err) {
      logger.warn('HLTV analysis enrichment failed', { matchId, hltvMatchId, error: (err as Error).message });
      return { ...emptyResult, message: (err as Error).message };
    }
  }

  private mergeLineupData(team: Team, lineup: Lineup | undefined, matchRank: number): Team {
    const lineupById = new Map((lineup?.players ?? []).map((player) => [player.playerId, player]));
    let players = team.players.map((player) => {
      const current = lineupById.get(player.playerId);
      return current ? {
        ...player,
        rating: current.rating || player.rating,
        role: current.role || player.role,
        mapsPlayed: current.mapsOnRecord || player.mapsPlayed,
      } : player;
    });
    if (players.length === 0 && lineup) {
      players = lineup.players.map((player) => ({
        playerId: player.playerId,
        name: '',
        nickname: player.nickname,
        rating: player.rating,
        kdRatio: 0,
        headshotPercent: 0,
        mapsPlayed: player.mapsOnRecord,
        role: player.role,
      }));
    }
    const ratings = players.map((player) => player.rating).filter((rating) => rating > 0);
    return {
      ...team,
      rank: team.rank < 999 ? team.rank : matchRank,
      players,
      recentForm: {
        ...team.recentForm,
        averageRating: ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 0,
      },
    };
  }

  private getLinkedHltvSummary(match: MatchLike, hltvMatchId: string): HltvMatchSummary | undefined {
    const matchId = String(match.match_id ?? '');
    let link: ReturnType<EsportsRepository['getMatchSourceLinks']>[number] | undefined;
    try {
      link = this.esportsRepo.getMatchSourceLinks(matchId)
        .find((item) => item.source === 'hltv' && item.sourceId === hltvMatchId && item.sourceUrl);
    } catch {
      return undefined;
    }
    if (!link?.sourceUrl) return undefined;
    const format = String(match.format ?? 'BO3').toUpperCase();
    return {
      matchId: hltvMatchId,
      teamAId: String(match.team_a_id ?? ''),
      teamBId: String(match.team_b_id ?? ''),
      teamAName: String(match.team_a_name ?? ''),
      teamBName: String(match.team_b_name ?? ''),
      event: String(match.event_name ?? ''),
      eventType: String(match.event_type ?? 'Online') === 'LAN' ? 'LAN' : 'Online',
      format: format === 'BO1' || format === 'BO5' ? format : 'BO3',
      date: String(match.scheduled_at ?? ''),
      stars: 0,
      url: link.sourceUrl,
    };
  }

  private persistHltvTeam(team: Team): void {
    this.llmRepo.upsertTeam({
      teamId: team.teamId,
      name: team.name,
      logo: team.logo,
      rank: team.rank,
      region: team.region,
      players: JSON.stringify(team.players),
      recentForm: JSON.stringify(team.recentForm),
      mapPool: JSON.stringify(team.mapPool),
    });
    for (const player of team.players) {
      this.esportsRepo.upsertPlayer({
        playerId: player.playerId,
        nickname: player.nickname,
        realName: player.name,
        role: player.role,
        rating: player.rating,
        kdRatio: player.kdRatio,
        hsPercent: player.headshotPercent,
        mapsPlayed: player.mapsPlayed,
        source: 'hltv',
      });
    }
    const playerIds = team.players.map((player) => player.playerId).filter(Boolean);
    if (playerIds.length > 0) {
      const rosterHash = this.esportsRepo.upsertTeamRoster(team.teamId, playerIds);
      this.esportsRepo.upsertRosterSourceSnapshot({
        teamId: team.teamId,
        source: 'hltv',
        sourceId: team.teamId,
        rosterHash,
        playerIds,
        players: team.players,
        isCurrent: true,
      });
    }
    this.esportsRepo.upsertTeamMatchHistory(team.teamId, team.recentForm.last10Matches);
    this.esportsRepo.upsertMapPool(team.teamId, team.mapPool);
    this.esportsRepo.upsertTeamSourceLink({
      teamId: team.teamId,
      source: 'hltv',
      sourceId: team.teamId,
      sourceName: team.name,
      sourceUrl: `https://www.hltv.org/team/${team.teamId}/_`,
      confidence: 1,
      isPrimary: true,
    });
  }

  private playersToUnconfirmedLineup(players: Player[]): Lineup {
    return {
      players: players.slice(0, 5).map((player) => ({
        playerId: player.playerId,
        nickname: player.nickname,
        rating: player.rating,
        role: normalizeRole(player.role),
        isStandin: false,
        impactScore: Math.round((player.rating || 1) * 80),
        mapsOnRecord: player.mapsPlayed || 0,
      })),
      isConfirmed: false,
      hasStandin: false,
      standinCount: 0,
      missingKeyPlayers: [],
    };
  }
}

function normalizeRole(role: string): Lineup['players'][number]['role'] {
  const text = role.toLowerCase();
  if (text.includes('awp') || text.includes('sniper')) return 'AWPer';
  if (text.includes('igl') || text.includes('leader') || text.includes('captain')) return 'IGL';
  if (text.includes('entry')) return 'Entry';
  if (text.includes('support')) return 'Support';
  if (text.includes('lurk')) return 'Lurker';
  if (text.includes('coach')) return 'Coach';
  return 'Rifler';
}

function liquipediaConfidenceThreshold(): number {
  return envNumber('POLYRADER_LIQUIPEDIA_CONFIDENCE_THRESHOLD', 0.55, 0, 1);
}

function envNumber(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function hasCompleteTeamData(team: Team): boolean {
  return team.rank > 0
    && team.rank < 999
    && team.players.length >= 5
    && team.recentForm.last10Matches.length > 0
    && team.mapPool.maps.length > 0;
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function discoveryPriority(summary: HltvMatchSummary): number {
  const scheduled = Date.parse(summary.date);
  const now = Date.now();
  const distance = Number.isFinite(scheduled) ? Math.max(0, scheduled - now) : Number.MAX_SAFE_INTEGER / 2;
  return distance - summary.stars * 60 * 60 * 1000;
}

function isFreshTeamRow(row: Record<string, unknown> | null, ttlHours: number): boolean {
  if (!row?.updated_at) return false;
  const updatedAt = Date.parse(String(row.updated_at).replace(' ', 'T') + (String(row.updated_at).includes('Z') ? '' : 'Z'));
  return Number.isFinite(updatedAt) && Date.now() - updatedAt <= ttlHours * 60 * 60 * 1000;
}

function isCompleteTeamRow(row: Record<string, unknown> | null): boolean {
  if (!row) return false;
  const players = parseJsonObject(row.players);
  const recentForm = parseJsonObject(row.recent_form) as { last10Matches?: unknown[] } | null;
  const mapPool = parseJsonObject(row.map_pool) as { maps?: unknown[] } | null;
  const rank = Number(row.rank ?? 0);
  return rank > 0 && rank < 999
    && String(row.logo ?? '').startsWith('http')
    && Array.isArray(players) && players.length >= 5
    && Array.isArray(recentForm?.last10Matches) && recentForm.last10Matches.length > 0
    && Array.isArray(mapPool?.maps) && mapPool.maps.length > 0;
}

function hasCompleteLineups(value: unknown): boolean {
  const lineups = parseJsonObject(value) as MatchLineups | null;
  return (lineups?.teamA.players.length ?? 0) >= 5 && (lineups?.teamB.players.length ?? 0) >= 5;
}

function parseJsonObject(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
