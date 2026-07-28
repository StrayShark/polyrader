import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  BetResultAnalysisRequestEnvelope,
  BetResultAnalysisResponseV1,
  LLMProvider,
} from '@polyrader/core';
import { closeDb, runMigrations, SimAccountRepository } from '@polyrader/infra';
import { BetResultAnalysisService } from '../services/bet-result-analysis-service';
import { SimBetService } from '../services/sim-bet-service';

const testDbPath = path.join(process.cwd(), 'data', 'bet-result-analysis-test.db');

describe('bet-review.v1 result analysis', () => {
  beforeEach(() => {
    closeDb();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    process.env.DATABASE_URL = testDbPath;
    runMigrations();
    new SimAccountRepository().getDefault();
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    delete process.env.DATABASE_URL;
  });

  it('freezes, validates, persists, and reuses a standardized result analysis', async () => {
    const bets = new SimBetService();
    const placed = bets.placeBet({
      betType: 'single',
      stake: 25,
      matchId: 'match-result-review',
      marketId: 'market-result-review',
      game: 'cs2',
      marketKind: 'match_winner',
      modelProbability: 0.65,
      marketProbability: 0.5,
      edgeAtEntry: 0.15,
      reasoning: 'analysis.v1 test result review',
      legs: [{
        matchId: 'match-result-review',
        marketId: 'market-result-review',
        selection: 'Spirit',
        odds: 2,
        source: 'test',
      }],
    });
    bets.settleBet(placed.bet.id, 'lost', undefined, 'hltv');

    let calls = 0;
    const service = new BetResultAnalysisService({
      llm: {
        async completeStandardPrompt(input) {
          calls += 1;
          const envelope = JSON.parse(input.user) as BetResultAnalysisRequestEnvelope;
          const response: BetResultAnalysisResponseV1 = {
            contractVersion: 'bet-review-response.v1',
            analysisId: envelope.analysisId,
            betId: envelope.bet.betId,
            verdict: {
              decisionQuality: 'bad_process_bad_result',
              processScore: 0.4,
              confidence: 'medium',
              summary: 'The loss coincided with weak calibration evidence.',
            },
            attribution: {
              primary: 'model',
              factors: [{
                code: 'CALIBRATION_WEAK',
                category: 'model',
                impact: 'negative',
                evidenceIds: ['metric:outcome-quality'],
                summary: 'The supplied Brier Score indicates an overconfident miss.',
              }],
            },
            calibration: {
              brierScore: envelope.metrics.brierScore,
              assessment: 'weak',
              summary: 'The calibrated outcome error was high.',
            },
            priceQuality: {
              closingLineValue: envelope.metrics.closingLineValue,
              assessment: envelope.metrics.closingLineValue === null ? 'unavailable' : 'lost_to_close',
              summary: envelope.metrics.closingLineValue === null
                ? 'No authoritative closing line was supplied.'
                : 'The entry lost value versus close.',
            },
            riskDiscipline: {
              assessment: 'within_policy',
              reasonCodes: ['FIXED_STAKE'],
              summary: 'The supplied stake does not show a policy breach.',
            },
            lessons: [{
              code: 'CALIBRATE_CONFIDENCE',
              priority: 'high',
              action: 'Reduce confidence when supporting evidence is incomplete.',
            }],
            suggestedErrorTags: ['overtrusted_ai'],
            summary: 'The result analysis separates the loss from the quality of the original process.',
          };
          return {
            provider: 'openai' as LLMProvider,
            model: 'test-model',
            rawResponse: JSON.stringify(response),
            latencyMs: 12,
          };
        },
      },
    });

    const artifact = await service.execute({ betId: placed.bet.id });
    expect(artifact.status).toBe('valid');
    expect(artifact.contractVersion).toBe('bet-review.v1');
    expect(artifact.responseSchemaVersion).toBe('bet-review-response.v1');
    expect(artifact.response?.betId).toBe(placed.bet.id);
    expect(artifact.validationErrors).toEqual([]);
    expect(JSON.parse(artifact.inputJson).metrics.brierScore).toBeCloseTo(0.4225, 6);
    expect(JSON.parse(artifact.inputJson).locale).toBe('zh-CN');
    expect(JSON.parse(artifact.outputSchemaJson).additionalProperties).toBe(false);

    const reused = await service.execute({ betId: placed.bet.id });
    expect(reused.id).toBe(artifact.id);
    expect(calls).toBe(1);

    const regenerated = await service.execute({ betId: placed.bet.id, force: true });
    expect(regenerated.id).not.toBe(artifact.id);
    expect(calls).toBe(2);
    expect(service.getLatest(placed.bet.id)?.id).toBe(regenerated.id);
  });

  it('blocks result analysis until the simulated bet is settled', async () => {
    const placed = new SimBetService().placeBet({
      betType: 'single',
      stake: 10,
      legs: [{ selection: 'G2', odds: 1.8 }],
    });
    const service = new BetResultAnalysisService({
      llm: {
        async completeStandardPrompt() {
          throw new Error('provider should not run');
        },
      },
    });
    await expect(service.execute({ betId: placed.bet.id })).rejects.toThrow('must be settled');
  });
});
