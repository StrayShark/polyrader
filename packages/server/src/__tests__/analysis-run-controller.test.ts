import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { buildDota2FixtureFacts, evaluateDotaAnalysisEligibility } from '@polyrader/core';
import { AnalysisRunController } from '../controllers/analysis-run-controller';
import { AnalysisEligibilityError } from '../services/standard-analysis-service';

describe('AnalysisRunController', () => {
  it('returns structured eligibility evidence when standard execution is blocked', async () => {
    const facts = buildDota2FixtureFacts(new Date());
    const eligibility = evaluateDotaAnalysisEligibility({
      facts,
      marketAlignment: null,
      policy: {
        minimumCompleteness: 0.7,
        maximumFreshnessSeconds: 3_600,
        lowLiquidityThresholdUsd: 1_000,
      },
    });
    const controller = new AnalysisRunController();
    Reflect.set(controller, 'standard', {
      async execute() {
        throw new AnalysisEligibilityError('Dota analysis blocked: MARKET_NOT_ALIGNED', eligibility);
      },
    });
    const app = express();
    app.use(express.json());
    app.post('/api/analysis/execute', (req, res) => void controller.execute(req, res));

    const response = await request(app)
      .post('/api/analysis/execute')
      .send({ game: 'dota2', matchId: facts.externalMatchId });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'ANALYSIS_NOT_ELIGIBLE',
      eligibility: {
        analysisEligible: false,
        paperOrderEligible: false,
        mode: 'blocked',
        reasonCodes: expect.arrayContaining(['MARKET_NOT_ALIGNED']),
      },
    });
  });
});
