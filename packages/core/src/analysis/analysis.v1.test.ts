import { describe, expect, it } from 'vitest';
import {
  ANALYSIS_SYSTEM_PROMPT,
  buildPromptArtifacts,
  buildRunId,
  decidePaperOrder,
  DEFAULT_PAPER_POLICY,
  hashPromptPackage,
  legacyResultToAnalysisResponse,
  parseAnalysisResponseJson,
  sha256Hex,
  validateAnalysisResponse,
  type AnalysisRequestEnvelope,
  type AnalysisResponseV1,
} from './index';

function buildCs2Fixture(overrides?: Partial<AnalysisRequestEnvelope>): AnalysisRequestEnvelope {
  const base: AnalysisRequestEnvelope = {
    contractVersion: 'analysis.v1',
    runId: 'ar_cs2_2395534_match-winner_20260721T120000Z_a1b2',
    promptVersion: 'cs2.match-winner.v1.0.0',
    game: 'cs2',
    locale: 'zh-CN',
    generatedAt: '2026-07-21T12:00:00.000Z',
    match: {
      matchId: '2395534',
      eventId: 'iem-cologne-2026',
      eventName: 'IEM Cologne',
      startsAt: '2026-07-21T20:00:00.000Z',
      format: 'BO3',
      status: 'scheduled',
      participants: [
        { participantId: 'navi', name: 'Natus Vincere', side: 'a' },
        { participantId: 'faze', name: 'FaZe Clan', side: 'b' },
      ],
    },
    market: {
      marketId: 'market-1',
      kind: 'match_winner',
      line: null,
      outcomes: [
        { outcomeId: 'navi', label: 'Natus Vincere', marketProbability: 0.56 },
        { outcomeId: 'faze', label: 'FaZe Clan', marketProbability: 0.44 },
      ],
      liquidityUsd: 8200,
      observedAt: '2026-07-21T11:59:30.000Z',
    },
    dataSnapshot: {
      dataSnapshotHash: 'sha256:fixture',
      completeness: 0.88,
      freshnessSeconds: 1800,
      facts: [
        {
          factId: 'team-a-rating',
          entityType: 'team',
          source: 'hltv',
          observedAt: '2026-07-21T11:50:00.000Z',
          field: 'rating',
          value: 1.12,
        },
        {
          factId: 'team-a-mirage',
          entityType: 'team',
          source: 'hltv',
          observedAt: '2026-07-21T11:40:00.000Z',
          field: 'map_winrate',
          value: 0.64,
        },
      ],
      missing: ['veto'],
    },
    policy: {
      minimumCompleteness: 0.7,
      maximumFreshnessSeconds: 3600,
      minimumConfidence: 0.6,
      minimumEdge: 0.05,
      lowLiquidityThresholdUsd: 1000,
      allowedActions: ['recommend_outcome', 'pass'],
    },
  };
  return { ...base, ...overrides };
}

function buildValidResponse(envelope: AnalysisRequestEnvelope): AnalysisResponseV1 {
  return {
    contractVersion: 'analysis-response.v1',
    runId: envelope.runId,
    prediction: {
      outcomes: [
        { outcomeId: 'navi', probability: 0.62 },
        { outcomeId: 'faze', probability: 0.38 },
      ],
    },
    confidence: {
      score: 0.68,
      grade: 'medium',
      reasonCodes: ['VETO_UNAVAILABLE'],
    },
    recommendation: {
      action: 'recommend_outcome',
      outcomeId: 'navi',
    },
    evidence: [
      {
        factIds: ['team-a-rating'],
        direction: 'supports',
        impact: 'medium',
        summary: 'NaVi has the stronger recent rating.',
      },
    ],
    risks: [
      {
        code: 'VETO_UNAVAILABLE',
        severity: 'medium',
        summary: 'Map veto is not published yet.',
      },
    ],
    rationaleSummary: 'NaVi has a modest evidence-backed advantage, reduced by veto uncertainty.',
  };
}

describe('analysis.v1 hash', () => {
  it('produces deterministic sha256 hex', () => {
    expect(sha256Hex('polyrader')).toBe(sha256Hex('polyrader'));
    expect(sha256Hex('a')).not.toBe(sha256Hex('b'));
  });

  it('builds stable prompt hashes independent of object key insertion order', () => {
    const envelope = buildCs2Fixture();
    const hashA = hashPromptPackage({
      systemPrompt: ANALYSIS_SYSTEM_PROMPT,
      userEnvelope: envelope,
    });
    const hashB = hashPromptPackage({
      systemPrompt: ANALYSIS_SYSTEM_PROMPT,
      userEnvelope: JSON.parse(JSON.stringify(envelope)) as AnalysisRequestEnvelope,
    });
    expect(hashA).toBe(hashB);
    expect(hashA.startsWith('sha256:')).toBe(true);
  });

  it('serializes optional undefined envelope fields as valid JSON', () => {
    const envelope = buildCs2Fixture();
    envelope.match.eventId = undefined;
    const artifacts = buildPromptArtifacts(envelope);
    expect(() => JSON.parse(artifacts.userEnvelopeJson)).not.toThrow();
    expect(JSON.parse(artifacts.userEnvelopeJson).match).not.toHaveProperty('eventId');
  });

  it('buildRunId follows contract shape', () => {
    const runId = buildRunId({
      game: 'cs2',
      matchId: '2395534',
      marketId: 'match-winner',
      now: new Date('2026-07-21T12:00:00.000Z'),
      nonce: 'a1b2',
    });
    expect(runId).toBe('ar_cs2_2395534_match-winner_20260721T120000Z_a1b2');
  });
});

describe('analysis.v1 validateAnalysisResponse', () => {
  it('accepts a valid CS2 response', () => {
    const envelope = buildCs2Fixture();
    const result = validateAnalysisResponse(buildValidResponse(envelope), envelope);
    expect(result.ok).toBe(true);
    expect(result.value?.recommendation.outcomeId).toBe('navi');
  });

  it('rejects probability sum drift and unknown factIds', () => {
    const envelope = buildCs2Fixture();
    const bad = buildValidResponse(envelope);
    bad.prediction.outcomes = [
      { outcomeId: 'navi', probability: 0.7 },
      { outcomeId: 'faze', probability: 0.4 },
    ];
    bad.evidence[0].factIds = ['missing-fact'];
    const result = validateAnalysisResponse(bad, envelope);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.path.includes('prediction.outcomes'))).toBe(true);
    expect(result.errors.some((e) => e.code === 'EVIDENCE_INVALID')).toBe(true);
  });

  it('rejects forbidden stake fields and mismatched runId', () => {
    const envelope = buildCs2Fixture();
    const raw = {
      ...buildValidResponse(envelope),
      runId: 'wrong',
      stake: 100,
    };
    const result = validateAnalysisResponse(raw, envelope);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.path === 'runId')).toBe(true);
    expect(result.errors.some((e) => e.path === 'stake')).toBe(true);
  });

  it('rejects nested unknown fields, invalid enums, and duplicate outcomes', () => {
    const envelope = buildCs2Fixture();
    const raw = buildValidResponse(envelope) as unknown as Record<string, unknown>;
    const prediction = raw.prediction as { outcomes: Array<Record<string, unknown>> };
    prediction.outcomes = [
      { outcomeId: 'navi', probability: 0.5, stake: 50 },
      { outcomeId: 'navi', probability: 0.5 },
    ];
    const evidence = raw.evidence as Array<Record<string, unknown>>;
    evidence[0].direction = 'maybe';
    evidence[0].debug = true;
    const result = validateAnalysisResponse(raw, envelope);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.path === 'prediction.outcomes[0].stake')).toBe(true);
    expect(result.errors.some((e) => e.message.includes('Duplicate outcomeId'))).toBe(true);
    expect(result.errors.some((e) => e.path === 'evidence[0].direction')).toBe(true);
    expect(result.errors.some((e) => e.path === 'evidence[0].debug')).toBe(true);
  });

  it('parses fenced JSON responses', () => {
    const parsed = parseAnalysisResponseJson('```json\n{"ok":true}\n```');
    expect(parsed).toEqual({ ok: true });
  });
});

describe('analysis.v1 decidePaperOrder', () => {
  it('creates a paper bet when edge and confidence clear the policy', () => {
    const envelope = buildCs2Fixture();
    const response = buildValidResponse(envelope);
    const decision = decidePaperOrder({
      envelope,
      response,
      reportId: 'rp_test',
      settlementRulesAvailable: true,
    });
    expect(decision.action).toBe('paper_bet');
    expect(decision.outcomeId).toBe('navi');
    expect(decision.edgeAtEntry).toBeCloseTo(0.06, 5);
    expect(decision.stake).toBe(DEFAULT_PAPER_POLICY.fixedStake);
  });

  it('rejects when edge is below threshold', () => {
    const envelope = buildCs2Fixture();
    const response = buildValidResponse(envelope);
    response.prediction.outcomes = [
      { outcomeId: 'navi', probability: 0.58 },
      { outcomeId: 'faze', probability: 0.42 },
    ];
    const decision = decidePaperOrder({
      envelope,
      response,
      reportId: 'rp_test',
      settlementRulesAvailable: true,
    });
    expect(decision.action).toBe('rejected');
    expect(decision.reasonCodes).toContain('POLICY_REJECTED_EDGE');
  });

  it('rejects a paper order when the normalized facts are stale', () => {
    const envelope = buildCs2Fixture();
    envelope.dataSnapshot.freshnessSeconds = DEFAULT_PAPER_POLICY.maximumFreshnessSeconds + 1;
    const decision = decidePaperOrder({
      envelope,
      response: buildValidResponse(envelope),
      reportId: 'rp_test',
      settlementRulesAvailable: true,
    });

    expect(decision.action).toBe('rejected');
    expect(decision.reasonCodes).toContain('INPUT_STALE');
    expect(decision.stake).toBe(0);
  });

  it('passes when the model recommends pass', () => {
    const envelope = buildCs2Fixture();
    const response = buildValidResponse(envelope);
    response.recommendation = { action: 'pass', outcomeId: null };
    const decision = decidePaperOrder({
      envelope,
      response,
      reportId: 'rp_test',
    });
    expect(decision.action).toBe('pass');
  });

  it('builds prompt artifacts without secrets', () => {
    const envelope = buildCs2Fixture();
    const artifacts = buildPromptArtifacts(envelope);
    expect(artifacts.systemPrompt).toContain('simulated-betting');
    expect(artifacts.systemPrompt).toContain('OUTPUT_SCHEMA:');
    expect(artifacts.systemPrompt).toContain('analysis-response.v1');
    expect(artifacts.userEnvelopeJson).not.toMatch(/api[_-]?key/i);
    expect(artifacts.promptHash.startsWith('sha256:')).toBe(true);
  });

  it('defaults unstated legacy confidence to 0.6 only for doubao', () => {
    const envelope = buildCs2Fixture();
    const doubao = legacyResultToAnalysisResponse({
      envelope,
      result: {
        provider: 'doubao',
        model: 'test',
        winProbability: { teamA: 0.6, teamB: 0.4 },
        confidence: 0,
        reasoning: 'unstated confidence from provider',
        keyFactors: ['form'],
        riskAssessment: 'n/a',
        latency: 1,
        tokenUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      },
    });
    expect(doubao.confidence.score).toBe(0.6);
    expect(doubao.confidence.reasonCodes).toContain('CONFIDENCE_DEFAULT_UNSTATED');

    const minimax = legacyResultToAnalysisResponse({
      envelope,
      result: {
        provider: 'minimax',
        model: 'test',
        winProbability: { teamA: 0.6, teamB: 0.4 },
        confidence: 0,
        reasoning: 'unstated confidence should stay zero',
        keyFactors: ['form'],
        riskAssessment: 'n/a',
        latency: 1,
        tokenUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      },
    });
    expect(minimax.confidence.score).toBe(0);
    expect(minimax.confidence.reasonCodes).not.toContain('CONFIDENCE_DEFAULT_UNSTATED');
  });
});

export { buildCs2Fixture, buildValidResponse };
