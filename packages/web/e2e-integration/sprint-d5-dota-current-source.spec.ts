import { expect, test } from '@playwright/test';

const enabled = process.env.POLYRADER_REAL_SOURCE_E2E === '1';

test.skip(!enabled, 'Set POLYRADER_REAL_SOURCE_E2E=1 to run Sprint D5 Dota current-source tracking');
test.setTimeout(300_000);

test('Sprint D5 Dota audit records lifecycle without fabricating settlement', async ({
  request,
}, testInfo) => {
  const syncResponse = await request.post('/api/esports/sources/dota2/sync');
  expect(syncResponse.ok()).toBe(true);

  const auditResponse = await request.post('/api/validation-lab/release-audits/dota2', {
    data: { executeAnalysis: true },
  });
  expect(auditResponse.ok()).toBe(true);
  const audit = (await auditResponse.json()) as {
    data: {
      auditId: string;
      board: {
        boardState: string;
        completeness: number;
        analysisEligibility?: {
          analysisEligible: boolean;
          paperOrderEligible: boolean;
          mode: string;
          reasonCodes: string[];
        };
      };
      analysis: { status: string; runId?: string; detail: string };
      gate: {
        status: string;
        currentSource: {
          status: string;
          stages: Array<{ stage: string; status: string }>;
          blockers: string[];
        };
      };
    };
  };

  await testInfo.attach('sprint-d5-dota-audit', {
    body: Buffer.from(JSON.stringify(audit.data, null, 2)),
    contentType: 'application/json',
  });

  expect(audit.data.auditId).toMatch(/^ra-/);
  expect(audit.data.gate.currentSource.stages.map((stage) => stage.stage)).toEqual([
    'source',
    'facts',
    'market',
    'prompt',
    'response',
    'report',
    'decision',
    'settlement',
    'statistics',
  ]);

  const lifecycleResponse = await request.get('/api/validation-lab/lifecycle/dota2');
  expect(lifecycleResponse.ok()).toBe(true);
  const lifecycle = (await lifecycleResponse.json()) as {
    data: {
      decisionAction?: string;
      closing: string;
      settlement: string;
      statistics: string;
      nextAction: string;
      betId?: string;
    };
  };

  await testInfo.attach('sprint-d5-dota-lifecycle', {
    body: Buffer.from(JSON.stringify(lifecycle.data, null, 2)),
    contentType: 'application/json',
  });

  if (lifecycle.data.decisionAction === 'paper_bet' && lifecycle.data.betId) {
    expect(['waiting', 'captured', 'unavailable']).toContain(lifecycle.data.closing);
    expect(['waiting', 'settled', 'void']).toContain(lifecycle.data.settlement);
  } else {
    expect(lifecycle.data.closing).toBe('not_applicable');
    expect(lifecycle.data.settlement).toBe('not_applicable');
    expect(lifecycle.data.statistics).toBe('not_applicable');
    expect(lifecycle.data.nextAction.length).toBeGreaterThan(0);
  }

  if (audit.data.gate.currentSource.status === 'passed') {
    expect(audit.data.gate.status).toBe('verified');
  } else {
    expect(audit.data.gate.currentSource.blockers.length).toBeGreaterThan(0);
  }
});
