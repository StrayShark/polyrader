import type {
  EsportsGame,
  EsportsSourceEntityType,
  EsportsSourceSnapshot,
  EsportsSourceSyncResult,
} from '@polyrader/core';
import { query, queryOne, transaction } from '../connection';

export class EsportsSourceRepository {
  upsertSnapshots(snapshots: EsportsSourceSnapshot[]): number {
    if (snapshots.length === 0) return 0;
    transaction(() => {
      for (const snapshot of snapshots) {
        query(
          `INSERT INTO esports_source_snapshots
            (game, source, entity_type, external_id, name, starts_at, status, payload, observed_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(game, source, entity_type, external_id) DO UPDATE SET
             name = excluded.name,
             starts_at = excluded.starts_at,
             status = excluded.status,
             payload = excluded.payload,
             observed_at = excluded.observed_at,
             updated_at = datetime('now')`,
          snapshot.game,
          snapshot.source,
          snapshot.entityType,
          snapshot.externalId,
          snapshot.name,
          snapshot.startsAt ?? null,
          snapshot.status ?? '',
          JSON.stringify(snapshot.payload),
          snapshot.observedAt,
        );
      }
    });
    return snapshots.length;
  }

  listSnapshots(game: EsportsGame, options: { entityType?: EsportsSourceEntityType; limit?: number } = {}): EsportsSourceSnapshot[] {
    const limit = clamp(options.limit ?? 50, 1, 200);
    const rows = options.entityType
      ? query<Record<string, unknown>>(
        `SELECT * FROM esports_source_snapshots
         WHERE game = ? AND entity_type = ?
         ORDER BY COALESCE(starts_at, observed_at) DESC LIMIT ?`,
        game,
        options.entityType,
        limit,
      )
      : query<Record<string, unknown>>(
        `SELECT * FROM esports_source_snapshots
         WHERE game = ? ORDER BY COALESCE(starts_at, observed_at) DESC LIMIT ?`,
        game,
        limit,
      );
    return rows.map(mapSnapshot);
  }

  recordSyncRun(result: EsportsSourceSyncResult): void {
    query(
      `INSERT INTO esports_source_sync_runs
        (game, status, records, sources, started_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      result.game,
      result.status,
      result.records,
      JSON.stringify(result.sources),
      result.startedAt,
      result.finishedAt,
    );
  }

  getLatestSyncRun(game: EsportsGame): EsportsSourceSyncResult | null {
    const row = queryOne<Record<string, unknown>>(
      `SELECT * FROM esports_source_sync_runs WHERE game = ? ORDER BY finished_at DESC, id DESC LIMIT 1`,
      game,
    );
    if (!row) return null;
    return {
      game,
      status: String(row.status) as EsportsSourceSyncResult['status'],
      records: Number(row.records) || 0,
      sources: parseJsonArray<EsportsSourceSyncResult['sources'][number]>(row.sources),
      startedAt: String(row.started_at),
      finishedAt: String(row.finished_at),
    };
  }
}

function mapSnapshot(row: Record<string, unknown>): EsportsSourceSnapshot {
  return {
    id: Number(row.id),
    game: String(row.game) as EsportsGame,
    source: String(row.source) as EsportsSourceSnapshot['source'],
    entityType: String(row.entity_type) as EsportsSourceEntityType,
    externalId: String(row.external_id),
    name: String(row.name ?? ''),
    startsAt: row.starts_at ? String(row.starts_at) : undefined,
    status: row.status ? String(row.status) : undefined,
    payload: parseJsonObject(row.payload),
    observedAt: String(row.observed_at),
  };
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(String(value ?? '{}')) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function parseJsonArray<T>(value: unknown): T[] {
  try {
    const parsed = JSON.parse(String(value ?? '[]')) as unknown;
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
