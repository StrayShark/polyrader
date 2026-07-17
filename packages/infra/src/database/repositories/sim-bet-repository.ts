import { randomUUID } from 'crypto';
import { query, queryOne, transaction } from '../connection';
import type { SimBet, SimBetLeg, SimBetStatus, SimBetResult } from '@polyrader/core';

function mapBet(row: Record<string, unknown>): SimBet {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    matchId: row.match_id ? String(row.match_id) : undefined,
    marketId: row.market_id ? String(row.market_id) : undefined,
    betType: String(row.bet_type) as 'single' | 'parlay',
    stake: Number(row.stake) || 0,
    totalOdds: Number(row.total_odds) || 0,
    impliedProbability: row.implied_probability ? Number(row.implied_probability) : undefined,
    userProbability: row.user_probability ? Number(row.user_probability) : undefined,
    modelProbability: row.model_probability ? Number(row.model_probability) : undefined,
    marketProbability: row.market_probability ? Number(row.market_probability) : undefined,
    edge: row.edge ? Number(row.edge) : undefined,
    ev: row.ev ? Number(row.ev) : undefined,
    status: String(row.status) as SimBetStatus,
    result: (row.result ? String(row.result) : null) as SimBetResult,
    pnl: Number(row.pnl) || 0,
    reasoning: row.reasoning ? String(row.reasoning) : undefined,
    matchFormat: row.match_format ? String(row.match_format) as 'BO1' | 'BO3' | 'BO5' : undefined,
    matchTier: row.match_tier ? String(row.match_tier) : undefined,
    placedAt: String(row.placed_at),
    settledAt: row.settled_at ? String(row.settled_at) : undefined,
  };
}

function mapLeg(row: Record<string, unknown>): SimBetLeg {
  return {
    id: String(row.id),
    betId: String(row.bet_id),
    matchId: row.match_id ? String(row.match_id) : undefined,
    marketId: row.market_id ? String(row.market_id) : undefined,
    selection: String(row.selection),
    odds: Number(row.odds) || 0,
    impliedProbability: row.implied_probability ? Number(row.implied_probability) : undefined,
    source: row.source ? String(row.source) : undefined,
    createdAt: String(row.created_at),
    result: (row.result ? String(row.result) : null) as SimBetResult,
  };
}

export interface CreateSimBetInput {
  accountId: string;
  matchId?: string;
  marketId?: string;
  betType: 'single' | 'parlay';
  stake: number;
  totalOdds: number;
  impliedProbability?: number;
  userProbability?: number;
  modelProbability?: number;
  marketProbability?: number;
  edge?: number;
  ev?: number;
  reasoning?: string;
  matchFormat?: 'BO1' | 'BO3' | 'BO5' | null;
  matchTier?: string | null;
  legs: Omit<SimBetLeg, 'id' | 'betId' | 'createdAt'>[];
}

export class SimBetRepository {
  getById(id: string): SimBet | undefined {
    const row = queryOne<Record<string, unknown>>(`SELECT * FROM sim_bets WHERE id = ?`, id);
    return row ? mapBet(row) : undefined;
  }

  getByAccount(accountId: string, status?: SimBetStatus): SimBet[] {
    if (status) {
      return query<Record<string, unknown>>(
        `SELECT * FROM sim_bets WHERE account_id = ? AND status = ? ORDER BY placed_at DESC`,
        accountId,
        status,
      ).map(mapBet);
    }
    return query<Record<string, unknown>>(
      `SELECT * FROM sim_bets WHERE account_id = ? ORDER BY placed_at DESC`,
      accountId,
    ).map(mapBet);
  }

  getLegs(betId: string): SimBetLeg[] {
    return query<Record<string, unknown>>(
      `SELECT * FROM sim_bet_legs WHERE bet_id = ? ORDER BY created_at ASC`,
      betId,
    ).map(mapLeg);
  }

  getWithLegs(id: string): { bet: SimBet; legs: SimBetLeg[] } | undefined {
    const bet = this.getById(id);
    if (!bet) return undefined;
    return { bet, legs: this.getLegs(id) };
  }

  create(input: CreateSimBetInput): { bet: SimBet; legs: SimBetLeg[] } {
    const betId = `sbet-${randomUUID()}`;
    const now = new Date().toISOString();

    const bet: SimBet = {
      id: betId,
      accountId: input.accountId,
      matchId: input.matchId,
      marketId: input.marketId,
      betType: input.betType,
      stake: input.stake,
      totalOdds: input.totalOdds,
      impliedProbability: input.impliedProbability,
      userProbability: input.userProbability,
      modelProbability: input.modelProbability,
      marketProbability: input.marketProbability,
      edge: input.edge,
      ev: input.ev,
      status: 'open',
      result: null,
      pnl: 0,
      reasoning: input.reasoning,
      matchFormat: input.matchFormat,
      matchTier: input.matchTier,
      placedAt: now,
    };

    return transaction(() => {
      query(
        `INSERT INTO sim_bets (
          id, account_id, match_id, market_id, bet_type, stake, total_odds,
          implied_probability, user_probability, model_probability, market_probability,
          edge, ev, status, pnl, reasoning, match_format, match_tier, placed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        bet.id,
        bet.accountId,
        bet.matchId ?? null,
        bet.marketId ?? null,
        bet.betType,
        bet.stake,
        bet.totalOdds,
        bet.impliedProbability ?? null,
        bet.userProbability ?? null,
        bet.modelProbability ?? null,
        bet.marketProbability ?? null,
        bet.edge ?? null,
        bet.ev ?? null,
        bet.status,
        bet.pnl,
        bet.reasoning ?? null,
        bet.matchFormat ?? null,
        bet.matchTier ?? null,
        bet.placedAt,
      );

      const legs: SimBetLeg[] = input.legs.map((leg) => ({
        id: `sleg-${randomUUID()}`,
        betId,
        matchId: leg.matchId,
        marketId: leg.marketId,
        selection: leg.selection,
        odds: leg.odds,
        impliedProbability: leg.impliedProbability,
        source: leg.source,
        createdAt: now,
        result: null,
      }));

      for (const leg of legs) {
        query(
          `INSERT INTO sim_bet_legs (
            id, bet_id, match_id, market_id, selection, odds, implied_probability, source, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          leg.id,
          leg.betId,
          leg.matchId ?? null,
          leg.marketId ?? null,
          leg.selection,
          leg.odds,
          leg.impliedProbability ?? null,
          leg.source ?? null,
          leg.createdAt,
        );
      }

      return { bet, legs };
    });
  }

  settle(id: string, result: SimBetResult, pnl: number): SimBet {
    const settledAt = new Date().toISOString();
    query(
      `UPDATE sim_bets SET status = 'settled', result = ?, pnl = ?, settled_at = ? WHERE id = ?`,
      result,
      pnl,
      settledAt,
      id,
    );
    const bet = this.getById(id);
    if (!bet) throw new Error(`SimBet ${id} not found after settle`);
    return bet;
  }

  void(id: string): SimBet {
    const settledAt = new Date().toISOString();
    query(
      `UPDATE sim_bets SET status = 'voided', result = 'push', pnl = 0, settled_at = ? WHERE id = ?`,
      settledAt,
      id,
    );
    const bet = this.getById(id);
    if (!bet) throw new Error(`SimBet ${id} not found after void`);
    return bet;
  }

  settleLeg(id: string, result: SimBetResult): SimBetLeg {
    query(
      `UPDATE sim_bet_legs SET result = ? WHERE id = ?`,
      result,
      id,
    );
    const leg = queryOne<Record<string, unknown>>(`SELECT * FROM sim_bet_legs WHERE id = ?`, id);
    if (!leg) throw new Error(`SimBetLeg ${id} not found after settle`);
    return mapLeg(leg);
  }

  getOpenBetsWithLegsForMatch(matchId: string): Array<{ bet: SimBet; legs: SimBetLeg[] }> {
    const rows = query<Record<string, unknown>>(
      `SELECT DISTINCT b.*
       FROM sim_bets b
       JOIN sim_bet_legs l ON l.bet_id = b.id
       WHERE b.status = 'open' AND l.match_id = ?
       ORDER BY b.placed_at ASC`,
      matchId,
    );
    return rows.map((row) => {
      const bet = mapBet(row);
      return { bet, legs: this.getLegs(bet.id) };
    });
  }

  getOpenBetsTotalExposure(accountId: string): number {
    const row = queryOne<Record<string, unknown>>(
      `SELECT COALESCE(SUM(stake), 0) as total FROM sim_bets WHERE account_id = ? AND status = 'open'`,
      accountId,
    );
    return Number(row?.total) || 0;
  }

  getTodayPnl(accountId: string): number {
    const row = queryOne<Record<string, unknown>>(
      `SELECT COALESCE(SUM(pnl), 0) as total FROM sim_bets
       WHERE account_id = ? AND settled_at >= date('now', 'start of day')`,
      accountId,
    );
    return Number(row?.total) || 0;
  }

  getBetsWithLegs(accountId: string, status?: SimBetStatus): { bet: SimBet; legs: SimBetLeg[] }[] {
    const bets = this.getByAccount(accountId, status);
    return bets.map((bet) => ({ bet, legs: this.getLegs(bet.id) }));
  }

  getAllBets(accountId: string): SimBet[] {
    return query<Record<string, unknown>>(
      `SELECT * FROM sim_bets WHERE account_id = ? ORDER BY placed_at DESC`,
      accountId,
    ).map(mapBet);
  }
}
