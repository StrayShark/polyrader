import { writeFileSync } from 'node:fs';
import { Database as BunDatabase } from 'bun:sqlite';
import { standaloneMigrationSources } from './standalone-migrations';

class StandaloneDatabase {
  private readonly database: BunDatabase;

  constructor(filename: string) {
    this.database = new BunDatabase(filename, { create: true });
  }

  prepare(sql: string) {
    return this.database.prepare(sql);
  }

  exec(sql: string) {
    return this.database.exec(sql);
  }

  pragma(source: string) {
    return this.database.query(`PRAGMA ${source}`).all();
  }

  transaction<T>(fn: () => T): () => T {
    return this.database.transaction(fn);
  }

  async backup(destination: string) {
    writeFileSync(destination, this.database.serialize());
    return { totalPages: 0, remainingPages: 0 };
  }

  close() {
    return this.database.close();
  }
}

const runtime = globalThis as typeof globalThis & {
  __POLYRADER_DATABASE_FACTORY__?: (filename: string) => unknown;
  __POLYRADER_MIGRATION_SOURCES__?: Record<string, string>;
};
runtime.__POLYRADER_DATABASE_FACTORY__ = (filename) => new StandaloneDatabase(filename);
runtime.__POLYRADER_MIGRATION_SOURCES__ = standaloneMigrationSources;

await import('./index');
