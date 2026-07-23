import type { Request, Response } from 'express';
import { getDb, getDbPath } from '@polyrader/infra';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function parseLimit(value: unknown, fallback = 50): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(200, Math.floor(parsed)));
}

function parseOffset(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

export class BackupController {
  /**
   * GET /api/backup/export
   * Exports the entire SQLite database as a downloadable .db file.
   * Uses better-sqlite3's backup() to create a consistent snapshot.
   */
  async exportDatabase(req: Request, res: Response): Promise<void> {
    try {
      const db = getDb();
      const tempPath = path.join(process.cwd(), 'data', `backup-${Date.now()}.db`);

      // Create a consistent backup using SQLite's backup API
      await db.backup(tempPath);

      const stats = fs.statSync(tempPath);
      logger.info('Backup: Database exported', { path: tempPath, size: stats.size });

      res.download(
        tempPath,
        `polyrader-backup-${new Date().toISOString().slice(0, 10)}.db`,
        (err) => {
          // Clean up temp file after download
          try {
            fs.unlinkSync(tempPath);
          } catch {
            /* ignore */
          }
          if (err) {
            logger.warn('Backup: Download transfer error', { error: err.message });
          }
        },
      );
    } catch (err) {
      logger.error('Backup: Export failed', {
        error: (err as Error).message,
        requestId: req.headers['x-request-id'],
      });
      res.status(500).json({ error: 'Database export failed' });
    }
  }

  /**
   * POST /api/backup/import
   * Restores the database from a raw .db file uploaded in the request body.
   * Use with `express.raw({ type: 'application/octet-stream', limit: '256mb' })`.
   */
  async importDatabase(req: Request, res: Response): Promise<void> {
    try {
      const buf = req.body as Buffer;
      if (!Buffer.isBuffer(buf) || buf.length < 16) {
        res
          .status(400)
          .json({ error: 'No database file uploaded (expected application/octet-stream body)' });
        return;
      }

      // Verify the uploaded file is a valid SQLite database
      const sqliteHeader = Buffer.from('SQLite format 3\0');
      if (!buf.subarray(0, 16).equals(sqliteHeader)) {
        res.status(400).json({ error: 'Uploaded file is not a valid SQLite database' });
        return;
      }

      const dbPath = getDbPath();

      // Close current DB connection before replacing the file
      const { closeDb } = await import('@polyrader/infra');
      closeDb();

      // Ensure data dir exists then write the new database file
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      fs.writeFileSync(dbPath, buf);

      logger.info('Backup: Database imported', { path: dbPath, size: buf.length });

      res.json({
        message: 'Database restored successfully. The application will reconnect on next request.',
        restoredAt: new Date().toISOString(),
      });
    } catch (err) {
      logger.error('Backup: Import failed', {
        error: (err as Error).message,
        requestId: req.headers['x-request-id'],
      });
      res.status(500).json({ error: 'Database import failed' });
    }
  }

  /**
   * GET /api/backup/export/json
   * Exports all user tables as a single JSON file.
   */
  async exportJson(req: Request, res: Response): Promise<void> {
    try {
      const db = getDb();
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name!='_migrations' ORDER BY name",
        )
        .all() as { name: string }[];

      const data: Record<string, unknown[]> = {};
      for (const { name: table } of tables) {
        try {
          data[table] = db.prepare(`SELECT * FROM "${table}"`).all();
        } catch {
          data[table] = [];
        }
      }

      const filename = `polyrader-export-${new Date().toISOString().slice(0, 10)}.json`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/json');
      res.json({ generatedAt: new Date().toISOString(), tables: data });
    } catch (err) {
      logger.error('Backup: JSON export failed', {
        error: (err as Error).message,
        requestId: req.headers['x-request-id'],
      });
      res.status(500).json({ error: 'JSON export failed' });
    }
  }

  /**
   * GET /api/backup/export/csv
   * Exports all user tables as a single CSV file with table section markers.
   */
  async exportCsv(req: Request, res: Response): Promise<void> {
    try {
      const db = getDb();
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name!='_migrations' ORDER BY name",
        )
        .all() as { name: string }[];

      const lines: string[] = [];
      for (const { name: table } of tables) {
        const cols = db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[];
        if (cols.length === 0) continue;

        lines.push(`# TABLE: ${table}`);
        lines.push(cols.map((c) => csvEscape(c.name)).join(','));

        const rows = db.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[];
        for (const row of rows) {
          lines.push(cols.map((c) => csvEscape(String(row[c.name] ?? ''))).join(','));
        }
        lines.push('');
      }

      const filename = `polyrader-export-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.send(lines.join('\n'));
    } catch (err) {
      logger.error('Backup: CSV export failed', {
        error: (err as Error).message,
        requestId: req.headers['x-request-id'],
      });
      res.status(500).json({ error: 'CSV export failed' });
    }
  }

  /**
   * GET /api/backup/info
   * Returns database file size and table counts for the backup UI.
   */
  async getBackupInfo(req: Request, res: Response): Promise<void> {
    try {
      const db = getDb();
      const dbPath = getDbPath();

      let fileSize = 0;
      try {
        fileSize = fs.statSync(dbPath).size;
      } catch {
        /* ignore */
      }

      // Count rows in all user tables (excluding internal migrations table)
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name!='_migrations' ORDER BY name",
        )
        .all() as { name: string }[];
      const counts: Record<string, number> = {};
      const tableMeta: Record<string, { lastUpdate: string | null; source: string }> = {};
      for (const { name: table } of tables) {
        try {
          const row = db.prepare(`SELECT COUNT(*) as count FROM "${table}"`).get() as {
            count: number;
          };
          counts[table] = row.count;
        } catch {
          counts[table] = 0;
        }

        // Try to infer last update from common timestamp columns
        let lastUpdate: string | null = null;
        const timeCols = [
          'updated_at',
          'created_at',
          'captured_at',
          'placed_at',
          'settled_at',
          'timestamp',
        ];
        for (const col of timeCols) {
          try {
            const row = db.prepare(`SELECT MAX("${col}") as lastUpdate FROM "${table}"`).get() as {
              lastUpdate: string | null;
            };
            if (row.lastUpdate) {
              lastUpdate = row.lastUpdate;
              break;
            }
          } catch {
            // column may not exist
          }
        }

        tableMeta[table] = {
          lastUpdate,
          source: this.inferTableSource(table),
        };
      }

      const migrationSummary = db
        .prepare('SELECT COUNT(*) AS count, MAX(id) AS latestId FROM _migrations')
        .get() as { count: number; latestId: number | null };
      const latestMigration = migrationSummary.latestId
        ? (db
            .prepare('SELECT name FROM _migrations WHERE id = ?')
            .get(migrationSummary.latestId) as { name: string } | undefined)
        : undefined;

      res.json({
        data: {
          fileSize,
          fileSizeFormatted: `${(fileSize / 1024 / 1024).toFixed(2)} MB`,
          tableCounts: counts,
          tableMeta,
          dbPath: path.basename(dbPath),
          schema: {
            migrationCount: migrationSummary.count,
            latestMigration: latestMigration?.name ?? null,
          },
        },
      });
    } catch (err) {
      logger.error('Backup: Info failed', {
        error: (err as Error).message,
        requestId: req.headers['x-request-id'],
      });
      res.status(500).json({ error: 'Failed to get backup info' });
    }
  }

  /**
   * GET /api/backup/tables/:tableName
   * Returns a read-only, paginated view of one SQLite user table.
   */
  async getTableRows(req: Request, res: Response): Promise<void> {
    try {
      const db = getDb();
      const requestedTable = String(req.params.tableName ?? '');
      const limit = parseLimit(req.query.limit);
      const offset = parseOffset(req.query.offset);
      const search =
        typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name!='_migrations'")
        .all() as { name: string }[];
      const allowed = new Set(tables.map((table) => table.name));
      if (!allowed.has(requestedTable)) {
        res.status(404).json({ error: 'Table not found' });
        return;
      }

      const tableSql = quoteIdentifier(requestedTable);
      const columns = db.prepare(`PRAGMA table_info(${tableSql})`).all() as Array<{
        name: string;
        type: string;
      }>;
      const columnSql =
        columns.length > 0 ? columns.map((col) => quoteIdentifier(col.name)).join(', ') : '*';

      const whereParts: string[] = [];
      const whereParams: unknown[] = [];
      if (search && columns.length > 0) {
        const like = `%${search}%`;
        whereParts.push(
          columns.map((col) => `CAST(${quoteIdentifier(col.name)} AS TEXT) LIKE ?`).join(' OR '),
        );
        whereParams.push(...columns.map(() => like));
      }
      const whereSql = whereParts.length > 0 ? ` WHERE ${whereParts.join(' AND ')}` : '';

      const orderColumn = [
        'updated_at',
        'created_at',
        'captured_at',
        'placed_at',
        'settled_at',
        'timestamp',
        'id',
      ].find((candidate) => columns.some((col) => col.name === candidate));
      const orderSql = orderColumn ? ` ORDER BY ${quoteIdentifier(orderColumn)} DESC` : '';

      const totalRow = db
        .prepare(`SELECT COUNT(*) as count FROM ${tableSql}${whereSql}`)
        .get(...whereParams) as { count: number };
      const rows = db
        .prepare(`SELECT ${columnSql} FROM ${tableSql}${whereSql}${orderSql} LIMIT ? OFFSET ?`)
        .all(...whereParams, limit, offset) as Record<string, unknown>[];

      res.json({
        data: {
          tableName: requestedTable,
          columns: columns.map((col) => ({ name: col.name, type: col.type || 'TEXT' })),
          rows,
          total: totalRow.count,
          limit,
          offset,
          search,
        },
      });
    } catch (err) {
      logger.error('Backup: Table inspect failed', {
        error: (err as Error).message,
        requestId: req.headers['x-request-id'],
      });
      res.status(500).json({ error: 'Failed to inspect table' });
    }
  }

  private inferTableSource(table: string): string {
    if (table.startsWith('sim_') || table === 'bet_reviews' || table === 'odds_snapshots')
      return 'Local practice';
    if (table.includes('polymarket') || table === 'markets' || table === 'market_prices')
      return 'Polymarket';
    if (table.includes('hltv') || table.includes('esports') || table.includes('match'))
      return 'HLTV / GRID';
    if (table.includes('signal') || table.includes('prompt') || table.includes('ai'))
      return 'AI / Signals';
    if (table.includes('whale') || table.includes('wallet')) return 'On-chain';
    return 'Local';
  }

  /**
   * POST /api/backup/cleanup
   * Checkpoint WAL and VACUUM the database to reclaim space.
   */
  async cleanupWal(req: Request, res: Response): Promise<void> {
    try {
      const dbPath = getDbPath();
      const before = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;

      const db = getDb();
      db.prepare('PRAGMA wal_checkpoint(RESTART)').get();
      db.exec('VACUUM');

      const after = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
      logger.info('Backup: WAL cleaned', { before, after, freedBytes: before - after });

      res.json({
        data: { before, after, freedBytes: before - after },
      });
    } catch (err) {
      logger.error('Backup: WAL cleanup failed', {
        error: (err as Error).message,
        requestId: req.headers['x-request-id'],
      });
      res.status(500).json({ error: 'WAL cleanup failed' });
    }
  }
}
