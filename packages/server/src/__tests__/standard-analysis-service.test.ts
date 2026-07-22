import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { AnalysisRequestEnvelope, NormalizedMatchFacts } from '@polyrader/core';
import { FactRepository, LLMRepository, closeDb, runMigrations } from '@polyrader/infra';
import { StandardAnalysisService } from '../services/standard-analysis-service';

const testDbPath = path.join(process.cwd(), 'data', 'standard-analysis-test.db');

function normalizedFacts(): NormalizedMatchFacts {
  const startsAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
  const observedAt = new Date().toISOString();
  return {
    id: 'nf-standard-cs2',
    game: 'cs2',
    externalMatchId: 'standard-cs2-match',
    eventName: 'Standard Pipeline Cup',
    startsAt,
    format: 'BO3',
    status: 'scheduled',
    mapPool: ['Mirage', 'Nuke'],
    participants: [
      { participantId: 'team-a', side: 'a', name: 'Team A', rating: 1.12, source: 'hltv' },
      { participantId: 'team-b', side: 'b', name: 'Team B', rating: 1.02, source: 'hltv' },
    ],
    players: [],
    sourceLinks: [
      {
        source: 'hltv',
        entityType: 'match',
        externalId: 'standard-cs2-match',
        precedence: 1,
        observedAt,
      },
    ],
    facts: [
      {
        factId: 'team-a-rating',
        entityType: 'team',
        source: 'hltv',
        observedAt,
        field: 'rating',
        value: 1.12,
      },
    ],
    missing: ['lineups'],
    conflictFlags: [],
    completeness: 0.8,
    freshnessSeconds: 60,
    dataSnapshotHash: 'sha256:standard-analysis-test',
    adapterVersion: 'cs2.v1',
  };
}

describe('standard analysis.v1 execution', () => {
  beforeEach(() => {
    closeDb();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    process.env.DATABASE_URL = testDbPath;
    runMigrations();
    new FactRepository().upsertNormalizedMatch(normalizedFacts());
    new LLMRepository().upsertConfig({
      provider: 'openai',
      model: 'mock-standard-v1',
      apiKey: 'encrypted-not-used-by-mock',
      isEnabled: true,
      isConnected: true,
      quotaUsed: 0,
      quotaLimit: 1_000_000,
      costEstimate: 0,
    });
  });

  afterEach(() => {
    closeDb();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    delete process.env.DATABASE_URL;
  });

  it('sends the frozen prompt and persists a validated report and paper order', async () => {
    let sentSystem = '';
    let sentEnvelope: AnalysisRequestEnvelope | undefined;
    let preparedMatchId = '';
    const service = new StandardAnalysisService({
      factPreparation: {
        async prepare(_game, matchId) {
          preparedMatchId = matchId ?? '';
        },
      },
      llm: {
        async completeStandardPrompt(input) {
          sentSystem = input.system;
          sentEnvelope = JSON.parse(input.user) as AnalysisRequestEnvelope;
          return {
            provider: 'openai',
            model: 'mock-standard-v1',
            latencyMs: 15,
            rawResponse: JSON.stringify({
              contractVersion: 'analysis-response.v1',
              runId: sentEnvelope.runId,
              prediction: {
                outcomes: [
                  { outcomeId: 'team-a', probability: 0.62 },
                  { outcomeId: 'team-b', probability: 0.38 },
                ],
              },
              confidence: { score: 0.72, grade: 'high', reasonCodes: ['LINEUPS_MISSING'] },
              recommendation: { action: 'recommend_outcome', outcomeId: 'team-a' },
              evidence: [
                {
                  factIds: ['team-a-rating'],
                  direction: 'supports',
                  impact: 'medium',
                  summary: 'Team A has the stronger supplied rating.',
                },
              ],
              risks: [
                {
                  code: 'LINEUPS_MISSING',
                  severity: 'medium',
                  summary: 'Starting lineups are unavailable.',
                },
              ],
              rationaleSummary:
                'The supplied rating creates a modest Team A edge with lineup uncertainty.',
            }),
          };
        },
      },
    });

    const detail = await service.execute({
      game: 'cs2',
      matchId: 'standard-cs2-match',
      provider: 'openai',
    });

    expect(preparedMatchId).toBe('standard-cs2-match');
    expect(sentSystem).toContain('OUTPUT_SCHEMA:');
    expect(sentEnvelope?.contractVersion).toBe('analysis.v1');
    expect(detail.run.status).toBe('decision_ready');
    expect(detail.run.validationStatus).toBe('valid');
    expect(detail.report?.provider).toBe('openai');
    expect(detail.decision?.action).toBe('paper_bet');
    expect(detail.decision?.reasonCodes).toContain('LOW_LIQUIDITY_STAKE_REDUCED');
    expect(detail.linkedBet?.id).toBeTruthy();
    expect(detail.responses[0].rawResponse).toContain('analysis-response.v1');
  });
});
