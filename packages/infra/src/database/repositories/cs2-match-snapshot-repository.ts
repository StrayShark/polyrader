import { randomUUID } from 'crypto';
import { query, queryOne } from '../connection';
import type { Cs2MatchSnapshot } from '@polyrader/core';

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  try {
    const parsed = JSON.parse(String(value)) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function mapSnapshot(row: Record<string, unknown>): Cs2MatchSnapshot {
  return {
    id: String(row.id),
    betId: String(row.bet_id),
    matchId: row.match_id ? String(row.match_id) : undefined,
    teamAName: row.team_a_name ? String(row.team_a_name) : undefined,
    teamBName: row.team_b_name ? String(row.team_b_name) : undefined,
    teamARank: row.team_a_rank !== null && row.team_a_rank !== undefined ? Number(row.team_a_rank) : undefined,
    teamBRank: row.team_b_rank !== null && row.team_b_rank !== undefined ? Number(row.team_b_rank) : undefined,
    format: row.format ? String(row.format) : undefined,
    tier: row.tier ? String(row.tier) : undefined,
    eventName: row.event_name ? String(row.event_name) : undefined,
    status: row.status ? String(row.status) : undefined,
    lineups: parseJsonObject(row.lineups_json),
    mapPool: parseJsonObject(row.map_pool_json),
    rankings: parseJsonObject(row.rankings_json),
    capturedAt: String(row.captured_at),
  };
}

export interface CreateCs2MatchSnapshotInput {
  betId: string;
  matchId?: string;
  teamAName?: string;
  teamBName?: string;
  teamARank?: number;
  teamBRank?: number;
  format?: string;
  tier?: string;
  eventName?: string;
  status?: string;
  lineups?: Record<string, unknown>;
  mapPool?: Record<string, unknown>;
  rankings?: Record<string, unknown>;
}

export class Cs2MatchSnapshotRepository {
  getByBetId(betId: string): Cs2MatchSnapshot | undefined {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM cs2_match_snapshots WHERE bet_id = ? ORDER BY captured_at DESC LIMIT 1`,
      betId,
    );
    return row ? mapSnapshot(row) : undefined;
  }

  create(input: CreateCs2MatchSnapshotInput): Cs2MatchSnapshot {
    const snapshot: Cs2MatchSnapshot = {
      id: `msnap-${randomUUID()}`,
      betId: input.betId,
      matchId: input.matchId,
      teamAName: input.teamAName,
      teamBName: input.teamBName,
      teamARank: input.teamARank,
      teamBRank: input.teamBRank,
      format: input.format,
      tier: input.tier,
      eventName: input.eventName,
      status: input.status,
      lineups: input.lineups ?? {},
      mapPool: input.mapPool ?? {},
      rankings: input.rankings ?? {},
      capturedAt: new Date().toISOString(),
    };

    query(
      `INSERT INTO cs2_match_snapshots (
        id, bet_id, match_id, team_a_name, team_b_name, team_a_rank, team_b_rank,
        format, tier, event_name, status, lineups_json, map_pool_json, rankings_json, captured_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      snapshot.id,
      snapshot.betId,
      snapshot.matchId ?? null,
      snapshot.teamAName ?? null,
      snapshot.teamBName ?? null,
      snapshot.teamARank ?? null,
      snapshot.teamBRank ?? null,
      snapshot.format ?? null,
      snapshot.tier ?? null,
      snapshot.eventName ?? null,
      snapshot.status ?? null,
      JSON.stringify(snapshot.lineups),
      JSON.stringify(snapshot.mapPool),
      JSON.stringify(snapshot.rankings),
      snapshot.capturedAt,
    );

    return snapshot;
  }
}
