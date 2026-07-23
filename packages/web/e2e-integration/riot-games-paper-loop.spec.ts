import { expect, test } from '@playwright/test';

test.describe('LoL and Valorant deterministic paper loops', () => {
  for (const fixture of [
    { game: 'lol', adapterVersion: 'lol.facts.v2', placeholder: 'draft' },
    { game: 'valorant', adapterVersion: 'valorant.facts.v2', placeholder: 'agent_bans' },
  ] as const) {
    test(`${fixture.game} closes normalized facts, paper bet and performance`, async ({
      request,
    }) => {
      const normalizeResponse = await request.post(
        `/api/validation-lab/boards/${fixture.game}/normalize`,
        { data: { fixture: true } },
      );
      expect(normalizeResponse.status()).toBe(201);
      const normalized = (await normalizeResponse.json()) as {
        data: {
          summary: {
            boardState: string;
            completeness: number;
            missing: string[];
            sampleMatch: { adapterVersion: string; players: unknown[]; startsAt: string };
            stages: Array<{ stage: string; status: string }>;
          };
        };
      };
      expect(normalized.data.summary).toMatchObject({
        boardState: 'paper_ready',
        completeness: 1,
      });
      expect(normalized.data.summary.missing).toContain(fixture.placeholder);
      expect(normalized.data.summary.sampleMatch).toMatchObject({
        adapterVersion: fixture.adapterVersion,
      });
      expect(normalized.data.summary.sampleMatch.players).toHaveLength(10);
      expect(Date.parse(normalized.data.summary.sampleMatch.startsAt)).toBeGreaterThan(Date.now());
      expect(
        normalized.data.summary.stages.find((stage) => stage.stage === 'market_align')?.status,
      ).toBe('warning');

      const runResponse = await request.post('/api/analysis/runs/fixture', {
        data: {
          game: fixture.game,
          provider: 'fixture-e2e',
          model: `${fixture.game}-e2e-v1`,
        },
      });
      expect(runResponse.status()).toBe(201);
      const runBody = (await runResponse.json()) as {
        data: {
          run: { validationStatus: string };
          envelope: { contractVersion: string; game: string; promptVersion: string };
          report: { contractVersion: string };
          decision: { action: string; reasonCodes: string[] };
          linkedBet: { id: string; game: string; status: string };
        };
      };
      expect(runBody.data.envelope).toMatchObject({
        contractVersion: 'analysis.v1',
        game: fixture.game,
        promptVersion: `${fixture.game}.match-winner.v1.0.0`,
      });
      expect(runBody.data.run.validationStatus).toBe('valid');
      expect(runBody.data.report.contractVersion).toBe('analysis.v1');
      expect(runBody.data.decision.action).toBe('paper_bet');
      expect(runBody.data.decision.reasonCodes).toContain('LOW_LIQUIDITY_STAKE_REDUCED');
      expect(runBody.data.linkedBet).toMatchObject({ game: fixture.game, status: 'open' });

      const settleResponse = await request.patch(
        `/api/sim/bets/${runBody.data.linkedBet.id}/settle`,
        { data: { result: 'won', settlementSource: 'grid' } },
      );
      expect(settleResponse.ok()).toBe(true);

      const performanceResponse = await request.get('/api/performance/summary');
      expect(performanceResponse.ok()).toBe(true);
      const performance = (await performanceResponse.json()) as {
        data: {
          settledCount: number;
          totalPnl: number;
          equityCurve: unknown[];
          byGame: Array<{ key: string }>;
        };
      };
      expect(performance.data.settledCount).toBeGreaterThanOrEqual(1);
      expect(performance.data.totalPnl).toBeGreaterThan(0);
      expect(performance.data.equityCurve.length).toBeGreaterThanOrEqual(1);
      expect(performance.data.byGame.some((row) => row.key === fixture.game)).toBe(true);
    });
  }
});
