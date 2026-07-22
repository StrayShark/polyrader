import type {
  AnalysisReport,
  AnalysisRequestEnvelope,
  AnalysisResponseV1,
  PaperDecisionResult,
} from '@polyrader/core/browser';

export type ReportTab = 'report' | 'prompt' | 'response' | 'timeline';

export interface AnalysisReportViewModel {
  runId: string;
  reportId: string;
  status: string;
  validationStatus: string;
  provider: string;
  model: string;
  envelope: AnalysisRequestEnvelope;
  response: AnalysisResponseV1;
  report: AnalysisReport;
  decision: PaperDecisionResult;
  linkedBet: {
    id: string;
    status: string;
    result: string | null;
    stake: number;
    pnl: number;
    edgeAtEntry?: number;
    policyVersion?: string;
    game?: string;
    marketKind?: string;
    placedAt: string;
    settledAt?: string;
  } | null;
  decisionBetId: string | null;
  events: Array<{
    stage: string;
    status: string;
    detail: string;
    createdAt: string;
  }>;
  promptArtifact: {
    systemPrompt: string;
    userEnvelopeJson: string;
    outputSchemaJson: string;
    promptHash: string;
  };
  rawResponse: string;
}

const RUN_ID = 'ar_cs2_2395534_match-winner_20260721T120000Z_a1b2';

const envelope: AnalysisRequestEnvelope = {
  contractVersion: 'analysis.v1',
  runId: RUN_ID,
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
    dataSnapshotHash: 'sha256:cs2-fixture-navi-faze',
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
      {
        factId: 'lineup-confirmed',
        entityType: 'match',
        source: 'liquipedia',
        observedAt: '2026-07-21T11:30:00.000Z',
        field: 'lineup_confirmed',
        value: true,
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

const response: AnalysisResponseV1 = {
  contractVersion: 'analysis-response.v1',
  runId: RUN_ID,
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
      summary: 'NaVi has the stronger recent rating sample.',
    },
    {
      factIds: ['team-a-mirage'],
      direction: 'supports',
      impact: 'medium',
      summary: 'Mirage map sample favors NaVi.',
    },
    {
      factIds: ['lineup-confirmed'],
      direction: 'supports',
      impact: 'low',
      summary: 'Both starting lineups are confirmed.',
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

const decision: PaperDecisionResult = {
  action: 'paper_bet',
  reasonCodes: ['PAPER_ORDER_CREATED'],
  outcomeId: 'navi',
  modelProbability: 0.62,
  marketProbability: 0.56,
  edgeAtEntry: 0.06,
  stake: 25,
  price: 1.7857,
  policyVersion: 'paper.v1.0.0',
};

const report: AnalysisReport = {
  id: 'rp_01J4X8A5',
  runId: RUN_ID,
  game: 'cs2',
  matchId: '2395534',
  marketId: 'market-1',
  marketKind: 'match_winner',
  contractVersion: 'analysis.v1',
  promptVersion: 'cs2.match-winner.v1.0.0',
  provider: 'fixture',
  model: 'cs2-fixture-v1',
  dataQuality: {
    completeness: 0.88,
    freshnessSeconds: 1800,
    missing: ['veto'],
  },
  prediction: response.prediction,
  confidence: response.confidence,
  recommendation: response.recommendation,
  evidence: response.evidence,
  risks: response.risks,
  rationaleSummary: response.rationaleSummary,
  marketComparison: [
    {
      outcomeId: 'navi',
      label: 'Natus Vincere',
      modelProbability: 0.62,
      marketProbability: 0.56,
      edge: 0.06,
    },
    {
      outcomeId: 'faze',
      label: 'FaZe Clan',
      modelProbability: 0.38,
      marketProbability: 0.44,
      edge: -0.06,
    },
  ],
  decision: {
    action: decision.action,
    reasonCodes: decision.reasonCodes,
  },
  audit: {
    validationStatus: 'valid',
    repairCount: 0,
    latencyMs: 42,
    tokenUsage: { promptTokens: 1200, completionTokens: 380, totalTokens: 1580 },
    generatedAt: '2026-07-21T12:00:05.842Z',
  },
};

export const CS2_ANALYSIS_REPORT_FIXTURE: AnalysisReportViewModel = {
  runId: RUN_ID,
  reportId: report.id,
  status: 'decision_ready',
  validationStatus: 'valid',
  provider: 'fixture',
  model: 'cs2-fixture-v1',
  envelope,
  response,
  report,
  decision,
  decisionBetId: 'sbet-fixture-navi-faze',
  linkedBet: {
    id: 'sbet-fixture-navi-faze',
    status: 'open',
    result: null,
    stake: 25,
    pnl: 0,
    edgeAtEntry: 0.06,
    policyVersion: 'paper.v1.0.0',
    game: 'cs2',
    marketKind: 'match_winner',
    placedAt: '2026-07-21T12:00:05.900Z',
  },
  events: [
    {
      stage: 'prompt',
      status: 'passed',
      detail: 'Prompt artifact frozen',
      createdAt: '2026-07-21T12:00:00.031Z',
    },
    {
      stage: 'provider',
      status: 'passed',
      detail: 'Provider response received',
      createdAt: '2026-07-21T12:00:05.812Z',
    },
    {
      stage: 'validate',
      status: 'passed',
      detail: 'Schema and evidence validated',
      createdAt: '2026-07-21T12:00:05.826Z',
    },
    {
      stage: 'decision',
      status: 'passed',
      detail: 'Paper policy accepted · $25.00',
      createdAt: '2026-07-21T12:00:05.842Z',
    },
  ],
  promptArtifact: {
    systemPrompt:
      'You are an esports probability analyst operating inside a local simulated-betting training tool.',
    userEnvelopeJson: JSON.stringify(envelope, null, 2),
    outputSchemaJson: '{"contractVersion":"analysis-response.v1"}',
    promptHash: 'sha256:cs2-fixture-prompt',
  },
  rawResponse: JSON.stringify(response, null, 2),
};

export function mapAnalysisRunDetailToViewModel(detail: {
  run: {
    runId: string;
    status: string;
    validationStatus: string;
    provider: string | null;
    model: string | null;
  };
  prompt: {
    systemPrompt: string;
    userEnvelopeJson: string;
    outputSchemaJson: string;
    promptHash: string;
  } | null;
  responses: Array<{
    rawResponse: string;
    normalizedResponseJson: string | null;
    isValid: boolean;
  }>;
  events: Array<{ stage: string; status: string; detail: string; createdAt: string }>;
  report: AnalysisReport | null;
  decision: PaperDecisionResult | null;
  envelope: AnalysisRequestEnvelope | null;
  linkedBet?: AnalysisReportViewModel['linkedBet'];
  decisionBetId?: string | null;
}): AnalysisReportViewModel | null {
  if (!detail.envelope || !detail.report || !detail.decision || !detail.prompt) return null;
  const latest = detail.responses[detail.responses.length - 1];
  let responseBody: AnalysisResponseV1 = CS2_ANALYSIS_REPORT_FIXTURE.response;
  if (latest?.normalizedResponseJson) {
    try {
      responseBody = JSON.parse(latest.normalizedResponseJson) as AnalysisResponseV1;
    } catch {
      /* keep fixture fallback shape */
    }
  }
  return {
    runId: detail.run.runId,
    reportId: detail.report.id,
    status: detail.run.status,
    validationStatus: detail.run.validationStatus,
    provider: detail.run.provider ?? 'unknown',
    model: detail.run.model ?? 'unknown',
    envelope: detail.envelope,
    response: responseBody,
    report: detail.report,
    decision: detail.decision,
    linkedBet: detail.linkedBet ?? null,
    decisionBetId: detail.decisionBetId ?? detail.linkedBet?.id ?? null,
    events: detail.events,
    promptArtifact: detail.prompt,
    rawResponse: latest?.rawResponse ?? JSON.stringify(responseBody, null, 2),
  };
}
