import type { Page } from '@playwright/test';

export const SAMPLE_MARKET = {
  conditionId: '0xcs2_1',
  slug: 'spirit-vs-g2-bo3',
  question: 'Counter-Strike: Spirit vs G2 (BO3) - IEM Cologne',
  description: 'IEM Cologne Major Playoffs',
  outcomes: ['Yes', 'No'],
  outcomePrices: ['0.65', '0.35'],
  clobTokenIds: ['token1', 'token2'],
  volume: 50000,
  volume24h: 12000,
  liquidity: 8000,
  endDate: '2026-06-20T00:00:00Z',
  startDate: '2026-06-19T00:00:00Z',
  status: 'active',
  tags: [],
};

const MOCK_SCORED_MATCH = {
  market: SAMPLE_MARKET,
  attentionScore: 85,
  confidenceScore: 72,
  deviationScore: 15,
  volumeScore: 90,
  whaleScore: 40,
  tierScore: 80,
  recommendation: 'high' as const,
  llmPrediction: 0.68,
  llmSource: 'openai',
};

export const MOCK_AGGREGATION = {
  matchId: 'spirit-vs-g2-bo3',
  results: [
    {
      provider: 'openai',
      model: 'gpt-4o',
      winProbability: { teamA: 0.62, teamB: 0.38 },
      confidence: 0.75,
      reasoning: 'Spirit strong form',
      keyFactors: ['map pool', 'recent form'],
      riskAssessment: 'moderate',
      latency: 1200,
      tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    },
  ],
  consensus: {
    level: 'moderate' as const,
    agreementRate: 0.8,
    teamAAvgProb: 0.62,
    teamBAvgProb: 0.38,
    stdDev: 0.05,
    majorityPick: 'team_a' as const,
  },
  kellyAllocation: {
    teamAAllocation: 0.12,
    teamBAllocation: 0.03,
    recommendedBet: 'team_a' as const,
    kellyFraction: 0.08,
    bankrollFraction: 0.05,
  },
  aggregatedProbability: { teamA: 0.62, teamB: 0.38 },
  analysisData: {
    capturedAt: '2026-06-25T10:00:00Z',
    sourceUpdatedAt: '2026-06-25T09:55:00Z',
    source: 'hltv' as const,
    completeness: 1,
    isComplete: true,
    missingFields: [],
    lineupConfirmed: true,
    teamA: analysisTeam('spirit', 'Spirit', 1, ['W', 'W', 'L', 'W', 'W']),
    teamB: analysisTeam('g2', 'G2', 5, ['L', 'W', 'W', 'L', 'W']),
    lineups: {
      teamA: analysisLineup('spirit'),
      teamB: analysisLineup('g2'),
    },
  },
  marketAnalyses: [
    {
      conditionId: '0xcs2_1',
      question: 'Counter-Strike: Spirit vs G2 (BO3) - IEM Cologne',
      kind: 'match_winner' as const,
      line: null,
      liquidity: 8000,
      liquidityThreshold: 1000,
      liquidityStatus: 'normal' as const,
      confidence: 0.75,
      signal: 'aligned' as const,
      outcomes: [
        { selection: 'Spirit', marketProbability: 0.65, modelProbability: 0.62, edge: -0.03 },
        { selection: 'G2', marketProbability: 0.35, modelProbability: 0.38, edge: 0.03 },
      ],
      warnings: [],
    },
    {
      conditionId: '0xcs2_handicap',
      question: 'Counter-Strike: Spirit vs G2 (BO3) - Spirit Handicap -1.5',
      kind: 'handicap' as const,
      line: -1.5,
      liquidity: 2400,
      liquidityThreshold: 1000,
      liquidityStatus: 'normal' as const,
      confidence: 0.6,
      signal: 'model_edge' as const,
      focusOutcome: 'Yes',
      outcomes: [
        { selection: 'Yes', marketProbability: 0.36, modelProbability: 0.45, edge: 0.09 },
        { selection: 'No', marketProbability: 0.64, modelProbability: 0.55, edge: -0.09 },
      ],
      warnings: ['derived_from_series_probability' as const],
    },
    {
      conditionId: '0xcs2_total',
      question: 'Counter-Strike: Spirit vs G2 (BO3) - Total Maps Over/Under 2.5',
      kind: 'total_maps' as const,
      line: 2.5,
      liquidity: 650,
      liquidityThreshold: 1000,
      liquidityStatus: 'low' as const,
      confidence: 0.35,
      signal: 'observe_only' as const,
      outcomes: [
        { selection: 'Over 2.5', marketProbability: 0.48, modelProbability: 0.53, edge: 0.05 },
        { selection: 'Under 2.5', marketProbability: 0.52, modelProbability: 0.47, edge: -0.05 },
      ],
      warnings: ['low_liquidity' as const, 'derived_from_series_probability' as const],
    },
  ],
  generatedAt: '2026-06-25T10:00:00Z',
};

function analysisTeam(teamId: string, name: string, rank: number, form: string[]) {
  return {
    teamId,
    name,
    logo: '',
    rank,
    region: 'EU',
    players: Array.from({ length: 5 }, (_value, index) => ({
      playerId: `${teamId}-p${index}`,
      name: '',
      nickname: `${name} P${index + 1}`,
      rating: 1.05 + index / 100,
      kdRatio: 1.02 + index / 100,
      headshotPercent: 45 + index,
      mapsPlayed: 30 + index,
      role: index === 0 ? 'AWPer' : 'Rifler',
    })),
    recentForm: {
      last10Matches: form.map((result, index) => ({
        opponent: `Opponent ${index + 1}`,
        result: result === 'W' ? 'win' : 'loss',
        score: result === 'W' ? '2-0' : '1-2',
        date: `2026-06-${20 - index}T10:00:00Z`,
        event: 'IEM Cologne',
      })),
      winRate: form.filter((result) => result === 'W').length / form.length,
      streak: form[0] === 'W' ? 2 : 0,
      averageRating: 1.07,
    },
    mapPool: {
      maps: [{ map: 'Mirage', winRate: 0.6, matchesPlayed: 10, roundsWon: 0, roundsLost: 0 }],
    },
    headToHead: [],
  };
}

function analysisLineup(teamId: string) {
  return {
    players: Array.from({ length: 5 }, (_value, index) => ({
      playerId: `${teamId}-p${index}`,
      nickname: `${teamId.toUpperCase()} P${index + 1}`,
      rating: 1.05 + index / 100,
      role: index === 0 ? ('AWPer' as const) : ('Rifler' as const),
      isStandin: false,
      impactScore: 80 + index,
      mapsOnRecord: 30 + index,
    })),
    isConfirmed: true,
    hasStandin: false,
    standinCount: 0,
    missingKeyPlayers: [],
  };
}

const MOCK_BACKTEST = {
  sampleSize: 42,
  resolvedMarkets: 18,
  minEdge: 0.05,
  bestBrierSource: 'prediction_model',
  bestRoiSource: 'final',
  generatedAt: '2026-06-25T10:00:00Z',
  metrics: [
    {
      source: 'prediction_model',
      label: 'Prediction Model',
      sampleSize: 42,
      brierScore: 0.18,
      accuracy: 0.64,
      calibrationError: 0.05,
      avgPredicted: 0.58,
      actualRate: 0.62,
      bets: 30,
      wins: 19,
      losses: 11,
      totalPnl: 120,
      roi: 0.12,
      maxDrawdown: 0.08,
      avgEdge: 0.07,
      buckets: [],
    },
  ],
  tuningConfig: {
    sourceWeights: {
      polymarket: 0.1,
      prediction_model: 0.2,
      hltv_odds: 0.1,
      community: 0.05,
      capital_flow: 0.15,
      whale_flow: 0.1,
      smart_wallet: 0.75,
      mean_reversion: 0.1,
      market_behavior: 0.1,
      ai_debate: 0.1,
    },
    behaviorWeights: {
      capitalWithOrderBook: 0.2,
      capitalWithoutOrderBook: 0.1,
      reversionWithHistory: 0.15,
      reversionWithoutHistory: 0.1,
      whaleWithFlow: 0.15,
      whaleWithoutFlow: 0.1,
      market: 0.2,
    },
    recommendation: {
      minEdge: 0.05,
      bubbleMinEdge: 0.1,
      minConfidence: 0.6,
      bubbleRiskPenalty: 0.15,
    },
  },
};

const MOCK_PERFORMANCE_SUMMARY = {
  settledCount: 2,
  openCount: 1,
  wins: 1,
  losses: 1,
  winRate: 0.5,
  winRateInterval: { low: 0.095, high: 0.905 },
  totalPnl: 25,
  totalStake: 200,
  roi: 0.125,
  avgBrier: 0.205,
  avgLogLoss: 0.61,
  calibrationError: 0.08,
  avgClv: null,
  clvSampleCount: 0,
  clvMissingCount: 2,
  equity: 10025,
  maxDrawdown: 35,
  returnVolatility: 0.46,
  sharpeRatio: 0.38,
  closingCoverage: {
    eligibleCount: 2,
    capturedCount: 0,
    unavailableCount: 1,
    pendingCount: 1,
    coverageRate: 0,
    averageAttempts: 0.5,
    sources: [],
    unavailableReasons: [{ reason: 'NO_RELIABLE_CLOSING_PRICE', count: 1 }],
  },
  sampleStatus: 'insufficient',
  rankingStatus: 'hidden',
  tuningEligible: false,
  filters: {},
  filterOptions: {
    games: ['cs2'],
    providers: ['minimax'],
    marketKinds: ['match_winner'],
    policyVersions: ['paper.v1.2.0'],
    promptVersions: ['cs2.match-winner.v1.0.0'],
  },
  equityCurve: [
    { timestamp: '2026-06-25T10:00:00Z', equity: 10060, cumulativePnl: 60 },
    { timestamp: '2026-06-26T10:00:00Z', equity: 10025, cumulativePnl: 25 },
  ],
  byGame: [performanceRow('cs2', 'game')],
  byProvider: [performanceRow('minimax', 'provider')],
  byMarketKind: [performanceRow('match_winner', 'market_kind')],
  byPolicy: [performanceRow('paper.v1.2.0', 'policy')],
  byPromptVersion: [performanceRow('cs2.match-winner.v1.0.0', 'prompt_version')],
  byEventTier: [performanceRow('S', 'event_tier')],
  byDataQuality: [performanceRow('high (>=85%)', 'data_quality')],
  byConfidenceBand: [performanceRow('high (>=75%)', 'confidence_band')],
  byEdgeBand: [performanceRow('5-10%', 'edge_band')],
};

function performanceRow(key: string, dimension: string) {
  return {
    key,
    dimension,
    settledCount: 2,
    wins: 1,
    losses: 1,
    winRate: 0.5,
    totalPnl: 25,
    totalStake: 200,
    roi: 0.125,
    avgBrier: 0.205,
    avgLogLoss: 0.61,
    clvCapturedCount: 0,
    clvUnavailableCount: 1,
    clvCoverageRate: 0,
    avgClosingAttempts: 0.5,
    sampleStatus: 'insufficient',
    rankingStatus: 'hidden',
    tuningEligible: false,
    items: [
      {
        betId: 'sim-bet-1',
        runId: 'fixture-run-1',
        reportId: 'fixture-report-1',
        matchId: '2396006',
        game: 'cs2',
        marketKind: 'match_winner',
        placedAt: '2026-06-26T10:00:00Z',
        result: 'won',
        stake: 100,
        pnl: 25,
      },
    ],
  };
}

const MOCK_VALIDATION_BOARDS = ['cs2', 'lol', 'dota2', 'valorant'].map((game) => ({
  game,
  boardState: game === 'cs2' ? 'paper_ready' : 'needs_data',
  completeness: game === 'cs2' ? 0.86 : game === 'dota2' ? 0.71 : 0,
  freshnessSeconds: game === 'cs2' ? 900 : 7200,
  missing:
    game === 'cs2' ? ['player_stats', 'head_to_head'] : ['normalized_match', 'market_alignment'],
  conflictFlags: [],
  sourceCount: game === 'cs2' ? 3 : 2,
  matchCount: game === 'cs2' ? 60 : game === 'dota2' ? 50 : 0,
  sampleMatch:
    game === 'cs2'
      ? {
          id: 'fact-cs2-spirit-g2',
          game: 'cs2',
          externalMatchId: '2396006',
          eventName: 'IEM Cologne',
          startsAt: '2026-07-23T12:00:00.000Z',
          format: 'BO3',
          status: 'scheduled',
          mapPool: ['Mirage', 'Dust2', 'Nuke'],
          participants: [
            { participantId: 'spirit', side: 'a', name: 'Spirit', rating: 1.18, source: 'hltv' },
            { participantId: 'g2', side: 'b', name: 'G2', rating: 1.09, source: 'hltv' },
          ],
          players: [],
          sourceLinks: [],
          facts: [],
          missing: ['player_stats', 'head_to_head'],
          conflictFlags: [],
          completeness: 0.86,
          freshnessSeconds: 900,
          dataSnapshotHash: 'sha256:fixture-cs2-validation',
          adapterVersion: 'cs2.facts.v2',
        }
      : undefined,
  stages: [
    { stage: 'source_sync', status: 'passed', detail: 'Fixture sources synchronized' },
    {
      stage: 'fact_normalize',
      status: game === 'cs2' ? 'passed' : 'warning',
      detail: game === 'cs2' ? 'Normalized facts ready' : 'More facts required',
    },
    {
      stage: 'market_align',
      status: game === 'cs2' ? 'passed' : 'waiting',
      detail: game === 'cs2' ? 'Practice market aligned' : 'No aligned market',
    },
    {
      stage: 'paper_decision',
      status: game === 'cs2' ? 'passed' : 'waiting',
      detail: game === 'cs2' ? 'Policy eligible' : 'Blocked by preflight',
    },
  ],
}));

export async function setupCommonMocks(page: Page): Promise<void> {
  await page.route('**/api/health**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'healthy',
        timestamp: '2026-07-22T12:00:00Z',
        uptime: 3600,
        dependencies: {
          whaleIngestion: {
            status: 'ok',
            consecutiveFailures: 0,
            lastIngestedCount: 0,
          },
          priceStream: {
            status: 'idle',
            connected: false,
            subscriptionCount: 0,
          },
        },
      }),
    }),
  );

  await page.route('**/api/system/features**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          marketOrdersEnabled: false,
          liveTradingEnabled: false,
          polymarketAccountEnabled: false,
        },
      }),
    }),
  );

  await page.route('**/api/system/health**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          status: 'degraded',
          timestamp: '2026-07-11T10:00:00Z',
          uptime: 3600,
          dependencies: {
            database: { status: 'ok', latency: 1 },
            cache: { status: 'ok', size: 2, maxSize: 5000 },
            websocket: { status: 'ok', connections: 0 },
            whaleIngestion: { status: 'ok', consecutiveFailures: 0, lastIngestedCount: 0 },
            priceStream: { status: 'idle', connected: false, subscriptionCount: 0 },
            grid: { status: 'skipped', configured: false },
            externalApis: {
              status: 'degraded',
              checks: [
                { name: 'polymarket-gamma', status: 'error' },
                { name: 'polymarket-clob', status: 'ok' },
              ],
            },
          },
        },
      }),
    }),
  );

  await page.route('**/api/markets/anomalies**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            conditionId: '0xcs2_1',
            question: 'Counter-Strike: Spirit vs G2 (BO3)',
            type: 'volume_surge',
            severity: 'high',
            detail: '+120% volume',
            value: 120,
          },
        ],
      }),
    }),
  );

  await page.route('**/api/esports/fetch-upcoming', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { enrichmentQueued: true } }),
    }),
  );

  const esportsSyncs = new Map<string, Record<string, unknown>>();
  const esportsSources = [
    {
      game: 'cs2',
      sources: [
        sourceDescriptor('cs2', 'hltv', 'HLTV', 'public', true),
        sourceDescriptor('cs2', 'liquipedia', 'Liquipedia', 'public', true),
        sourceDescriptor('cs2', 'grid', 'GRID', 'licensed', false),
      ],
    },
    {
      game: 'lol',
      sources: [
        sourceDescriptor('lol', 'grid', 'GRID', 'licensed', false),
        sourceDescriptor('lol', 'riot-data-dragon', 'Riot Data Dragon', 'public', true),
        sourceDescriptor('lol', 'riot', 'Riot Developer API', 'api_key', false),
        sourceDescriptor('lol', 'liquipedia', 'Liquipedia', 'public', true),
      ],
    },
    {
      game: 'dota2',
      sources: [
        sourceDescriptor('dota2', 'opendota', 'OpenDota', 'public', true),
        sourceDescriptor('dota2', 'steam', 'Valve Steam Web API', 'api_key', false),
        sourceDescriptor('dota2', 'liquipedia', 'Liquipedia', 'public', true),
      ],
    },
    {
      game: 'valorant',
      sources: [
        sourceDescriptor('valorant', 'grid', 'GRID', 'licensed', false),
        sourceDescriptor('valorant', 'riot', 'Riot VAL API', 'api_key', false),
        sourceDescriptor('valorant', 'liquipedia', 'Liquipedia', 'public', true),
      ],
    },
  ];

  await page.route('**/api/esports/sources**', (route) => {
    const url = new URL(route.request().url());
    const syncMatch = url.pathname.match(
      /\/api\/esports\/sources\/(cs2|lol|dota2|valorant)\/sync$/,
    );
    if (syncMatch && route.request().method() === 'POST') {
      const game = syncMatch[1];
      const records = game === 'dota2' ? 50 : game === 'lol' ? 1 : 0;
      const result = {
        game,
        status: records > 0 ? 'success' : 'partial',
        records,
        sources: [
          {
            source: game === 'dota2' ? 'opendota' : 'grid',
            status: records > 0 ? 'success' : 'skipped',
            records,
          },
        ],
        startedAt: '2026-07-21T03:00:00.000Z',
        finishedAt: '2026-07-21T03:00:01.000Z',
      };
      esportsSyncs.set(game, result);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: result }),
      });
    }

    if (url.pathname.endsWith('/snapshots')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    }
    if (url.pathname.endsWith('/teams/search')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: esportsSources.map((entry) => ({
          ...entry,
          latestSync: esportsSyncs.get(entry.game) ?? null,
          identityCount: entry.game === 'dota2' ? 1 : 0,
        })),
      }),
    });
  });

  await page.route('**/api/markets**', (route) => {
    const url = route.request().url();
    if (url.match(/\/api\/markets\/[^/?]+/)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: SAMPLE_MARKET }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [SAMPLE_MARKET], total: 1 }),
    });
  });

  await page.route('**/api/daily**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          date: '2026-06-25',
          totalMatches: 5,
          analyzedMatches: 3,
          highAttentionMatches: [MOCK_SCORED_MATCH],
          allMatches: [MOCK_SCORED_MATCH],
          topDeviations: [
            {
              marketId: 'm1',
              question: 'Spirit vs G2',
              polymarketProb: 0.55,
              predictedProb: 0.7,
              deviation: 0.15,
              direction: 'undervalued',
            },
          ],
          whaleAlerts: [
            {
              address: '0xabc',
              marketId: 'm1',
              action: 'BUY',
              amount: 5000,
              timestamp: '2026-06-25T10:00:00Z',
              suspiciousScore: 80,
            },
          ],
          generatedAt: '2026-06-25T10:00:00Z',
        },
      }),
    }),
  );

  await page.route('**/api/backup/**', (route) => {
    const url = route.request().url();
    if (url.includes('/tables/')) {
      const tableName = decodeURIComponent(url.split('/tables/')[1]?.split('?')[0] ?? 'markets');
      const sourceRows: Record<string, Record<string, unknown>[]> = {
        team_source_links: [
          {
            id: 'team-source-1',
            question: 'Counter-Strike: Spirit vs G2',
            team_id: 'spirit',
            source: 'liquipedia',
            source_id: 'Team Spirit',
            source_name: 'Team Spirit',
            confidence: 0.98,
            last_seen_at: '2026-06-25T10:00:00Z',
            updated_at: '2026-06-25T10:00:00Z',
          },
        ],
        match_source_links: [
          {
            id: 'match-source-1',
            question: 'Counter-Strike: Spirit vs G2',
            match_id: 'spirit-vs-g2-bo3',
            source: 'polymarket',
            source_id: '0xcs2_1',
            source_name: 'Counter-Strike: Spirit vs G2',
            confidence: 1,
            last_seen_at: '2026-06-25T10:00:00Z',
            updated_at: '2026-06-25T10:00:00Z',
          },
        ],
        roster_source_snapshots: [
          {
            id: 'roster-source-1',
            question: 'Counter-Strike: Spirit vs G2',
            team_id: 'spirit',
            source: 'liquipedia',
            source_id: 'Team Spirit',
            roster_hash: 'abc123',
            player_ids: '["donk","sh1ro","zont1x","magixx","chopper"]',
            updated_at: '2026-06-25T10:00:00Z',
          },
        ],
      };
      const rows = sourceRows[tableName] ?? [
        {
          id: 'row-1',
          question: 'Counter-Strike: Spirit vs G2',
          updated_at: '2026-06-25T10:00:00Z',
        },
      ];
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            tableName,
            columns: [
              { name: 'id', type: 'TEXT' },
              { name: 'question', type: 'TEXT' },
              { name: 'source', type: 'TEXT' },
              { name: 'updated_at', type: 'TEXT' },
            ],
            rows,
            total: rows.length,
            limit: 25,
            offset: 0,
            search: '',
          },
        }),
      });
    }
    if (url.includes('/info')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            fileSize: 1024 * 1024,
            fileSizeFormatted: '1.00 MB',
            tableCounts: {
              match_source_links: 1,
              matches: 10,
              markets: 20,
              roster_source_snapshots: 1,
              sim_bets: 5,
              team_source_links: 1,
            },
            tableMeta: {
              match_source_links: {
                source: 'Source alignment',
                lastUpdate: '2026-06-25T10:00:00Z',
              },
              matches: { source: 'HLTV / GRID', lastUpdate: '2026-06-25T10:00:00Z' },
              markets: { source: 'Polymarket', lastUpdate: '2026-06-25T10:00:00Z' },
              roster_source_snapshots: {
                source: 'Liquipedia / HLTV',
                lastUpdate: '2026-06-25T10:00:00Z',
              },
              sim_bets: { source: 'Local practice', lastUpdate: '2026-06-25T10:00:00Z' },
              team_source_links: { source: 'Source alignment', lastUpdate: '2026-06-25T10:00:00Z' },
            },
            dbPath: 'polyrader.db',
          },
        }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: '' });
  });

  await page.route('**/api/market-orders**', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Live order mock not configured for this test' }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { liveEnabled: true, canPlaceOrders: false } }),
    });
  });

  await page.route('**/api/markets/by-slug/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          conditionId: '0xcs2_1',
          slug: 'spirit-vs-g2-bo3',
          question: 'Counter-Strike: Spirit vs G2 (BO3)',
          outcomePrices: ['0.65', '0.35'],
          clobTokenIds: ['token1', 'token2'],
        },
      }),
    }),
  );

  const followedWallets: Array<{
    address: string;
    autoCopyEnabled: boolean;
    alertsEnabled: boolean;
    followedAt: string;
  }> = [];
  const copyTrades: Array<Record<string, unknown>> = [];

  await page.route('**/api/whale-follow**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/config')) {
      if (method === 'PUT') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              enabled: false,
              mode: 'paper',
              copyRatio: 0.1,
              maxOrderUsd: 200,
              minLeaderTradeUsd: 500,
              maxSlippage: 0.05,
              cs2Only: true,
              minLeaderWinRate: 0.55,
              minLeaderRoi: 0.02,
              minLeaderSamples: 10,
              dailyCapUsd: 2000,
              minMarketVolumeShare: 0.02,
              minMarketVolumeUsd: 5000,
              requireUserConfirm: true,
            },
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            enabled: false,
            mode: 'paper',
            copyRatio: 0.1,
            maxOrderUsd: 200,
            minLeaderTradeUsd: 500,
            maxSlippage: 0.05,
            cs2Only: true,
            minLeaderWinRate: 0.55,
            minLeaderRoi: 0.02,
            minLeaderSamples: 10,
            dailyCapUsd: 2000,
            minMarketVolumeShare: 0.02,
            minMarketVolumeUsd: 5000,
            requireUserConfirm: true,
          },
        }),
      });
    }

    const executeMatch = url.match(/\/signals\/([^/]+)\/execute/);
    if (executeMatch && method === 'POST') {
      const trade = {
        id: 'trade-1',
        signalId: executeMatch[1],
        mode: 'paper',
        tokenId: 'token1',
        side: 'buy',
        amount: 50,
        price: 0.6,
        status: 'filled',
        marketQuestion: 'Spirit vs G2',
        createdAt: '2026-06-25T10:00:00Z',
      };
      copyTrades.unshift(trade);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: trade }),
      });
    }

    if (url.includes('/signals') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    }

    if (url.includes('/trades/summary')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { totalPnl: 42, settled: 3, wins: 2, losses: 1 } }),
      });
    }

    if (url.includes('/trading-status')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { liveEnabled: true, canPlaceOrders: false, message: 'Not configured' },
        }),
      });
    }

    if (url.includes('/trades')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: copyTrades }),
      });
    }

    const addressMatch = url.match(/\/whale-follow\/(0x[a-fA-F0-9]+)/);
    if (addressMatch && method === 'DELETE') {
      const addr = addressMatch[1].toLowerCase();
      const idx = followedWallets.findIndex((w) => w.address.toLowerCase() === addr);
      if (idx >= 0) followedWallets.splice(idx, 1);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { ok: true } }),
      });
    }

    if (addressMatch && method === 'PUT') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { ok: true } }),
      });
    }

    if (url.endsWith('/whale-follow') || url.match(/\/whale-follow\/?(\?|$)/)) {
      if (method === 'POST') {
        const body = route.request().postDataJSON() as {
          address: string;
          autoCopyEnabled?: boolean;
          alertsEnabled?: boolean;
        };
        followedWallets.push({
          address: body.address,
          autoCopyEnabled: body.autoCopyEnabled ?? false,
          alertsEnabled: body.alertsEnabled ?? true,
          followedAt: '2026-06-25T10:00:00Z',
        });
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { ok: true } }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: followedWallets }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });

  await page.route('**/api/whales**', (route) => {
    const url = route.request().url();
    if (url.includes('/whales/refresh') && route.request().method() === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            ingestedTrades: 8,
            discovered: 12,
            qualified: 5,
            failedProfiles: 0,
            performanceUpdated: 3,
            ingestion: {
              source: 'data-api',
              lastScanAt: '2026-07-20T08:00:00Z',
              lastIngestedCount: 8,
              lastError: null,
            },
          },
        }),
      });
    }
    if (url.includes('/whales/graph')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { nodes: [], links: [] } }),
      });
    }
    const detailMatch = url.match(/\/whales\/(0x[a-fA-F0-9]+)/);
    if (detailMatch) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            address: detailMatch[1],
            totalVolume: 500000,
            totalPositions: 10,
            activePositions: 3,
            winRate: 0.65,
            settledBets: 24,
            wins: 16,
            losses: 8,
            roi: 0.18,
            totalWagered: 7000,
            pnl: 1200,
            suspiciousScore: {
              total: 35,
              volumeAnomaly: 10,
              timingAnomaly: 10,
              patternAnomaly: 8,
              correlationAnomaly: 7,
            },
            recentTrades: [
              {
                txHash: '0x1',
                marketId: 'token1',
                outcome: 'Yes',
                amount: 5000,
                price: 0.6,
                timestamp: '2026-06-20T00:00:00Z',
                type: 'buy',
              },
            ],
            lastActive: '2026-06-25T10:00:00Z',
            performance: {
              settledBets: 12,
              wins: 8,
              losses: 4,
              winRate: 0.667,
              totalPnl: 1200,
              totalWagered: 8000,
              roi: 0.15,
              pendingTrades: 2,
            },
            winRateTimeline: [
              { date: '2026-06-01', winRate: 1, settledBets: 1, cumulativePnl: 100 },
              { date: '2026-06-10', winRate: 0.5, settledBets: 2, cumulativePnl: 0 },
            ],
            marketBreakdown: [
              {
                marketId: 'm1',
                marketQuestion: 'Spirit vs G2',
                settledBets: 5,
                wins: 4,
                losses: 1,
                winRate: 0.8,
                pnl: 900,
                totalWagered: 3000,
              },
            ],
            isFollowed: false,
          },
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            address: '0xabc123def456',
            label: 'Whale #1',
            totalVolume: 500000,
            totalPositions: 10,
            activePositions: 3,
            winRate: 0.65,
            settledBets: 24,
            wins: 16,
            losses: 8,
            roi: 0.18,
            totalWagered: 7000,
            pnl: 1200,
            performanceUpdatedAt: '2026-07-20T08:00:00Z',
            suspiciousScore: {
              total: 75,
              volumeAnomaly: 20,
              timingAnomaly: 25,
              patternAnomaly: 15,
              correlationAnomaly: 15,
            },
            recentTrades: [],
            lastActive: '2026-06-25T10:00:00Z',
          },
        ],
        total: 1,
      }),
    });
  });

  await page.route('**/api/esports/events**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            matchId: 'm1',
            teamA: 'Spirit',
            teamB: 'G2',
            format: 'BO3',
            date: '2026-06-26',
            event: 'IEM Cologne',
          },
        ],
      }),
    }),
  );

  await page.route('**/api/esports/rankings**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [{ rank: 1, teamId: 'spirit', name: 'Team Spirit' }] }),
    }),
  );

  await page.route('**/api/esports/map-pool**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    }),
  );

  await page.route('**/api/esports/teams/*/sources**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          links: [
            {
              teamId: 'spirit',
              source: 'liquipedia',
              sourceId: 'Team Spirit',
              sourceName: 'Team Spirit',
              sourceUrl: 'https://liquipedia.net/counterstrike/Team_Spirit',
              confidence: 0.98,
              isPrimary: true,
              lastSeenAt: '2026-06-25T10:00:00Z',
            },
            {
              teamId: 'spirit',
              source: 'hltv',
              sourceId: '7020',
              sourceName: 'Spirit',
              confidence: 0.92,
              lastSeenAt: '2026-06-25T09:00:00Z',
            },
          ],
          rosterSnapshots: [
            {
              teamId: 'spirit',
              source: 'liquipedia',
              sourceId: 'Team Spirit',
              rosterHash: 'abc123',
              playerIds: ['donk', 'sh1ro', 'zont1x', 'magixx', 'chopper'],
              players: [],
              isCurrent: true,
              updatedAt: '2026-06-25T10:00:00Z',
            },
          ],
        },
      }),
    }),
  );

  await page.route('**/api/esports/teams/*/sources/*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { links: [], rosterSnapshots: [] } }),
    }),
  );

  await page.route('**/api/esports/teams/*/sync-liquipedia', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { linked: true, rosterPlayers: 5 } }),
    }),
  );

  await page.route('**/api/esports/matches/*/sources**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            matchId: 'spirit-vs-g2-bo3',
            source: 'polymarket',
            sourceId: '0xcs2_1',
            sourceName: 'Counter-Strike: Spirit vs G2',
            sourceUrl: 'https://polymarket.com/event/spirit-vs-g2',
            confidence: 1,
            lastSeenAt: '2026-06-25T10:00:00Z',
          },
          {
            matchId: 'spirit-vs-g2-bo3',
            source: 'hltv',
            sourceId: '2377000',
            sourceName: 'Spirit vs G2',
            confidence: 0.86,
            lastSeenAt: '2026-06-25T09:30:00Z',
          },
        ],
      }),
    }),
  );

  await page.route('**/api/esports/matches/*/refresh-lineup', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { updated: true } }),
    }),
  );

  // Generic handler first; specific routes below override (Playwright LIFO).
  await page.route('**/api/signals/**', (route) => {
    const url = route.request().url();
    if (url.includes('/stats')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { accuracy: 0.65, brierScore: 0.18, totalPredictions: 20 } }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            marketId: 'm1',
            polymarketProb: 0.55,
            predictedProb: 0.7,
            finalProb: 0.68,
            finalConfidence: 0.75,
            edge: 0.13,
            riskAdjustedEdge: 0.1,
            recommendation: 'buy_yes',
            deviation: 0.15,
            signals: [
              {
                source: 'polymarket',
                probability: 0.55,
                confidence: 0.9,
                lastUpdated: '2026-06-25T10:00:00Z',
              },
              {
                source: 'prediction_model',
                probability: 0.7,
                confidence: 0.8,
                lastUpdated: '2026-06-25T10:00:00Z',
              },
            ],
            arbitrageOpportunity: false,
          },
        ],
      }),
    });
  });

  await page.route('**/api/signals/backtest**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: MOCK_BACKTEST }),
    }),
  );

  await page.route('**/api/signals/config**', (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as typeof MOCK_BACKTEST.tuningConfig;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { ...MOCK_BACKTEST.tuningConfig, ...body, updatedAt: '2026-06-25T12:00:00Z' },
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: MOCK_BACKTEST.tuningConfig }),
    });
  });

  await page.route('**/api/signals/arbitrage**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { opportunities: [] } }),
    }),
  );

  await page.route('**/api/polymarket/account**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          status: {
            hasApiCredentials: true,
            hasAddress: true,
            address: '0x1234567890abcdef',
            canReadPrivate: true,
          },
          totalPositionValue: 1250.5,
          balances: [{ assetType: 'USDC', balance: 500 }],
          positions: [
            {
              marketId: '0xcs2_1',
              question: 'Spirit vs G2',
              outcome: 'Yes',
              shares: 100,
              value: 65,
              avgPrice: 0.62,
              currentPrice: 0.65,
              cashPnl: 3,
            },
          ],
          closedPositions: [
            {
              marketId: '0xcs2_closed_1',
              question: 'Vitality vs Falcons',
              outcome: 'Yes',
              shares: 50,
              value: 72,
              initialValue: 50,
              cashPnl: 22,
              endDate: '2026-06-20T00:00:00Z',
            },
            {
              marketId: '0xcs2_closed_2',
              question: 'NAVI vs FaZe',
              outcome: 'No',
              shares: 40,
              value: 22,
              initialValue: 40,
              cashPnl: -18,
              endDate: '2026-06-22T00:00:00Z',
            },
          ],
          activity: [],
          trades: [
            {
              id: 't1',
              side: 'buy',
              outcome: 'Yes',
              price: 0.62,
              size: 50,
              value: 31,
              timestamp: '2026-06-25T09:00:00Z',
            },
            {
              id: 't2',
              side: 'sell',
              outcome: 'No',
              price: 0.42,
              size: 20,
              value: 8.4,
              timestamp: '2026-06-25T10:00:00Z',
            },
          ],
          openOrders: [
            {
              id: 'o1',
              outcome: 'Yes',
              side: 'buy',
              price: 0.6,
              originalSize: 20,
              sizeMatched: 0,
              remainingSize: 20,
            },
          ],
          stats: {
            tradeCount: 2,
            buyCount: 1,
            sellCount: 1,
            tradedVolume: 39.4,
            settledMarkets: 2,
            winningMarkets: 1,
            losingMarkets: 1,
            winRate: 0.5,
            realizedPnl: 4,
            unrealizedPnl: 3,
            totalPnl: 7,
            roi: 0.0538,
            averageTradeSize: 19.7,
          },
          equityCurve: [
            { date: '2026-06-20', realizedPnl: 22, positionValue: 0, balance: 1222, equity: 1222 },
            { date: '2026-06-22', realizedPnl: 4, positionValue: 0, balance: 1204, equity: 1204 },
            { date: '2026-06-25', realizedPnl: 4, positionValue: 65, balance: 500, equity: 565 },
          ],
          diagnostics: [
            {
              source: 'data-api',
              operation: 'positions',
              ok: true,
              checkedAt: '2026-06-25T10:00:00Z',
            },
            {
              source: 'clob-api',
              operation: 'orders',
              ok: true,
              checkedAt: '2026-06-25T10:00:00Z',
            },
          ],
          updatedAt: '2026-06-25T10:00:00Z',
        },
      }),
    }),
  );

  await page.route('**/api/system/tasks**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          running: [],
          recent: [],
          scheduledJobs: [
            {
              jobKey: 'price-poll',
              name: '价格轮询',
              category: 'market',
              cron: '*/30 * * * * *',
              scheduleLabel: '每 30 秒',
            },
          ],
          stats: { runningCount: 0, completedToday: 1, failedToday: 0 },
          updatedAt: '2026-06-25T10:00:00Z',
        },
      }),
    }),
  );

  await page.route('**/api/ai/config/**', (route) => {
    const url = route.request().url();
    if (url.includes('/usage')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ provider: 'openai', used: 5000, limit: 10000, cost: 12.5 }],
        }),
      });
    }
    if (url.includes('/analysis-filter')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { historyMonths: 3, minVolumeUsd: 1000 } }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            provider: 'openai',
            model: 'gpt-4o',
            apiKey: 'sk-xxx',
            isEnabled: true,
            isConnected: true,
            quotaUsed: 5000,
            quotaLimit: 10000,
            costEstimate: 12.5,
          },
        ],
      }),
    });
  });

  await page.route('**/api/ai/stats/**', (route) => {
    const url = route.request().url();
    if (url.includes('/leaderboard')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              provider: 'openai',
              model: 'gpt-4o',
              totalPredictions: 20,
              correctPredictions: 14,
              accuracy: 0.7,
              averageConfidence: 0.65,
              calibrationError: 0.05,
              profitLoss: 200,
              roi: 0.15,
              sharpeRatio: 1.5,
              maxDrawdown: 0.1,
              lastUpdated: '2026-06-25T10:00:00Z',
            },
          ],
        }),
      });
    }
    if (url.includes('/calibration')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    }
    if (url.includes('/history')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          totalBets: 10,
          correctBets: 6,
          accuracy: 0.6,
          totalProfitLoss: 50,
          roi: 0.05,
          sharpeRatio: 1.2,
          maxDrawdown: 0.08,
        },
      }),
    });
  });

  await page.route('**/api/ai/prompts**', (route) => {
    const url = route.request().url();
    if (url.includes('/ab/compare')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            variantA: {
              totalAnalyses: 10,
              totalBets: 5,
              wonBets: 3,
              lostBets: 2,
              pendingBets: 0,
              profitLoss: 20,
              roi: 0.1,
              accuracy: 0.6,
            },
            variantB: {
              totalAnalyses: 8,
              totalBets: 4,
              wonBets: 2,
              lostBets: 2,
              pendingBets: 0,
              profitLoss: 5,
              roi: 0.02,
              accuracy: 0.5,
            },
          },
        }),
      });
    }
    if (route.request().method() !== 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: null }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            variantId: 'baseline',
            name: 'Default',
            isEnabled: true,
            trafficWeight: 1,
            isControl: true,
            systemPrompt: 'test',
            notes: '',
            createdAt: '2026-06-19T00:00:00Z',
            updatedAt: '2026-06-19T00:00:00Z',
          },
        ],
      }),
    });
  });

  const MOCK_BANKROLL = {
    config: {
      totalCapital: 10000,
      targetReturnRate: 0.15,
      riskTolerance: 'balanced' as const,
      maxBetFraction: 0.1,
      maxTotalExposure: 0.5,
      updatedAt: '2026-06-25T10:00:00Z',
    },
    state: {
      totalCapital: 10000,
      usedCapital: 2000,
      availableCapital: 8000,
      realizedPnL: 200,
      netCapital: 8200,
      targetReturnRate: 0.15,
      targetProfit: 1230,
      riskTolerance: 'balanced' as const,
    },
  };

  await page.route('**/api/allocation/**', (route) => {
    const url = route.request().url();
    if (url.includes('/bankroll')) {
      if (route.request().method() === 'PUT') {
        const body = route.request().postDataJSON() as typeof MOCK_BANKROLL.config;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: { ...MOCK_BANKROLL.config, ...body, updatedAt: '2026-06-25T12:00:00Z' },
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: MOCK_BANKROLL }),
      });
    }
    if (url.includes('/history')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    }
    if (url.includes('/latest')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: null }),
      });
    }
    if (url.includes('/plan') && route.request().method() === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'plan-1',
            createdAt: '2026-06-25T10:00:00Z',
            totalAllocated: 500,
            expectedReturn: 75,
            riskScore: 0.3,
            allocations: [],
            summary: 'Mock plan',
          },
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: null }),
    });
  });

  await page.route('**/api/simulation/**', (route) => {
    const url = route.request().url();
    if (url.includes('/backtest')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { providers: [], summary: {} } }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          enabled: true,
          initialCapital: 1000,
          strategy: 'kelly',
          minConfidence: 0.6,
          minEdge: 0.05,
          providers: ['openai'],
        },
      }),
    });
  });

  await page.route('**/api/performance/summary**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: MOCK_PERFORMANCE_SUMMARY }),
    }),
  );

  await page.route('**/api/validation-lab/release-gates**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: ['cs2', 'lol', 'dota2', 'valorant'].map((game) => ({
          game,
          status: 'fixture_ready',
          fixture: {
            status: 'passed',
            checkedAt: '2026-07-22T12:00:00.000Z',
            stages: [],
            blockers: [],
          },
          currentSource: {
            status: 'blocked',
            checkedAt: '2026-07-22T12:00:00.000Z',
            stages: [],
            blockers: ['prompt: no current-source provider run'],
          },
        })),
      }),
    }),
  );

  await page.route(/\/api\/validation-lab\/release-audits(?:\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            auditId: 'audit-cs2-1',
            game: 'cs2',
            outcome: 'blocked',
            startedAt: '2026-07-22T12:00:00.000Z',
            finishedAt: '2026-07-22T12:00:01.000Z',
            durationMs: 1000,
            boardState: 'paper_ready',
            externalMatchId: '2396006',
            dataSnapshotHash: 'sha256:fixture-cs2-validation',
            syncStatus: 'success',
            sourceRecords: 168,
            analysisStatus: 'completed',
            analysisRunId: 'current-run-1',
            provider: 'minimax',
            gateStatus: 'blocked',
            stageTimings: [
              {
                stage: 'source_sync',
                status: 'passed',
                startedAt: '2026-07-22T12:00:00.000Z',
                finishedAt: '2026-07-22T12:00:00.120Z',
                durationMs: 120,
                detail: '168 records',
              },
            ],
            blockers: ['settlement: no settled linked bet'],
          },
        ],
      }),
    }),
  );

  await page.route('**/api/validation-lab/lifecycle/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          game: new URL(route.request().url()).pathname.split('/').at(-1),
          checkedAt: '2026-07-22T12:00:00.000Z',
          runId: 'current-run-1',
          decisionAction: 'rejected',
          closing: 'not_applicable',
          settlement: 'not_applicable',
          statistics: 'not_applicable',
          nextAction: 'Wait for an aligned, policy-eligible current market; do not force an order.',
        },
      }),
    }),
  );

  await page.route('**/api/validation-lab/diagnostics/export**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          contractVersion: 'release-diagnostics.v1',
          generatedAt: '2026-07-22T12:00:00.000Z',
          releaseReport: { releaseReady: false, boards: [] },
          audits: [],
          database: {
            migrationCount: 40,
            latestMigration: '040_release_audit_history.sql',
            tableCount: 63,
          },
          releaseEnvironment: {
            nodeEnv: 'test',
            updaterSigningConfigured: false,
            notarizationConfigured: false,
          },
          redaction: { omitted: ['provider credentials'] },
        },
      }),
    }),
  );

  await page.route('**/api/validation-lab/release-audits/**', (route) => {
    const game = new URL(route.request().url()).pathname.split('/').at(-1) ?? 'cs2';
    const board = MOCK_VALIDATION_BOARDS.find((item) => item.game === game)!;
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          auditId: `audit-${game}-new`,
          game,
          startedAt: '2026-07-22T12:00:00.000Z',
          finishedAt: '2026-07-22T12:00:01.000Z',
          sync: {
            game,
            status: 'success',
            records: 3,
            sources: [{ source: 'grid', status: 'success', records: 3 }],
            startedAt: '2026-07-22T12:00:00.000Z',
            finishedAt: '2026-07-22T12:00:01.000Z',
          },
          board,
          analysis: {
            status: 'skipped',
            detail: 'board is needs_data; current-source facts and market alignment must pass',
          },
          stageTimings: [
            {
              stage: 'source_sync',
              status: 'passed',
              startedAt: '2026-07-22T12:00:00.000Z',
              finishedAt: '2026-07-22T12:00:00.100Z',
              durationMs: 100,
              detail: '3 records',
            },
            {
              stage: 'fact_normalize',
              status: 'blocked',
              startedAt: '2026-07-22T12:00:00.100Z',
              finishedAt: '2026-07-22T12:00:00.120Z',
              durationMs: 20,
              detail: 'needs_data',
            },
            {
              stage: 'provider_execute',
              status: 'skipped',
              startedAt: '2026-07-22T12:00:00.120Z',
              finishedAt: '2026-07-22T12:00:00.120Z',
              durationMs: 0,
              detail: 'market alignment must pass',
            },
            {
              stage: 'gate_evaluate',
              status: 'blocked',
              startedAt: '2026-07-22T12:00:00.120Z',
              finishedAt: '2026-07-22T12:00:00.130Z',
              durationMs: 10,
              detail: 'market missing',
            },
          ],
          gate: {
            game,
            status: 'fixture_ready',
            fixture: { status: 'passed', checkedAt: '', stages: [], blockers: [] },
            currentSource: {
              status: 'blocked',
              checkedAt: '',
              stages: [],
              blockers: ['market: current source market is missing'],
            },
          },
        },
      }),
    });
  });

  await page.route('**/api/validation-lab/boards**', (route) => {
    const url = new URL(route.request().url());
    const normalized = url.pathname.match(/\/boards\/(cs2|lol|dota2|valorant)\/normalize$/);
    if (normalized) {
      const summary = MOCK_VALIDATION_BOARDS.find((board) => board.game === normalized[1]);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { summary } }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: MOCK_VALIDATION_BOARDS }),
    });
  });

  await page.route('**/api/sim/**', (route) => {
    const url = route.request().url();
    const method = route.request().method();
    const mockAccount = {
      id: 'default',
      name: 'Practice Account',
      initialBankroll: 10000,
      currentBankroll: 10000,
      availableBankroll: 10000,
      openExposure: 0,
      maxSingleRiskPct: 0.02,
      maxDailyRiskPct: 0.06,
      createdAt: '2026-06-01T00:00:00Z',
      updatedAt: '2026-06-25T10:00:00Z',
    };
    if (url.includes('/account')) {
      const body = method === 'PUT' ? route.request().postDataJSON() : {};
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { ...mockAccount, ...(body ?? {}) } }),
      });
    }
    if (url.includes('/bankroll')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            account: mockAccount,
            todayPnl: 0,
            openExposure: 0,
            equityCurve: [],
            openBets: [],
            settledBets: [],
            voidedBets: [],
            riskMetrics: {
              maxDrawdown: 0,
              maxDrawdownPct: 0,
              consecutiveLosses: 0,
              averageStake: 0,
              totalBets: 0,
              winRate: 0,
              roi: 0,
            },
          },
        }),
      });
    }
    if (url.includes('/bets') && method === 'POST') {
      const body = route.request().postDataJSON() as {
        betType: string;
        stake: number;
        legs: unknown[];
      };
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            bet: {
              id: 'sim-bet-1',
              accountId: 'default',
              betType: body?.betType ?? 'single',
              stake: body?.stake ?? 100,
              totalOdds: 1.54,
              status: 'open',
              pnl: 0,
              placedAt: new Date().toISOString(),
            },
            legs: body?.legs ?? [],
          },
        }),
      });
    }
    if (url.includes('/bets') && method === 'GET' && !url.includes('/review')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'sim-bet-1',
              accountId: 'default',
              betType: 'single',
              stake: 100,
              totalOdds: 1.8,
              status: 'settled',
              result: 'won',
              pnl: 25,
              game: 'cs2',
              marketKind: 'match_winner',
              matchId: '2396006',
              runId: 'fixture-run-1',
              edgeAtEntry: 0.06,
              placedAt: '2026-06-26T10:00:00Z',
            },
          ],
        }),
      });
    }
    if (url.includes('/reviews/summary')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            totalSettled: 1,
            winRate: 1,
            totalPnl: 80,
            avgBrier: 0.16,
            avgClv: -0.0314,
            avgRoi: 0.8,
            maxDrawdown: 0,
            errorTagStats: [],
            byFormat: [{ key: 'BO3', count: 1, winRate: 1, totalPnl: 80 }],
            byTier: [{ key: 'unknown', count: 1, winRate: 1, totalPnl: 80 }],
            suggestions: [
              {
                id: 'need_more_samples',
                severity: 'info',
                messageKey: 'review.suggestion_needMoreSamples',
                params: { count: 1 },
              },
            ],
          },
        }),
      });
    }
    if (url.includes('/reviews')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              bet: {
                id: 'bet-1',
                accountId: 'default',
                betType: 'single',
                stake: 100,
                totalOdds: 1.8,
                userProbability: 0.6,
                edge: 0.08,
                result: 'won',
                pnl: 80,
                status: 'settled',
                matchId: 'spirit-vs-g2-bo3',
                marketId: 'm1',
                matchFormat: 'BO3',
                placedAt: '2026-06-25T10:00:00Z',
                settledAt: '2026-06-26T10:00:00Z',
              },
              review: null,
              snapshots: [
                {
                  id: 'snap-1',
                  matchId: 'spirit-vs-g2-bo3',
                  marketId: 'm1',
                  selection: 'Spirit',
                  odds: 1.8,
                  source: 'placement',
                  capturedAt: '2026-06-25T10:00:00Z',
                },
              ],
              placementOdds: 1.8,
              closingOdds: 1.7,
              brierScore: 0.16,
              closingLineValue: -0.0314,
            },
          ],
        }),
      });
    }
    const reviewMatch = url.match(/\/api\/sim\/bets\/([^/]+)\/review/);
    if (reviewMatch) {
      if (method === 'POST') {
        const body = route.request().postDataJSON() as {
          errorTags?: string[];
          note?: string;
          closingOdds?: number;
        };
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              id: 'review-1',
              betId: reviewMatch[1],
              errorTags: body?.errorTags ?? [],
              note: body?.note ?? null,
              brierScore: null,
              closingLineValue: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            bet: {
              id: reviewMatch[1],
              accountId: 'default',
              betType: 'single',
              stake: 100,
              totalOdds: 1.8,
              status: 'settled',
              result: 'won',
              pnl: 80,
              placedAt: new Date().toISOString(),
            },
            review: null,
            snapshots: [],
          },
        }),
      });
    }
    const snapshotsMatch = url.match(/\/api\/sim\/bets\/([^/]+)\/snapshots/);
    if (snapshotsMatch) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    });
  });

  await page.route('**/api/alerts**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    }),
  );

  // Registered last so it takes precedence over the generic /api/ai/stats/** handler.
  await page.route('**/api/ai/stats/provider/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          provider: 'openai',
          totalAnalyses: 20,
          settledBets: [],
          accuracy: 70,
          avgConfidence: 65,
          calibration: [{ predictedProb: 0.6, actualRate: 0.58, count: 10 }],
          equityCurve: [
            { date: '2026-06-01', equity: 1000 },
            { date: '2026-06-25', equity: 1150 },
          ],
          byTeam: [{ team: 'Spirit', total: 5, won: 4, accuracy: 80 }],
          byTier: [{ tier: 'S', total: 8, won: 6, accuracy: 75 }],
          byDirection: [{ direction: 'BUY', total: 12, won: 8, accuracy: 67 }],
          recentAnalyses: [],
        },
      }),
    }),
  );
}

function sourceDescriptor(
  game: string,
  source: string,
  label: string,
  access: string,
  configured: boolean,
) {
  return {
    game,
    source,
    label,
    access,
    state: configured ? 'ready' : 'unconfigured',
    readiness: configured ? 'data_available' : 'unconfigured',
    configured,
    capabilities: ['matches', 'teams'],
    docsUrl: 'https://example.com/source-docs',
  };
}

export async function setupMatchDetailMocks(page: Page): Promise<void> {
  await setupCommonMocks(page);

  const matchInfo = {
    matchId: 'spirit-vs-g2-bo3',
    teamA: { teamId: 'spirit', name: 'Spirit', logo: '', rank: 1, region: 'EU' },
    teamB: { teamId: 'g2', name: 'G2', logo: '', rank: 5, region: 'EU' },
    eventName: 'IEM Cologne',
    eventType: 'LAN' as const,
    format: 'BO3' as const,
    scheduledAt: '2026-06-26T12:00:00Z',
    status: 'scheduled' as const,
    maps: ['Mirage', 'Inferno'],
  };

  await page.route('**/api/esports/matches/**', (route) => {
    const url = route.request().url();
    if (url.includes('/sources')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              matchId: 'spirit-vs-g2-bo3',
              source: 'polymarket',
              sourceId: '0xcs2_1',
              sourceName: 'Counter-Strike: Spirit vs G2',
              confidence: 1,
              lastSeenAt: '2026-06-25T10:00:00Z',
            },
          ],
        }),
      });
    }
    if (url.includes('/refresh-lineup')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { updated: true } }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: matchInfo }),
    });
  });

  await page.route('**/api/esports/teams/**/sources**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { links: [], rosterSnapshots: [] } }),
    }),
  );

  await page.route('**/api/markets/spirit-vs-g2-bo3/orderbook**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          bids: [
            { price: '0.64', size: '100' },
            { price: '0.63', size: '200' },
          ],
          asks: [
            { price: '0.66', size: '100' },
            { price: '0.67', size: '150' },
          ],
        },
      }),
    }),
  );

  await page.route('**/api/markets/spirit-vs-g2-bo3/prices**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          { timestamp: '2026-06-25T08:00:00Z', price: 0.63 },
          { timestamp: '2026-06-25T10:00:00Z', price: 0.65 },
        ],
      }),
    }),
  );

  await page.route('**/api/ai/analysis/timeline/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            analysisId: 'a1',
            createdAt: '2026-06-25T08:00:00.000Z',
            provider: 'openai',
            model: 'gpt-4o',
            teamAProb: 0.58,
            teamBProb: 0.42,
            confidence: 0.7,
          },
          {
            analysisId: 'a2',
            createdAt: '2026-06-25T10:00:00.000Z',
            provider: 'openai',
            model: 'gpt-4o',
            teamAProb: 0.62,
            teamBProb: 0.38,
            confidence: 0.75,
          },
        ],
      }),
    }),
  );

  await page.route('**/api/ai/analyze**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: MOCK_AGGREGATION }),
    }),
  );

  await page.route('**/api/ai/stats/bet**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { ok: true } }),
    }),
  );
}
