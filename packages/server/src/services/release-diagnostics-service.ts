import type {
  EsportsGame,
  ReleaseDiagnosticsBundle,
  ReleaseAuditHistoryEntry,
} from '@polyrader/core';
import { getDb, ReleaseAuditRepository } from '@polyrader/infra';
import { ReleaseGateService } from './release-gate-service';
import { sanitizeDiagnosticValue } from './diagnostic-redaction';

export class ReleaseDiagnosticsService {
  private readonly history: Pick<ReleaseAuditRepository, 'get' | 'list'>;
  private readonly gates: Pick<ReleaseGateService, 'report'>;

  constructor(deps?: {
    history?: Pick<ReleaseAuditRepository, 'get' | 'list'>;
    gates?: Pick<ReleaseGateService, 'report'>;
  }) {
    this.history = deps?.history ?? new ReleaseAuditRepository();
    this.gates = deps?.gates ?? new ReleaseGateService();
  }

  list(game?: EsportsGame, limit = 50): ReleaseAuditHistoryEntry[] {
    return this.history.list({ game, limit });
  }

  get(auditId: string): ReleaseAuditHistoryEntry | undefined {
    return this.history.get(auditId);
  }

  export(limit = 50): ReleaseDiagnosticsBundle {
    const db = getDb();
    const migration = db
      .prepare('SELECT COUNT(*) AS count, MAX(id) AS latestId FROM _migrations')
      .get() as { count: number; latestId: number | null };
    const latest = migration.latestId
      ? (db.prepare('SELECT name FROM _migrations WHERE id = ?').get(migration.latestId) as
          | { name: string }
          | undefined)
      : undefined;
    const tableCount = db
      .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'")
      .get() as { count: number };

    const bundle: ReleaseDiagnosticsBundle = {
      contractVersion: 'release-diagnostics.v1',
      generatedAt: new Date().toISOString(),
      releaseReport: this.gates.report(),
      audits: this.history.list({ limit }),
      database: {
        migrationCount: migration.count,
        latestMigration: latest?.name ?? null,
        tableCount: tableCount.count,
      },
      releaseEnvironment: {
        nodeEnv: process.env.NODE_ENV ?? 'development',
        updaterSigningConfigured: Boolean(process.env.TAURI_SIGNING_PRIVATE_KEY),
        notarizationConfigured: Boolean(
          process.env.APPLE_ID && process.env.APPLE_PASSWORD && process.env.APPLE_TEAM_ID,
        ),
      },
      redaction: {
        omitted: [
          'provider credentials',
          'identity metadata',
          'request identifiers and external links',
          'database paths and database contents',
          'signing and notarization credentials',
        ],
      },
    };
    return sanitizeDiagnosticValue(bundle);
  }
}
