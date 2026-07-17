import { randomUUID } from 'crypto';
import { query, queryOne } from '../connection';
import type {
  TrainingSession,
  TrainingGoalType,
  TrainingGoalTarget,
  TrainingSessionStatus,
  CreateTrainingSessionInput,
  UpdateTrainingSessionInput,
} from '@polyrader/core';

function mapSession(row: Record<string, unknown>): TrainingSession {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    title: String(row.title),
    type: String(row.type) as TrainingGoalType,
    target: JSON.parse(String(row.target)) as TrainingGoalTarget,
    status: String(row.status) as TrainingSessionStatus,
    progress: Number(row.progress) || 0,
    startAt: String(row.start_at),
    endAt: row.end_at ? String(row.end_at) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export class TrainingSessionRepository {
  list(accountId = 'default'): TrainingSession[] {
    return query<Record<string, unknown>>(
      `SELECT * FROM training_sessions WHERE account_id = ? ORDER BY created_at DESC`,
      accountId,
    ).map(mapSession);
  }

  listActive(accountId = 'default'): TrainingSession[] {
    return query<Record<string, unknown>>(
      `SELECT * FROM training_sessions WHERE account_id = ? AND status = 'active' ORDER BY created_at DESC`,
      accountId,
    ).map(mapSession);
  }

  getById(id: string): TrainingSession | undefined {
    const row = queryOne<Record<string, unknown>>(`SELECT * FROM training_sessions WHERE id = ?`, id);
    return row ? mapSession(row) : undefined;
  }

  create(accountId: string, input: CreateTrainingSessionInput): TrainingSession {
    const id = `ts-${randomUUID()}`;
    const now = new Date().toISOString();
    const session: TrainingSession = {
      id,
      accountId,
      title: input.title,
      type: input.type,
      target: input.target,
      status: 'active',
      progress: 0,
      startAt: input.startAt ?? now,
      endAt: input.endAt,
      createdAt: now,
      updatedAt: now,
    };

    query(
      `INSERT INTO training_sessions (
        id, account_id, title, type, target, status, progress, start_at, end_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      session.id,
      session.accountId,
      session.title,
      session.type,
      JSON.stringify(session.target),
      session.status,
      session.progress,
      session.startAt,
      session.endAt ?? null,
      session.createdAt,
      session.updatedAt,
    );

    return session;
  }

  update(id: string, input: UpdateTrainingSessionInput): TrainingSession {
    const current = this.getById(id);
    if (!current) throw new Error(`TrainingSession ${id} not found`);

    const merged: TrainingSession = {
      ...current,
      ...input,
      target: input.target ?? current.target,
      endAt: input.endAt === null ? undefined : (input.endAt ?? current.endAt),
      updatedAt: new Date().toISOString(),
    };

    query(
      `UPDATE training_sessions SET
        title = ?,
        target = ?,
        status = ?,
        progress = ?,
        end_at = ?,
        updated_at = ?
      WHERE id = ?`,
      merged.title,
      JSON.stringify(merged.target),
      merged.status,
      merged.progress,
      merged.endAt ?? null,
      merged.updatedAt,
      id,
    );

    return merged;
  }

  delete(id: string): void {
    query(`DELETE FROM training_sessions WHERE id = ?`, id);
  }
}
