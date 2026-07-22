import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { BetReviewRepository, closeDb, runMigrations } from '@polyrader/infra';
import { AnalysisRunService } from '../services/analysis-run-service';
import { PerformanceService } from '../services/performance-service';
import { SettlementService } from '../services/settlement-service';
import { SimBetService } from '../services/sim-bet-service';
import { PaperPolicyService } from '../services/paper-policy-service';

const testDbPath = path.join(process.cwd(), 'data', 'performance-loop-test.db');

describe('paper_bet → sim_bet → settle → performance', () => {
  beforeEach(() => {
    closeDb();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    process.env.DATABASE_URL = testDbPath;
    runMigrations();
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    delete process.env.DATABASE_URL;
  });

  it('places linked sim bets and closes the PnL/Brier loop after settlement', () => {
    new PaperPolicyService().upsert({
      name: 'low-edge',
      isActive: true,
      policy: {
        policyVersion: 'paper-v1-low-edge',
        minimumEdge: 0.01,
      },
    });

    const detail = new AnalysisRunService().runCs2FixturePipeline({
      provider: 'fixture',
      model: 'perf-loop',
      nonce: 'perf1',
    });
    expect(detail.decision?.action).toBe('paper_bet');

    const linked = new SimBetService().getBetByRunId(detail.run.runId);
    expect(linked).toBeTruthy();
    expect(linked!.bet.runId).toBe(detail.run.runId);
    expect(linked!.bet.modelProbability).toBeTruthy();

    const settled = new SettlementService().settleBet(linked!.bet.id, 'won');
    expect(settled.status).toBe('settled');
    expect(settled.pnl).toBeGreaterThan(0);

    const review = new BetReviewRepository().getByBetId(settled.id);
    expect(review?.brierScore).toBeTypeOf('number');
    expect(review?.note).toContain(detail.run.runId);

    const summary = new PerformanceService().getSummary();
    expect(summary.settledCount).toBe(1);
    expect(summary.wins).toBe(1);
    expect(summary.totalPnl).toBe(settled.pnl);
    expect(summary.avgBrier).toBeTypeOf('number');
    expect(summary.byGame.some((row) => row.key === 'cs2')).toBe(true);
    expect(summary.byProvider.some((row) => row.key === 'fixture')).toBe(true);
  });
});
