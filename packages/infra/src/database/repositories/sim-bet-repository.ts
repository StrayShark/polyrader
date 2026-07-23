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
    matchFormat: row.match_format ? (String(row.match_format) as 'BO1' | 'BO3' | 'BO5') : undefined,
    matchTier: row.match_tier ? String(row.match_tier) : undefined,
    runId: row.run_id ? String(row.run_id) : undefined,
    reportId: row.report_id ? String(row.report_id) : undefined,
    policyVersion: row.policy_version ? String(row.policy_version) : undefined,
    provider: row.provider ? String(row.provider) : undefined,
    game: row.game ? String(row.game) : undefined,
    marketKind: row.market_kind ? String(row.market_kind) : undefined,
    edgeAtEntry: row.edge_at_entry != null ? Number(row.edge_at_entry) : undefined,
    closingOdds: row.closing_odds != null ? Number(row.closing_odds) : undefined,
    closingProbability:
      row.closing_probability != null ? Number(row.closing_probability) : undefined,
    closingCapturedAt: row.closing_captured_at ? String(row.closing_captured_at) : undefined,
    closingSource: row.closing_source ? String(row.closing_source) : undefined,
    closingBoundaryAt: row.closing_boundary_at ? String(row.closing_boundary_at) : undefined,
    closingLatencySeconds:
      row.closing_latency_seconds != null ? Number(row.closing_latency_seconds) : undefined,
    closingAttemptCount: row.closing_attempt_count != null ? Number(row.closing_attempt_count) : 0,
    closingLastAttemptAt: row.closing_last_attempt_at
      ? String(row.closing_last_attempt_at)
      : undefined,
    clvUnavailableReason: row.clv_unavailable_reason
      ? String(row.clv_unavailable_reason)
      : undefined,
    clv: row.clv != null ? Number(row.clv) : undefined,
    clvStatus: row.clv_status ? (String(row.clv_status) as SimBet['clvStatus']) : 'pending',
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
  runId?: string;
  reportId?: string;
  policyVersion?: string;
  provider?: string;
  game?: string;
  marketKind?: string;
  edgeAtEntry?: number;
  legs: Omit<SimBetLeg, 'id' | 'betId' | 'createdAt'>[];
}

export interface SimBetRiskPolicyLimits {
  maxSingleStake: number;
  maxDailyStake: number;
  maxOpenExposure: number;
  maxGameExposure: number;
  maxProviderExposure: number;
  maxMarketKindExposure: number;
}

export type PaperRiskLimitCode =
  | 'AVAILABLE_BANKROLL_LIMIT'
  | 'SINGLE_STAKE_LIMIT'
  | 'DAILY_STAKE_LIMIT'
  | 'TOTAL_OPEN_EXPOSURE_LIMIT'
  | 'GAME_OPEN_EXPOSURE_LIMIT'
  | 'PROVIDER_OPEN_EXPOSURE_LIMIT'
  | 'MARKET_KIND_OPEN_EXPOSURE_LIMIT';

export class PaperRiskLimitError extends Error {
  constructor(
    public readonly code: PaperRiskLimitCode,
    message: string,
  ) {
    super(message);
    this.name = 'PaperRiskLimitError';
  }
}

export interface SimBetExposureBreakdown {
  dailyStake: number;
  openExposure: number;
  byGame: Array<{ key: string; exposure: number }>;
  byProvider: Array<{ key: string; exposure: number }>;
  byMarketKind: Array<{ key: string; exposure: number }>;
}

export class SimBetRepository {
  getById(id: string): SimBet | undefined {
    const row = queryOne<Record<string, unknown>>(`SELECT * FROM sim_bets WHERE id = ?`, id);
    return row ? mapBet(row) : undefined;
  }

  getByRunId(runId: string): SimBet | undefined {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM sim_bets WHERE run_id = ? ORDER BY placed_at DESC LIMIT 1`,
      runId,
    );
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

  create(
    input: CreateSimBetInput,
    riskLimits?: SimBetRiskPolicyLimits,
  ): { bet: SimBet; legs: SimBetLeg[] } {
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
      runId: input.runId,
      reportId: input.reportId,
      policyVersion: input.policyVersion,
      provider: input.provider ?? 'user',
      game: input.game,
      marketKind: input.marketKind,
      edgeAtEntry: input.edgeAtEntry,
      clvStatus: 'pending',
      placedAt: now,
    };

    return transaction(() => {
      const nextOpenExposure = riskLimits ? this.assertRiskLimits(input, riskLimits) : undefined;
      query(
        `INSERT INTO sim_bets (
          id, account_id, match_id, market_id, bet_type, stake, total_odds,
          implied_probability, user_probability, model_probability, market_probability,
          edge, ev, status, pnl, reasoning, match_format, match_tier,
          run_id, report_id, policy_version, provider, game, market_kind, edge_at_entry,
          clv_status, placed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        bet.runId ?? null,
        bet.reportId ?? null,
        bet.policyVersion ?? null,
        bet.provider ?? 'user',
        bet.game ?? null,
        bet.marketKind ?? null,
        bet.edgeAtEntry ?? null,
        bet.clvStatus ?? 'pending',
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

      if (nextOpenExposure != null) {
        query(
          `UPDATE sim_accounts
           SET open_exposure = ?,
               available_bankroll = MAX(0, current_bankroll - ?),
               updated_at = ?
           WHERE id = ?`,
          nextOpenExposure,
          nextOpenExposure,
          now,
          input.accountId,
        );
      }

      return { bet, legs };
    });
  }

  getExposureBreakdown(accountId: string): SimBetExposureBreakdown {
    const daily = queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(stake), 0) AS total
       FROM sim_bets
       WHERE account_id = ?
         AND julianday(placed_at) >= julianday('now', 'start of day')`,
      accountId,
    );
    const open = queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(stake), 0) AS total
       FROM sim_bets WHERE account_id = ? AND status = 'open'`,
      accountId,
    );
    return {
      dailyStake: Number(daily?.total) || 0,
      openExposure: Number(open?.total) || 0,
      byGame: this.groupOpenExposure(accountId, 'game'),
      byProvider: this.groupOpenExposure(accountId, 'provider'),
      byMarketKind: this.groupOpenExposure(accountId, 'market_kind'),
    };
  }

  recordClosingPrice(
    id: string,
    input: {
      closingOdds: number;
      closingProbability: number;
      closingCapturedAt: string;
      closingSource: string;
      closingBoundaryAt?: string;
      closingLatencySeconds?: number;
      clv: number;
    },
  ): SimBet {
    query(
      `UPDATE sim_bets
       SET closing_odds = ?, closing_probability = ?, closing_captured_at = ?,
           closing_source = ?, closing_boundary_at = ?, closing_latency_seconds = ?,
           clv = ?, clv_status = 'captured', clv_unavailable_reason = NULL
       WHERE id = ?`,
      input.closingOdds,
      input.closingProbability,
      input.closingCapturedAt,
      input.closingSource,
      input.closingBoundaryAt ?? null,
      input.closingLatencySeconds ?? null,
      input.clv,
      id,
    );
    const bet = this.getById(id);
    if (!bet) throw new Error(`SimBet ${id} not found after closing price capture`);
    return bet;
  }

  recordClosingAttempt(
    id: string,
    input: { attemptedAt?: string; boundaryAt?: string } = {},
  ): SimBet {
    const attemptedAt = input.attemptedAt ?? new Date().toISOString();
    query(
      `UPDATE sim_bets
       SET closing_attempt_count = closing_attempt_count + 1,
           closing_last_attempt_at = ?,
           closing_boundary_at = COALESCE(closing_boundary_at, ?)
       WHERE id = ? AND clv_status != 'captured'`,
      attemptedAt,
      input.boundaryAt ?? null,
      id,
    );
    const bet = this.getById(id);
    if (!bet) throw new Error(`SimBet ${id} not found after closing attempt`);
    return bet;
  }

  markClvUnavailable(
    id: string,
    reason = 'NO_RELIABLE_CLOSING_PRICE',
    capturedAt = new Date().toISOString(),
  ): SimBet {
    query(
      `UPDATE sim_bets
       SET clv_status = 'unavailable',
           closing_captured_at = COALESCE(closing_captured_at, ?),
           clv_unavailable_reason = ?
       WHERE id = ? AND clv_status != 'captured'`,
      capturedAt,
      reason,
      id,
    );
    const bet = this.getById(id);
    if (!bet) throw new Error(`SimBet ${id} not found after CLV status update`);
    return bet;
  }

  private assertRiskLimits(input: CreateSimBetInput, limits: SimBetRiskPolicyLimits): number {
    const account = queryOne<{
      current_bankroll: number;
      available_bankroll: number;
      max_single_risk_pct: number;
      max_daily_risk_pct: number;
    }>(
      `SELECT current_bankroll, available_bankroll, max_single_risk_pct, max_daily_risk_pct
       FROM sim_accounts WHERE id = ?`,
      input.accountId,
    );
    if (!account) throw new Error(`Account ${input.accountId} not found`);

    const currentBankroll = Number(account.current_bankroll) || 0;
    const availableBankroll = Number(account.available_bankroll) || 0;
    if (input.stake > availableBankroll) {
      throw new PaperRiskLimitError(
        'AVAILABLE_BANKROLL_LIMIT',
        `Insufficient available bankroll: $${availableBankroll.toFixed(2)}`,
      );
    }

    const singleLimit = Math.min(
      limits.maxSingleStake,
      currentBankroll * Number(account.max_single_risk_pct),
    );
    this.assertWithin(
      input.stake,
      singleLimit,
      'SINGLE_STAKE_LIMIT',
      `Stake $${input.stake.toFixed(2)} exceeds max single risk $${singleLimit.toFixed(2)}`,
    );

    const exposure = this.getExposureBreakdown(input.accountId);
    const accountDailyLimit = currentBankroll * Number(account.max_daily_risk_pct);
    const dailyLimit = Math.min(limits.maxDailyStake, accountDailyLimit);
    this.assertWithin(
      exposure.dailyStake + input.stake,
      dailyLimit,
      'DAILY_STAKE_LIMIT',
      `This bet would exceed max daily stake $${dailyLimit.toFixed(2)}`,
    );
    this.assertWithin(
      exposure.openExposure + input.stake,
      limits.maxOpenExposure,
      'TOTAL_OPEN_EXPOSURE_LIMIT',
      `This bet would exceed total open exposure $${limits.maxOpenExposure.toFixed(2)}`,
    );

    const game = input.game ?? 'unknown';
    const provider = input.provider ?? 'user';
    const marketKind = input.marketKind ?? 'unknown';
    this.assertDimension(
      exposure.byGame,
      game,
      input.stake,
      limits.maxGameExposure,
      'GAME_OPEN_EXPOSURE_LIMIT',
      'game',
    );
    this.assertDimension(
      exposure.byProvider,
      provider,
      input.stake,
      limits.maxProviderExposure,
      'PROVIDER_OPEN_EXPOSURE_LIMIT',
      'provider',
    );
    this.assertDimension(
      exposure.byMarketKind,
      marketKind,
      input.stake,
      limits.maxMarketKindExposure,
      'MARKET_KIND_OPEN_EXPOSURE_LIMIT',
      'market kind',
    );
    return exposure.openExposure + input.stake;
  }

  private assertDimension(
    rows: Array<{ key: string; exposure: number }>,
    key: string,
    stake: number,
    limit: number,
    code: PaperRiskLimitCode,
    label: string,
  ): void {
    const current = rows.find((row) => row.key === key)?.exposure ?? 0;
    this.assertWithin(
      current + stake,
      limit,
      code,
      `This bet would exceed ${label} open exposure $${limit.toFixed(2)} (${key})`,
    );
  }

  private assertWithin(
    value: number,
    limit: number,
    code: PaperRiskLimitCode,
    message: string,
  ): void {
    if (!Number.isFinite(limit) || limit < 0 || value > limit + 1e-8) {
      throw new PaperRiskLimitError(code, message);
    }
  }

  private groupOpenExposure(
    accountId: string,
    column: 'game' | 'provider' | 'market_kind',
  ): Array<{ key: string; exposure: number }> {
    return query<{ key: string; exposure: number }>(
      `SELECT COALESCE(${column}, 'unknown') AS key, COALESCE(SUM(stake), 0) AS exposure
       FROM sim_bets
       WHERE account_id = ? AND status = 'open'
       GROUP BY COALESCE(${column}, 'unknown')
       ORDER BY exposure DESC`,
      accountId,
    ).map((row) => ({ key: String(row.key), exposure: Number(row.exposure) || 0 }));
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
    query(`UPDATE sim_bet_legs SET result = ? WHERE id = ?`, result, id);
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

  listOpenMatchIdsByGame(game: string, limit = 25): string[] {
    return query<{ match_id: string }>(
      `SELECT DISTINCT COALESCE(b.match_id, l.match_id) AS match_id
       FROM sim_bets b
       LEFT JOIN sim_bet_legs l ON l.bet_id = b.id
       WHERE b.status = 'open'
         AND b.game = ?
         AND COALESCE(b.match_id, l.match_id) IS NOT NULL
       ORDER BY b.placed_at ASC
       LIMIT ?`,
      game,
      Math.max(1, Math.min(100, Math.floor(limit))),
    ).map((row) => String(row.match_id));
  }

  listOpenBetsPendingClv(limit = 100): SimBet[] {
    return query<Record<string, unknown>>(
      `SELECT * FROM sim_bets
       WHERE status = 'open' AND clv_status = 'pending'
       ORDER BY placed_at ASC
       LIMIT ?`,
      Math.max(1, Math.min(500, Math.floor(limit))),
    ).map(mapBet);
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
