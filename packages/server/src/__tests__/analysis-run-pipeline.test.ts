import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { closeDb, runMigrations, AnalysisRunRepository } from '@polyrader/infra';
import { AnalysisRunService, buildCs2AnalysisFixture } from '../services/analysis-run-service';
import { SimBetService } from '../services/sim-bet-service';

const testDbPath = path.join(process.cwd(), 'data', 'analysis-run-test.db');

describe('CS2 analysis.v1 prompt → paper-order', () => {
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

  it('creates reproducible artifacts and a paper bet from a valid CS2 response', () => {
    const service = new AnalysisRunService();
    const detail = service.runCs2FixturePipeline({
      provider: 'fixture',
      model: 'cs2-fixture-v1',
      nonce: 'a1b2',
      now: new Date('2026-07-21T12:00:00.000Z'),
    });

    expect(detail.run.status).toBe('decision_ready');
    expect(detail.run.validationStatus).toBe('valid');
    expect(detail.prompt?.promptHash.startsWith('sha256:')).toBe(true);
    expect(detail.prompt?.systemPrompt).not.toMatch(/api[_-]?key/i);
    expect(detail.responses).toHaveLength(1);
    expect(detail.responses[0].isValid).toBe(true);
    expect(detail.report).not.toBeNull();
    expect(detail.decision?.action).toBe('paper_bet');
    expect(detail.decision?.outcomeId).toBe('navi');
    expect(detail.decision?.stake).toBeGreaterThan(0);
    expect(detail.decision?.edgeAtEntry).toBeCloseTo(0.06, 5);
    expect(detail.events.some((e) => e.stage === 'prompt' && e.status === 'passed')).toBe(true);
    expect(detail.events.some((e) => e.stage === 'validate' && e.status === 'passed')).toBe(true);
    expect(detail.events.some((e) => e.stage === 'decision')).toBe(true);
    expect(detail.events.some((e) => e.stage === 'paper_order' && e.status === 'passed')).toBe(true);

    const linked = new SimBetService().getBetByRunId(detail.run.runId);
    expect(linked?.bet.runId).toBe(detail.run.runId);
    expect(linked?.bet.reportId).toBeTruthy();
    expect(linked?.bet.policyVersion).toBeTruthy();
    expect(linked?.bet.game).toBe('cs2');
    expect(linked?.bet.marketKind).toBeTruthy();
    expect(linked?.bet.edgeAtEntry).toBeCloseTo(0.06, 5);
    expect(linked?.bet.status).toBe('open');
    expect(linked?.bet.stake).toBe(detail.decision?.stake);

    const decisionRow = new AnalysisRunRepository().getPaperDecisionByRun(detail.run.runId);
    expect(decisionRow?.betId).toBe(linked?.bet.id);

    const reloaded = service.getDetail(detail.run.runId);
    expect(reloaded?.report?.runId).toBe(detail.run.runId);
    expect(reloaded?.prompt?.userEnvelopeJson).toBe(detail.prompt?.userEnvelopeJson);
    expect(reloaded?.linkedBet?.id).toBe(linked?.bet.id);
    expect(reloaded?.decisionBetId).toBe(linked?.bet.id);
    expect(reloaded?.linkedBet?.status).toBe('open');
  });

  it('blocks paper orders when the response fails schema validation', () => {
    const service = new AnalysisRunService();
    const detail = service.runCs2FixturePipeline({ invalid: true });

    expect(detail.run.status).toBe('invalid_response');
    expect(detail.run.validationStatus).toBe('invalid');
    expect(detail.report).toBeNull();
    expect(detail.decision).toBeNull();
    expect(detail.responses[0].isValid).toBe(false);
    expect(detail.events.some((e) => e.stage === 'validate' && e.status === 'failed')).toBe(true);
  });

  it('supports manual create + ingest for the CS2 fixture envelope', () => {
    const service = new AnalysisRunService();
    const { envelope, response } = buildCs2AnalysisFixture();
    const created = service.createRun({ envelope, provider: 'manual', model: 'unit' });
    expect(created?.run.status).toBe('prompt_ready');

    const ingested = service.ingestResponse({
      runId: created!.run.runId,
      rawResponse: JSON.stringify(response),
      latencyMs: 10,
    });
    expect(ingested.decision?.action).toBe('paper_bet');
  });
});
