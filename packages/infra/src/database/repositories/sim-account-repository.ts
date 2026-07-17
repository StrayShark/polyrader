import { query, queryOne } from '../connection';
import type { SimAccount } from '@polyrader/core';

function mapAccount(row: Record<string, unknown>): SimAccount {
  return {
    id: String(row.id),
    name: String(row.name),
    initialBankroll: Number(row.initial_bankroll) || 0,
    currentBankroll: Number(row.current_bankroll) || 0,
    availableBankroll: Number(row.available_bankroll) || 0,
    openExposure: Number(row.open_exposure) || 0,
    maxSingleRiskPct: Number(row.max_single_risk_pct) || 0.02,
    maxDailyRiskPct: Number(row.max_daily_risk_pct) || 0.06,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export class SimAccountRepository {
  getDefault(): SimAccount {
    const row = queryOne<Record<string, unknown>>(`SELECT * FROM sim_accounts WHERE id = 'default'`);
    if (!row) {
      query(
        `INSERT OR IGNORE INTO sim_accounts (id, name) VALUES ('default', '练习账户')`,
      );
      const retry = queryOne<Record<string, unknown>>(`SELECT * FROM sim_accounts WHERE id = 'default'`);
      return mapAccount(retry!);
    }
    return mapAccount(row);
  }

  getById(id: string): SimAccount | undefined {
    const row = queryOne<Record<string, unknown>>(`SELECT * FROM sim_accounts WHERE id = ?`, id);
    return row ? mapAccount(row) : undefined;
  }

  update(id: string, updates: Partial<SimAccount>): SimAccount {
    const current = this.getById(id);
    if (!current) throw new Error(`SimAccount ${id} not found`);

    const merged: SimAccount = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    query(
      `UPDATE sim_accounts SET
        name = ?,
        initial_bankroll = ?,
        current_bankroll = ?,
        available_bankroll = ?,
        open_exposure = ?,
        max_single_risk_pct = ?,
        max_daily_risk_pct = ?,
        updated_at = ?
      WHERE id = ?`,
      merged.name,
      merged.initialBankroll,
      merged.currentBankroll,
      merged.availableBankroll,
      merged.openExposure,
      merged.maxSingleRiskPct,
      merged.maxDailyRiskPct,
      merged.updatedAt,
      id,
    );

    return merged;
  }

  updateBankroll(id: string, currentBankroll: number, availableBankroll: number, openExposure: number): SimAccount {
    return this.update(id, { currentBankroll, availableBankroll, openExposure });
  }
}
