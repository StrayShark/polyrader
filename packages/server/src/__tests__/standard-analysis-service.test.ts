import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  buildDota2FixtureFacts,
  buildLolFixtureFacts,
  type AnalysisRequestEnvelope,
  type NormalizedMatchFacts,
} from '@polyrader/core';
import { FactRepository, LLMRepository, closeDb, runMigrations } from '@polyrader/infra';
import { StandardAnalysisService } from '../services/standard-analysis-service';
import { LocalPracticeMarketService } from '../services/local-practice-market-service';

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
    expect(detail.decision?.reasonCodes).toContain('SYNTHETIC_PRACTICE');
    expect(detail.linkedBet?.id).toBeTruthy();
    expect(detail.responses[0].rawResponse).toContain('analysis-response.v1');
  });

  it('rejects a historical finished match before calling the provider', async () => {
    new FactRepository().upsertNormalizedMatch({
      ...normalizedFacts(),
      id: 'nf-finished-cs2',
      externalMatchId: 'finished-cs2-match',
      startsAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      status: 'finished',
    });
    let providerCalled = false;
    const service = new StandardAnalysisService({
      factPreparation: { async prepare() {} },
      llm: {
        async completeStandardPrompt() {
          providerCalled = true;
          throw new Error('provider must not be called');
        },
      },
    });

    await expect(
      service.execute({ game: 'cs2', matchId: 'finished-cs2-match', provider: 'openai' }),
    ).rejects.toThrow('is not an eligible current pre-match event');
    expect(providerCalled).toBe(false);
  });

  it('blocks incomplete Dota quality before calling the provider', async () => {
    const facts = buildDota2FixtureFacts(new Date());
    const qualityFact = facts.facts.find((fact) => fact.factId === 'dota-data-quality')!;
    const quality = qualityFact.value as {
      sides: Array<{ fields: Array<{ field: string; status: string }> }>;
    };
    quality.sides[1]!.fields.find((field) => field.field === 'hero_pool')!.status = 'missing';
    new FactRepository().upsertNormalizedMatch(facts);
    new LocalPracticeMarketService().ensureForFacts(facts);
    let providerCalled = false;
    const service = new StandardAnalysisService({
      factPreparation: { async prepare() {} },
      dotaMarketDiscovery: { async discoverForFacts() { return emptyDiscovery(); } },
      llm: {
        async completeStandardPrompt() {
          providerCalled = true;
          throw new Error('provider must not be called');
        },
      },
    });

    await expect(
      service.execute({ game: 'dota2', matchId: facts.externalMatchId, provider: 'openai' }),
    ).rejects.toThrow('TEAM_B_HERO_POOL_MISSING');
    expect(providerCalled).toBe(false);
  });

  it('executes a selected Dota handicap through prompt, report, and one paper order', async () => {
    const facts = buildDota2FixtureFacts(new Date());
    facts.format = 'BO3';
    new FactRepository().upsertNormalizedMatch(facts);
    new LocalPracticeMarketService().ensureForFacts(facts);
    let sentEnvelope: AnalysisRequestEnvelope | undefined;
    const service = new StandardAnalysisService({
      factPreparation: { async prepare() {} },
      dotaMarketDiscovery: { async discoverForFacts() { return emptyDiscovery(); } },
      llm: {
        async completeStandardPrompt(input) {
          sentEnvelope = JSON.parse(input.user) as AnalysisRequestEnvelope;
          return {
            provider: 'openai',
            model: 'mock-standard-v1',
            latencyMs: 12,
            rawResponse: JSON.stringify({
              contractVersion: 'analysis-response.v1',
              runId: sentEnvelope.runId,
              prediction: {
                outcomes: sentEnvelope.market.outcomes.map((outcome, index) => ({
                  outcomeId: outcome.outcomeId,
                  probability: index === 0 ? 0.62 : 0.38,
                })),
              },
              confidence: { score: 0.72, grade: 'medium', reasonCodes: ['PRE_MATCH_DRAFT'] },
              recommendation: {
                action: 'recommend_outcome',
                outcomeId: sentEnvelope.market.outcomes[0]!.outcomeId,
              },
              evidence: [
                {
                  factIds: ['dota-data-quality'],
                  direction: 'supports',
                  impact: 'medium',
                  summary: 'Both Dota team snapshots clear the frozen quality gate.',
                },
              ],
              risks: [
                {
                  code: 'PRE_MATCH_DRAFT',
                  severity: 'medium',
                  summary: 'The final draft is unavailable before the series.',
                },
              ],
              rationaleSummary: 'The selected handicap has a fixture-only simulated edge.',
            }),
          };
        },
      },
    });

    const detail = await service.execute({
      game: 'dota2',
      matchId: facts.externalMatchId,
      provider: 'openai',
      market: { marketId: `local-dota2-${facts.externalMatchId}-handicap` },
    });

    expect(sentEnvelope?.market).toMatchObject({
      kind: 'handicap',
      line: -1.5,
      evidenceType: 'synthetic',
      liquidityStatus: 'synthetic',
    });
    expect(detail.report?.marketKind).toBe('handicap');
    expect(detail.report?.marketContext).toMatchObject({
      line: -1.5,
      evidenceType: 'synthetic',
      liquidityStatus: 'synthetic',
    });
    expect(sentEnvelope?.dataSnapshot.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ factId: 'dota-analysis-eligibility' }),
      ]),
    );
    expect(detail.decision?.action).toBe('paper_bet');
    expect(detail.decision?.reasonCodes).toContain('SYNTHETIC_PRACTICE');
    expect(detail.linkedBet?.marketKind).toBe('handicap');
  });

  it('rejects an unknown Dota market id before calling the provider', async () => {
    const facts = buildDota2FixtureFacts(new Date());
    new FactRepository().upsertNormalizedMatch(facts);
    new LocalPracticeMarketService().ensureForFacts(facts);
    let providerCalled = false;
    const service = new StandardAnalysisService({
      factPreparation: { async prepare() {} },
      dotaMarketDiscovery: { async discoverForFacts() { return emptyDiscovery(); } },
      llm: {
        async completeStandardPrompt() {
          providerCalled = true;
          throw new Error('provider must not be called');
        },
      },
    });

    await expect(
      service.execute({
        game: 'dota2',
        matchId: facts.externalMatchId,
        provider: 'openai',
        market: { marketId: 'unknown-market' },
      }),
    ).rejects.toThrow('MARKET_NOT_ALIGNED');
    expect(providerCalled).toBe(false);
  });

  it('blocks incomplete LoL quality before calling the provider', async () => {
    const facts = buildLolFixtureFacts(new Date());
    const qualityFact = facts.facts.find((fact) => fact.factId === 'lol-data-quality')!;
    const quality = qualityFact.value as {
      sides: Array<{ fields: Array<{ field: string; status: string }> }>;
    };
    quality.sides[0]!.fields.find((field) => field.field === 'roster')!.status = 'missing';
    new FactRepository().upsertNormalizedMatch(facts);
    new LocalPracticeMarketService().ensureForFacts(facts);
    let providerCalled = false;
    const service = new StandardAnalysisService({
      factPreparation: { async prepare() {} },
      lolMarketDiscovery: { async discoverForFacts() { return emptyDiscovery(); } },
      llm: {
        async completeStandardPrompt() {
          providerCalled = true;
          throw new Error('provider must not be called');
        },
      },
    });

    await expect(
      service.execute({ game: 'lol', matchId: facts.externalMatchId, provider: 'openai' }),
    ).rejects.toThrow('TEAM_A_ROSTER_MISSING');
    expect(providerCalled).toBe(false);
  });
});

function emptyDiscovery() {
  return { scanned: 0, aligned: 0, marketIds: [], detail: 'fixture' };
}
