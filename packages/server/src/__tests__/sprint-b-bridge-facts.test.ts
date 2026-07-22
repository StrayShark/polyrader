import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { closeDb, runMigrations } from '@polyrader/infra';
import { AnalysisRunService } from '../services/analysis-run-service';
import { AnalysisV1Bridge } from '../services/analysis-v1-bridge';
import { FactNormalizationService } from '../services/fact-normalization-service';
import { PaperPolicyService } from '../services/paper-policy-service';
import type { LLMAnalysisResult, MatchInfo, Team } from '@polyrader/core';

const testDbPath = path.join(process.cwd(), 'data', 'sprint-b-verify-test.db');

function team(id: string, name: string): Team {
  return {
    teamId: id,
    name,
    logo: '',
    rank: 5,
    region: 'EU',
    players: Array.from({ length: 5 }, (_, i) => ({
      playerId: `${id}-p${i}`,
      name: `P${i}`,
      nickname: `p${i}`,
      rating: 1.1,
      kdRatio: 1,
      headshotPercent: 50,
      mapsPlayed: 20,
      role: 'Rifler',
    })),
    recentForm: { last10Matches: [], winRate: 0.6, streak: 2, averageRating: 1.1 },
    mapPool: { maps: [] },
    headToHead: [],
  };
}

describe('LLM bridge + Validation Lab', () => {
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

  it('bridges a legacy LLM result into analysis.v1 paper decision', () => {
    new PaperPolicyService().upsert({
      name: 'bridge-active',
      isActive: true,
      policy: {
        policyVersion: 'paper.v1.test-bridge',
        minimumEdge: 0.02,
        minimumConfidence: 0.55,
      },
    });

    const bridge = new AnalysisV1Bridge(new AnalysisRunService());
    const match = {
      matchId: 'bridge-1',
      teamA: { teamId: 'navi', name: 'NaVi', logo: '', rank: 1, region: 'EU' },
      teamB: { teamId: 'faze', name: 'FaZe', logo: '', rank: 2, region: 'EU' },
      eventName: 'IEM',
      eventType: 'LAN',
      format: 'BO3',
      scheduledAt: '2026-07-21T20:00:00.000Z',
      status: 'scheduled',
    } as unknown as MatchInfo;
    const result: LLMAnalysisResult = {
      provider: 'openai',
      model: 'gpt-4o',
      winProbability: { teamA: 0.62, teamB: 0.38 },
      confidence: 0.7,
      reasoning: 'NaVi form edge',
      keyFactors: ['form'],
      riskAssessment: 'veto unknown',
      latency: 12,
      tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    };
    const summaries = bridge.persistLegacyResults({
      match,
      teamA: team('navi', 'NaVi'),
      teamB: team('faze', 'FaZe'),
      marketProbA: 0.56,
      results: [result],
    });
    expect(summaries).toHaveLength(1);
    expect(summaries[0].status).toBe('decision_ready');
    expect(summaries[0].decisionAction).toBe('paper_bet');

    const detail = new AnalysisRunService().getDetail(summaries[0].runId);
    expect(detail?.envelope?.policy.minimumEdge).toBe(0.02);
    expect(detail?.envelope?.policy.minimumConfidence).toBe(0.55);
    expect(detail?.linkedBet?.id).toBeTruthy();
  });

  it('repairs a malformed response once then creates a decision', () => {
    const service = new AnalysisRunService();
    const created = service.runCs2FixturePipeline({
      nonce: 'repair1',
      now: new Date('2026-07-21T12:00:00.000Z'),
    });
    // Create a fresh run and ingest broken JSON that can be repaired.
    const detail = service.createRun({
      envelope: {
        ...created.envelope!,
        runId: 'ar_cs2_2395534_match-winner_20260721T120000Z_rep1',
      },
      provider: 'fixture',
      model: 'repair',
    });
    const broken = JSON.stringify({
      contractVersion: 'analysis-response.v1',
      runId: 'wrong',
      stake: 10,
      prediction: { outcomes: [{ outcomeId: 'navi', probability: 0.9 }] },
      confidence: { score: 0.7, grade: 'medium', reasonCodes: [] },
      recommendation: { action: 'recommend_outcome', outcomeId: 'navi' },
      evidence: [{ factIds: ['team-a-rating'], direction: 'supports', impact: 'medium', summary: 'rating' }],
      risks: [],
      rationaleSummary: 'repaired path',
    });
    const ingested = service.ingestResponse({
      runId: detail!.run.runId,
      rawResponse: broken,
      allowRepair: true,
    });
    expect(ingested.run.validationStatus).toBe('repaired');
    expect(ingested.decision).not.toBeNull();
    expect(ingested.events.some((e) => e.stage === 'repair')).toBe(true);
  });

  it('normalizes Dota 2 fixture facts for Validation Lab', () => {
    const service = new FactNormalizationService();
    const { summary, persisted } = service.normalizeGame('dota2', { useFixtureFallback: true });
    expect(persisted.length).toBeGreaterThan(0);
    expect(summary.game).toBe('dota2');
    expect(summary.sampleMatch?.dataSnapshotHash.startsWith('sha256:')).toBe(true);
    expect(summary.stages.some((s) => s.stage === 'fact_normalize')).toBe(true);
  });
});
