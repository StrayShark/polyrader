import { randomUUID } from 'crypto';
import { query, queryOne } from '../connection';
import type { OddsSnapshot } from '@polyrader/core';

function mapSnapshot(row: Record<string, unknown>): OddsSnapshot {
  return {
    id: String(row.id),
    betId: row.bet_id ? String(row.bet_id) : undefined,
    matchId: row.match_id ? String(row.match_id) : undefined,
    marketId: row.market_id ? String(row.market_id) : undefined,
    selection: String(row.selection),
    odds: Number(row.odds) || 0,
    impliedProbability: row.implied_probability ? Number(row.implied_probability) : undefined,
    liquidity: row.liquidity ? Number(row.liquidity) : undefined,
    volume24h: row.volume_24h ? Number(row.volume_24h) : undefined,
    source: String(row.source),
    capturedAt: String(row.captured_at),
  };
}

export interface CreateOddsSnapshotInput {
  betId?: string;
  matchId?: string;
  marketId?: string;
  selection: string;
  odds: number;
  impliedProbability?: number;
  liquidity?: number;
  volume24h?: number;
  source: string;
}

export class OddsSnapshotRepository {
  getById(id: string): OddsSnapshot | undefined {
    const row = queryOne<Record<string, unknown>>(`SELECT * FROM odds_snapshots WHERE id = ?`, id);
    return row ? mapSnapshot(row) : undefined;
  }

  getByBetId(betId: string): OddsSnapshot[] {
    return query<Record<string, unknown>>(
      `SELECT * FROM odds_snapshots WHERE bet_id = ? ORDER BY captured_at ASC`,
      betId,
    ).map(mapSnapshot);
  }

  getByBetContext(matchId?: string, marketId?: string, selection?: string): OddsSnapshot[] {
    if (matchId && marketId && selection) {
      return query<Record<string, unknown>>(
        `SELECT * FROM odds_snapshots WHERE match_id = ? AND market_id = ? AND selection = ? ORDER BY captured_at DESC`,
        matchId,
        marketId,
        selection,
      ).map(mapSnapshot);
    }
    return query<Record<string, unknown>>(
      `SELECT * FROM odds_snapshots ORDER BY captured_at DESC LIMIT 200`,
    ).map(mapSnapshot);
  }

  create(input: CreateOddsSnapshotInput): OddsSnapshot {
    const snapshot: OddsSnapshot = {
      id: `osnap-${randomUUID()}`,
      betId: input.betId,
      matchId: input.matchId,
      marketId: input.marketId,
      selection: input.selection,
      odds: input.odds,
      impliedProbability: input.impliedProbability,
      liquidity: input.liquidity,
      volume24h: input.volume24h,
      source: input.source,
      capturedAt: new Date().toISOString(),
    };

    query(
      `INSERT INTO odds_snapshots (
        id, bet_id, match_id, market_id, selection, odds, implied_probability,
        liquidity, volume_24h, source, captured_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      snapshot.id,
      snapshot.betId ?? null,
      snapshot.matchId ?? null,
      snapshot.marketId ?? null,
      snapshot.selection,
      snapshot.odds,
      snapshot.impliedProbability ?? null,
      snapshot.liquidity ?? null,
      snapshot.volume24h ?? null,
      snapshot.source,
      snapshot.capturedAt,
    );

    return snapshot;
  }
}
