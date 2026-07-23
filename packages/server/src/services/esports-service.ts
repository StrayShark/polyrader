import type { EsportsGame, NormalizedMatchFacts, Team, MatchInfo } from '@polyrader/core';
import { FactRepository, HLTVCrawler, LLMRepository, MarketRepository } from '@polyrader/infra';
import { cacheGet, cacheSet } from '@polyrader/infra';
import { logger } from '../utils/logger';
import { buildMatchInfo, buildTeamFromDbRow } from './match-helpers';

interface EventSummary {
  matchId: string;
  teamA: string;
  teamB: string;
  event: string;
  format: string;
  date: string;
}

interface RankingEntry {
  rank: number;
  teamId: string;
  name: string;
}

export class EsportsService {
  private hltvCrawler = new HLTVCrawler();
  private llmRepo = new LLMRepository();
  private marketRepo = new MarketRepository();
  private factRepo = new FactRepository();

  async getEvents(): Promise<EventSummary[]> {
    const cacheKey = 'esports:events';
    const cached = await cacheGet<EventSummary[]>(cacheKey);
    if (cached) return cached;

    try {
      const summaries = await this.hltvCrawler.getMatches();
      const matches = summaries.map((s) => ({
        matchId: s.matchId,
        teamA: s.teamAName,
        teamB: s.teamBName,
        event: s.event,
        format: s.format,
        date: s.date,
      }));
      await cacheSet(cacheKey, matches, 300);
      return matches;
    } catch (err) {
      logger.warn('Failed to fetch esports events', { error: (err as Error).message });
      return [];
    }
  }

  async getTeam(teamId: string): Promise<Team | null> {
    const cacheKey = `esports:team:${teamId}`;
    const cached = await cacheGet<Team>(cacheKey);
    if (cached) return cached;

    try {
      const row = this.llmRepo.getTeam(teamId);
      if (row) {
        const team = buildTeamFromDbRow(row, teamId);
        await cacheSet(cacheKey, team, 600);
        return team;
      }
      const team = await this.hltvCrawler.getTeam(teamId);
      await cacheSet(cacheKey, team, 600);
      return team;
    } catch (err) {
      logger.warn('Failed to fetch team from HLTV', { error: (err as Error).message });
      return null;
    }
  }

  async getRankings(): Promise<RankingEntry[]> {
    const cacheKey = 'esports:rankings';
    const cached = await cacheGet<RankingEntry[]>(cacheKey);
    if (cached) return cached;

    try {
      const rankings = await this.hltvCrawler.getRankings();
      await cacheSet(cacheKey, rankings, 600);
      return rankings;
    } catch (err) {
      logger.warn('Failed to fetch rankings from HLTV', { error: (err as Error).message });
      return [];
    }
  }

  async getMatch(matchId: string): Promise<MatchInfo | null> {
    const cacheKey = `esports:match:${matchId}`;
    const cached = await cacheGet<MatchInfo>(cacheKey);
    if (cached) return cached;

    try {
      // Try DB first
      let dbMatch = this.llmRepo.getMatch(matchId);
      let linkedMatchId: string | undefined;
      if (!dbMatch) {
        const market =
          this.marketRepo.findBySlug(matchId) ?? this.marketRepo.findByConditionId(matchId);
        linkedMatchId = market?.match?.matchId;
        if (linkedMatchId && linkedMatchId !== matchId)
          dbMatch = this.llmRepo.getMatch(linkedMatchId);
      }
      if (dbMatch) {
        const teamARow = this.llmRepo.getTeam(String(dbMatch.team_a_id ?? ''));
        const teamBRow = this.llmRepo.getTeam(String(dbMatch.team_b_id ?? ''));
        const match = buildMatchInfo(dbMatch, teamARow, teamBRow);
        await cacheSet(cacheKey, match, 300);
        return match;
      }

      for (const candidateId of [matchId, linkedMatchId].filter((value): value is string =>
        Boolean(value),
      )) {
        for (const game of ['dota2', 'lol', 'valorant', 'cs2'] as EsportsGame[]) {
          const facts = this.factRepo.getByGameExternalId(game, candidateId);
          if (!facts) continue;
          const match = matchInfoFromNormalizedFacts(facts);
          await cacheSet(cacheKey, match, 300);
          return match;
        }
      }

      // Fallback: fetch from HLTV
      const detail = await this.hltvCrawler.getMatchDetail(matchId);
      const [teamAData, teamBData] = await Promise.all([
        detail.teamAId ? this.hltvCrawler.getTeam(detail.teamAId) : null,
        detail.teamBId ? this.hltvCrawler.getTeam(detail.teamBId) : null,
      ]);
      const match: MatchInfo = {
        matchId,
        teamA: {
          teamId: detail.teamAId,
          name: detail.teamA,
          rank: detail.teamARank,
          logo: teamAData?.logo ?? '',
          region: teamAData?.region ?? '',
        },
        teamB: {
          teamId: detail.teamBId,
          name: detail.teamB,
          rank: detail.teamBRank,
          logo: teamBData?.logo ?? '',
          region: teamBData?.region ?? '',
        },
        eventName: detail.event,
        eventType: 'Online',
        format: (detail.format || 'BO3') as MatchInfo['format'],
        scheduledAt: detail.date || new Date().toISOString(),
        status: 'scheduled',
        maps: detail.maps,
        lineups: detail.lineups ?? undefined,
        teamDetails:
          teamAData && teamBData
            ? {
                teamA: teamAData,
                teamB: teamBData,
                source: 'hltv',
                isComplete: false,
              }
            : undefined,
      };
      await cacheSet(cacheKey, match, 300);
      return match;
    } catch (err) {
      logger.warn('Failed to fetch match info', { error: (err as Error).message });
      return null;
    }
  }

  async getMapPool(): Promise<Array<{ map: string; teamAPct: number; teamBPct: number }>> {
    const cacheKey = 'esports:map-pool';
    const cached =
      await cacheGet<Array<{ map: string; teamAPct: number; teamBPct: number }>>(cacheKey);
    if (cached) return cached;

    try {
      // Load top 2 teams' map pools from DB
      const teams = this.llmRepo.getTopTeams(2);
      if (teams.length < 2) {
        // Fallback: return default CS2 map pool
        const defaultMaps = ['Inferno', 'Mirage', 'Nuke', 'Ancient', 'Anubis', 'Dust2', 'Vertigo'];
        return defaultMaps.map((map) => ({ map, teamAPct: 50, teamBPct: 50 }));
      }

      const teamAData = this.parseTeamMapPool(teams[0]);
      const teamBData = this.parseTeamMapPool(teams[1]);

      const allMaps = ['Inferno', 'Mirage', 'Nuke', 'Ancient', 'Anubis', 'Dust2', 'Vertigo'];
      const result = allMaps.map((map) => {
        const aPct = teamAData[map] ?? 50;
        const bPct = teamBData[map] ?? 50;
        return { map, teamAPct: aPct, teamBPct: bPct };
      });

      await cacheSet(cacheKey, result, 600);
      return result;
    } catch (err) {
      logger.warn('Failed to load map pool', { error: (err as Error).message });
      return [];
    }
  }

  private parseTeamMapPool(teamRow: Record<string, unknown>): Record<string, number> {
    try {
      const mapPool = teamRow.map_pool;
      if (typeof mapPool === 'string') {
        const parsed = JSON.parse(mapPool);
        if (parsed && typeof parsed === 'object' && parsed.maps) {
          return parsed.maps as Record<string, number>;
        }
      }
      if (typeof mapPool === 'object' && mapPool !== null) {
        const mp = mapPool as Record<string, unknown>;
        if (mp.maps) return mp.maps as Record<string, number>;
      }
    } catch (err) {
      logger.warn('Failed to parse team map pool', { error: (err as Error).message });
    }
    return {};
  }
}

export function matchInfoFromNormalizedFacts(facts: NormalizedMatchFacts): MatchInfo {
  const teamA = facts.participants.find((participant) => participant.side === 'a');
  const teamB = facts.participants.find((participant) => participant.side === 'b');
  return {
    matchId: facts.externalMatchId,
    canonicalMatchId: `${facts.game}:${facts.externalMatchId}`,
    teamA: {
      teamId: teamA?.participantId ?? `${facts.externalMatchId}-a`,
      name: teamA?.name ?? 'Team A',
      logo: '',
      rank: 999,
      region: '',
    },
    teamB: {
      teamId: teamB?.participantId ?? `${facts.externalMatchId}-b`,
      name: teamB?.name ?? 'Team B',
      logo: '',
      rank: 999,
      region: '',
    },
    eventName: facts.eventName,
    eventType: 'Online',
    format: facts.format,
    scheduledAt: facts.startsAt,
    status: normalizeFactMatchStatus(facts.status),
    maps: facts.mapPool,
  };
}

function normalizeFactMatchStatus(status: string): MatchInfo['status'] {
  const normalized = status.toLowerCase();
  if (['scheduled', 'upcoming'].includes(normalized)) return 'scheduled';
  if (['pre_match', 'prematch', 'not_started'].includes(normalized)) return 'pre_match';
  if (['live', 'running', 'in_progress'].includes(normalized)) return 'live';
  if (['finished', 'completed'].includes(normalized)) return 'finished';
  if (normalized === 'settled') return 'settled';
  if (normalized === 'delayed') return 'delayed';
  if (['cancelled', 'canceled'].includes(normalized)) return 'cancelled';
  return 'scheduled';
}
