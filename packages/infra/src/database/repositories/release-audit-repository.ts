import { query, queryOne } from '../connection';
import type {
  EsportsGame,
  ProviderFailureCategory,
  ReleaseAuditHistoryEntry,
} from '@polyrader/core';

export class ReleaseAuditRepository {
  save(entry: ReleaseAuditHistoryEntry): void {
    query(
      `INSERT INTO release_audit_runs (
        audit_id, game, outcome, started_at, finished_at, duration_ms, board_state,
        external_match_id, data_snapshot_hash, sync_status, source_records,
        analysis_status, analysis_run_id, provider, provider_failure_category,
        gate_status, stage_timings_json, blockers_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(audit_id) DO UPDATE SET
        outcome = excluded.outcome,
        finished_at = excluded.finished_at,
        duration_ms = excluded.duration_ms,
        board_state = excluded.board_state,
        external_match_id = excluded.external_match_id,
        data_snapshot_hash = excluded.data_snapshot_hash,
        sync_status = excluded.sync_status,
        source_records = excluded.source_records,
        analysis_status = excluded.analysis_status,
        analysis_run_id = excluded.analysis_run_id,
        provider = excluded.provider,
        provider_failure_category = excluded.provider_failure_category,
        gate_status = excluded.gate_status,
        stage_timings_json = excluded.stage_timings_json,
        blockers_json = excluded.blockers_json`,
      entry.auditId,
      entry.game,
      entry.outcome,
      entry.startedAt,
      entry.finishedAt,
      entry.durationMs,
      entry.boardState,
      entry.externalMatchId ?? null,
      entry.dataSnapshotHash ?? null,
      entry.syncStatus,
      entry.sourceRecords,
      entry.analysisStatus,
      entry.analysisRunId ?? null,
      entry.provider ?? null,
      entry.providerFailure?.category ?? null,
      entry.gateStatus,
      JSON.stringify(entry.stageTimings),
      JSON.stringify(entry.blockers),
    );
  }

  get(auditId: string): ReleaseAuditHistoryEntry | undefined {
    const row = queryOne<Record<string, unknown>>(
      'SELECT * FROM release_audit_runs WHERE audit_id = ?',
      auditId,
    );
    return row ? mapRow(row) : undefined;
  }

  list(options: { game?: EsportsGame; limit?: number } = {}): ReleaseAuditHistoryEntry[] {
    const limit = Math.min(200, Math.max(1, options.limit ?? 50));
    if (options.game) {
      return query<Record<string, unknown>>(
        `SELECT * FROM release_audit_runs
         WHERE game = ? ORDER BY started_at DESC LIMIT ?`,
        options.game,
        limit,
      ).map(mapRow);
    }
    return query<Record<string, unknown>>(
      'SELECT * FROM release_audit_runs ORDER BY started_at DESC LIMIT ?',
      limit,
    ).map(mapRow);
  }
}

function mapRow(row: Record<string, unknown>): ReleaseAuditHistoryEntry {
  const providerFailure = row.provider_failure_category
    ? {
        category: String(row.provider_failure_category) as ProviderFailureCategory,
        detail: 'Provider execution failed; sensitive upstream metadata was omitted.',
      }
    : undefined;
  return {
    auditId: String(row.audit_id),
    game: String(row.game) as EsportsGame,
    outcome: String(row.outcome) as ReleaseAuditHistoryEntry['outcome'],
    startedAt: String(row.started_at),
    finishedAt: String(row.finished_at),
    durationMs: Number(row.duration_ms) || 0,
    boardState: String(row.board_state) as ReleaseAuditHistoryEntry['boardState'],
    externalMatchId: row.external_match_id ? String(row.external_match_id) : undefined,
    dataSnapshotHash: row.data_snapshot_hash ? String(row.data_snapshot_hash) : undefined,
    syncStatus: String(row.sync_status) as ReleaseAuditHistoryEntry['syncStatus'],
    sourceRecords: Number(row.source_records) || 0,
    analysisStatus: String(row.analysis_status) as ReleaseAuditHistoryEntry['analysisStatus'],
    analysisRunId: row.analysis_run_id ? String(row.analysis_run_id) : undefined,
    provider: row.provider ? String(row.provider) : undefined,
    providerFailure,
    gateStatus: String(row.gate_status) as ReleaseAuditHistoryEntry['gateStatus'],
    stageTimings: parseJson(row.stage_timings_json, []),
    blockers: parseJson(row.blockers_json, []),
  };
}

function parseJson<T>(value: unknown, fallback: T): T {
  try {
    return JSON.parse(String(value ?? '')) as T;
  } catch {
    return fallback;
  }
}
