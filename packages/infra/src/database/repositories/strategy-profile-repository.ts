import { randomUUID } from 'crypto';
import { query, queryOne, transaction } from '../connection';
import type {
  StrategyProfile,
  SignalSourceWeights,
  SignalBehaviorWeights,
  SignalRecommendationConfig,
  SignalBacktestSummary,
  StrategyProfileCapitalParams,
  CreateStrategyProfileInput,
  UpdateStrategyProfileInput,
} from '@polyrader/core';

function mapProfile(row: Record<string, unknown>): StrategyProfile {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    name: String(row.name),
    description: row.description ? String(row.description) : undefined,
    sourceWeights: JSON.parse(String(row.source_weights)) as SignalSourceWeights,
    behaviorWeights: JSON.parse(String(row.behavior_weights)) as SignalBehaviorWeights,
    recommendation: JSON.parse(String(row.recommendation)) as SignalRecommendationConfig,
    capitalParams: row.capital_params
      ? (JSON.parse(String(row.capital_params)) as StrategyProfileCapitalParams)
      : undefined,
    lastBacktest: row.last_backtest
      ? (JSON.parse(String(row.last_backtest)) as SignalBacktestSummary)
      : undefined,
    isActive: Number(row.is_active) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export class StrategyProfileRepository {
  list(accountId = 'default'): StrategyProfile[] {
    return query<Record<string, unknown>>(
      `SELECT * FROM strategy_profiles WHERE account_id = ? ORDER BY is_active DESC, updated_at DESC`,
      accountId,
    ).map(mapProfile);
  }

  getById(id: string): StrategyProfile | undefined {
    const row = queryOne<Record<string, unknown>>(`SELECT * FROM strategy_profiles WHERE id = ?`, id);
    return row ? mapProfile(row) : undefined;
  }

  getActive(accountId = 'default'): StrategyProfile | undefined {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM strategy_profiles WHERE account_id = ? AND is_active = 1 LIMIT 1`,
      accountId,
    );
    return row ? mapProfile(row) : undefined;
  }

  create(accountId: string, input: CreateStrategyProfileInput): StrategyProfile {
    const id = `sp-${randomUUID()}`;
    const now = new Date().toISOString();
    const profile: StrategyProfile = {
      id,
      accountId,
      name: input.name,
      description: input.description,
      sourceWeights: input.sourceWeights,
      behaviorWeights: input.behaviorWeights,
      recommendation: input.recommendation,
      capitalParams: input.capitalParams,
      lastBacktest: input.lastBacktest,
      isActive: false,
      createdAt: now,
      updatedAt: now,
    };

    query(
      `INSERT INTO strategy_profiles (
        id, account_id, name, description, source_weights, behavior_weights, recommendation,
        capital_params, last_backtest, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      profile.id,
      profile.accountId,
      profile.name,
      profile.description ?? null,
      JSON.stringify(profile.sourceWeights),
      JSON.stringify(profile.behaviorWeights),
      JSON.stringify(profile.recommendation),
      profile.capitalParams ? JSON.stringify(profile.capitalParams) : null,
      profile.lastBacktest ? JSON.stringify(profile.lastBacktest) : null,
      profile.isActive ? 1 : 0,
      profile.createdAt,
      profile.updatedAt,
    );

    return profile;
  }

  update(id: string, input: UpdateStrategyProfileInput): StrategyProfile {
    const current = this.getById(id);
    if (!current) throw new Error(`StrategyProfile ${id} not found`);

    const merged: StrategyProfile = {
      ...current,
      ...input,
      sourceWeights: input.sourceWeights ?? current.sourceWeights,
      behaviorWeights: input.behaviorWeights ?? current.behaviorWeights,
      recommendation: input.recommendation ?? current.recommendation,
      capitalParams: input.capitalParams !== undefined ? (input.capitalParams ?? undefined) : current.capitalParams,
      lastBacktest: input.lastBacktest !== undefined ? (input.lastBacktest ?? undefined) : current.lastBacktest,
      updatedAt: new Date().toISOString(),
    };

    query(
      `UPDATE strategy_profiles SET
        name = ?,
        description = ?,
        source_weights = ?,
        behavior_weights = ?,
        recommendation = ?,
        capital_params = ?,
        last_backtest = ?,
        updated_at = ?
      WHERE id = ?`,
      merged.name,
      merged.description ?? null,
      JSON.stringify(merged.sourceWeights),
      JSON.stringify(merged.behaviorWeights),
      JSON.stringify(merged.recommendation),
      merged.capitalParams ? JSON.stringify(merged.capitalParams) : null,
      merged.lastBacktest ? JSON.stringify(merged.lastBacktest) : null,
      merged.updatedAt,
      id,
    );

    return merged;
  }

  setActive(id: string, accountId = 'default'): StrategyProfile {
    return transaction(() => {
      query(
        `UPDATE strategy_profiles SET is_active = 0 WHERE account_id = ?`,
        accountId,
      );
      query(
        `UPDATE strategy_profiles SET is_active = 1, updated_at = ? WHERE id = ? AND account_id = ?`,
        new Date().toISOString(),
        id,
        accountId,
      );
      const updated = this.getById(id);
      if (!updated) throw new Error(`StrategyProfile ${id} not found`);
      return updated;
    });
  }

  delete(id: string): void {
    query(`DELETE FROM strategy_profiles WHERE id = ?`, id);
  }
}
