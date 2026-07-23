import { expect, test } from '@playwright/test';

const enabled = process.env.POLYRADER_REAL_SOURCE_E2E === '1';
const expectedStages = [
  'source',
  'facts',
  'market',
  'prompt',
  'response',
  'report',
  'decision',
  'settlement',
  'statistics',
];

test.skip(!enabled, 'Set POLYRADER_REAL_SOURCE_E2E=1 to run Sprint I CS2 current-source tracking');
test.setTimeout(300_000);

test('Sprint I CS2 audit discovers markets and records lifecycle without fabricating settlement', async ({
  request,
}, testInfo) => {
  const marketsBefore = await request.get('/api/markets?limit=50&offset=0');
  expect(marketsBefore.ok()).toBe(true);
  const beforePayload = (await marketsBefore.json()) as {
    data: Array<{ match?: { status?: string; scheduledAt?: string } }>;
  };
  for (const market of beforePayload.data) {
    if (!market.match?.scheduledAt) continue;
    if (market.match.status === 'live') continue;
    const startsAt = Date.parse(market.match.scheduledAt);
    if (!Number.isFinite(startsAt)) continue;
    expect(startsAt).toBeGreaterThanOrEqual(Date.now() - 15 * 60 * 1000);
  }

  const auditResponse = await request.post('/api/validation-lab/release-audits/cs2', {
    data: { executeAnalysis: true },
  });
  expect(auditResponse.ok()).toBe(true);
  const audit = (await auditResponse.json()) as {
    data: {
      auditId: string;
      board: {
        boardState: string;
        sampleMatch?: { externalMatchId: string; startsAt: string };
        stages: Array<{ stage: string; status: string; detail: string }>;
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

  await testInfo.attach('sprint-i-cs2-audit', {
    body: Buffer.from(JSON.stringify(audit.data, null, 2)),
    contentType: 'application/json',
  });

  expect(audit.data.auditId).toMatch(/^ra-/);
  expect(audit.data.gate.currentSource.stages.map((stage) => stage.stage)).toEqual(expectedStages);

  const lifecycleResponse = await request.get('/api/validation-lab/lifecycle/cs2');
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

  await testInfo.attach('sprint-i-cs2-lifecycle', {
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
