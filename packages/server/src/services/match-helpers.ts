import type { MapPool, MatchInfo, MatchLineups, Player, RecentForm, Team } from '@polyrader/core';
import { LLMRepository } from '@polyrader/infra';
import { logger } from '../utils/logger';

/**
 * Map a legacy DB match status to the new 7-state MatchInfo status.
 * - 'live' / 'finished' / 'settled' / 'delayed' / 'cancelled' pass through
 * - 'upcoming' (or unknown) → 'scheduled', or 'pre_match' if within 1h of start
 */
export function mapLegacyMatchStatus(dbStatus: string, scheduledAt: string): MatchInfo['status'] {
  if (dbStatus === 'live') return 'live';
  if (dbStatus === 'finished') return 'finished';
  if (dbStatus === 'settled') return 'settled';
  if (dbStatus === 'delayed') return 'delayed';
  if (dbStatus === 'cancelled') return 'cancelled';
  // legacy 'upcoming' or unknown → derive from timing
  const start = new Date(scheduledAt).getTime();
  const now = Date.now();
  const oneHourMs = 60 * 60 * 1000;
  if (!Number.isNaN(start) && now >= start - oneHourMs && now < start) {
    return 'pre_match';
  }
  return 'scheduled';
}

/**
 * Shared helpers for building MatchInfo and Team objects from DB rows.
 * Extracted from signal-service.ts, daily-service.ts, and ai-config-service.ts
 * to eliminate code duplication.
 */

let sharedRepo: LLMRepository | null = null;

function getRepo(): LLMRepository {
  if (!sharedRepo) sharedRepo = new LLMRepository();
  return sharedRepo;
}

/**
 * Build a MatchInfo object from a raw DB match row.
 */
export function buildMatchInfo(
  dbMatch: Record<string, unknown>,
  teamARow?: Record<string, unknown> | null,
  teamBRow?: Record<string, unknown> | null,
): MatchInfo {
  const teamAId = String(dbMatch.team_a_id ?? '');
  const teamBId = String(dbMatch.team_b_id ?? '');
  const teamAData = teamARow ? buildTeamFromDbRow(teamARow, teamAId) : null;
  const teamBData = teamBRow ? buildTeamFromDbRow(teamBRow, teamBId) : null;
  const lineups = parseTypedJson<MatchLineups>(dbMatch.lineups);
  const maps = parseTypedJson<string[]>(dbMatch.maps);
  const score = parseTypedJson<{ teamA: number; teamB: number }>(dbMatch.score);
  const updatedAt = latestTimestamp(teamARow?.updated_at, teamBRow?.updated_at, dbMatch.updated_at);
  return {
    matchId: String(dbMatch.match_id ?? ''),
    canonicalMatchId: dbMatch.canonical_match_id ? String(dbMatch.canonical_match_id) : undefined,
    teamA: {
      teamId: teamAId,
      name: String(dbMatch.team_a_name ?? teamAData?.name ?? ''),
      rank: teamAData?.rank ?? 0,
      logo: teamAData?.logo ?? '',
      region: teamAData?.region ?? '',
    },
    teamB: {
      teamId: teamBId,
      name: String(dbMatch.team_b_name ?? teamBData?.name ?? ''),
      rank: teamBData?.rank ?? 0,
      logo: teamBData?.logo ?? '',
      region: teamBData?.region ?? '',
    },
    eventName: String(dbMatch.event_name ?? ''),
    eventType: (String(dbMatch.event_type ?? 'Online')) as 'LAN' | 'Online',
    format: (String(dbMatch.format ?? 'BO3')) as 'BO1' | 'BO3' | 'BO5',
    scheduledAt: String(dbMatch.scheduled_at ?? new Date().toISOString()),
    status: mapLegacyMatchStatus(String(dbMatch.status ?? 'upcoming'), String(dbMatch.scheduled_at ?? new Date().toISOString())),
    maps: Array.isArray(maps) ? maps : [],
    currentScore: score && Number.isFinite(score.teamA) && Number.isFinite(score.teamB) ? {
      teamA: score.teamA,
      teamB: score.teamB,
      currentMap: '',
      mapScores: [],
    } : undefined,
    lineups: lineups ?? undefined,
    teamDetails: teamAData && teamBData ? {
      teamA: teamAData,
      teamB: teamBData,
      source: 'database',
      isComplete: isCompleteTeam(teamAData) && isCompleteTeam(teamBData),
      updatedAt,
    } : undefined,
  };
}

/**
 * Build a placeholder MatchInfo when no DB data is available.
 */
export function buildFallbackMatchInfo(matchId: string): MatchInfo {
  return {
    matchId,
    teamA: { teamId: 'team-a', name: 'Team A', rank: 10, logo: '', region: '' },
    teamB: { teamId: 'team-b', name: 'Team B', rank: 20, logo: '', region: '' },
    eventName: '',
    eventType: 'Online',
    format: 'BO3',
    scheduledAt: new Date().toISOString(),
    status: 'scheduled',
  };
}

/**
 * Load a Team from the database by teamId, with fallback on failure.
 */
export function loadTeamFromDb(teamId: string): Team {
  try {
    const row = getRepo().getTeam(teamId);
    if (!row) return buildFallbackTeam(teamId, teamId, 0, 0.5);
    return buildTeamFromDbRow(row, teamId);
  } catch (err) {
    logger.warn('Failed to load team from DB', { error: (err as Error).message });
    return buildFallbackTeam(teamId, teamId, 0, 0.5);
  }
}

export function buildTeamFromDbRow(row: Record<string, unknown>, fallbackTeamId = ''): Team {
  const players = parseTypedJson<Player[]>(row.players);
  const recentForm = parseTypedJson<RecentForm>(row.recent_form);
  const mapPool = parseTypedJson<MapPool>(row.map_pool);
  return {
    teamId: String(row.team_id ?? fallbackTeamId),
    name: String(row.name ?? fallbackTeamId),
    logo: String(row.logo ?? ''),
    rank: Number(row.rank ?? 0),
    region: String(row.region ?? ''),
    players: Array.isArray(players) ? players : [],
    recentForm: recentForm && Array.isArray(recentForm.last10Matches)
      ? recentForm
      : { last10Matches: [], winRate: 0.5, streak: 0, averageRating: 0 },
    mapPool: mapPool && Array.isArray(mapPool.maps) ? mapPool : { maps: [] },
    headToHead: [],
  };
}

/**
 * Build a placeholder Team when no DB data is available.
 */
export function buildFallbackTeam(
  teamId: string,
  name: string,
  rank: number,
  winRate: number,
): Team {
  return {
    teamId,
    name,
    rank,
    region: '',
    logo: '',
    players: [],
    recentForm: { last10Matches: [], winRate, streak: 0, averageRating: 1.0 },
    mapPool: { maps: [] },
    headToHead: [],
  };
}

/**
 * Parse a JSON field from a DB row that may be stored as a string or object.
 */
export function parseJsonField(val: unknown): unknown {
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return null; }
  }
  if (typeof val === 'object' && val !== null) {
    return val;
  }
  return null;
}

function parseTypedJson<T>(value: unknown): T | null {
  return parseJsonField(value) as T | null;
}

function isCompleteTeam(team: Team): boolean {
  return team.rank > 0
    && team.rank < 999
    && team.players.length >= 5
    && team.recentForm.last10Matches.length > 0
    && team.mapPool.maps.length > 0;
}

function latestTimestamp(...values: unknown[]): string | undefined {
  const timestamps = values.map(String).filter((value) => value && value !== 'undefined' && value !== 'null');
  return timestamps.sort((a, b) => Date.parse(b) - Date.parse(a))[0];
}
