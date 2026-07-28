import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, runMigrations } from '@polyrader/infra';
import { P5VerificationService } from '../services/p5-verification-service';
import { ReleaseGateService } from '../services/release-gate-service';

const testDbPath = path.join(process.cwd(), 'data', 'p5-verification-test.db');

describe('Phase 5 four-board verification', () => {
  beforeEach(() => {
    closeDb();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    process.env.DATABASE_URL = testDbPath;
    process.env.NODE_ENV = 'test';
    runMigrations();
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    delete process.env.DATABASE_URL;
  });

  it('passes fixture and current-source release gates for all four boards', () => {
    const report = new P5VerificationService().verifyAll({ nonce: 'p5-unit' });
    expect(report.releaseReady).toBe(true);
    expect(report.verifiedCount).toBe(4);
    expect(report.blockedCount).toBe(0);
    for (const gate of report.boards) {
      expect(gate.status).toBe('verified');
      expect(gate.fixture.status).toBe('passed');
      expect(gate.currentSource.status).toBe('passed');
    }

    const persisted = new ReleaseGateService().list();
    for (const gate of persisted) {
      expect(gate.status).toBe('verified');
    }
  });
});
