import { z } from 'zod';

// ============================================================
// Market schemas
// ============================================================
export const marketQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(['active', 'closed', 'resolved']).optional(),
});

export const marketParamsSchema = z.object({
  conditionId: z.string().min(1, 'conditionId is required'),
});

export const priceHistoryQuerySchema = z.object({
  interval: z.enum(['1h', '6h', '1d']).default('1h'),
});

const performanceDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const performanceQuerySchema = z
  .object({
    accountId: z.string().min(1).max(100).optional(),
    game: z.string().min(1).max(32).optional(),
    provider: z.string().min(1).max(100).optional(),
    marketKind: z.string().min(1).max(100).optional(),
    policyVersion: z.string().min(1).max(100).optional(),
    promptVersion: z.string().min(1).max(100).optional(),
    from: performanceDateSchema.optional(),
    to: performanceDateSchema.optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: '`from` must be on or before `to`',
    path: ['from'],
  });

// ============================================================
// AI Analysis schemas
// ============================================================
export const analyzeBodySchema = z.object({
  matchId: z.string().min(1, 'matchId is required'),
  teamAId: z.string().min(1, 'teamAId is required'),
  teamBId: z.string().min(1, 'teamBId is required'),
});

export const analysisParamsSchema = z.object({
  analysisId: z.string().min(1),
});

// ============================================================
// AI Config schemas
// ============================================================
export const setKeyBodySchema = z.object({
  apiKey: z.string().min(1, 'apiKey is required'),
  model: z.string().optional(),
});

export const providerParamsSchema = z.object({
  providerId: z.enum([
    'openai',
    'anthropic',
    'google',
    'deepseek',
    'xai',
    'groq',
    'qwen',
    'moonshot',
    'zhipu',
    'doubao',
    'minimax',
    'hunyuan',
    'user',
  ]),
});

// ============================================================
// AI Stats schemas
// ============================================================
export const statsHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const calibrationParamsSchema = z.object({
  providerId: z.enum([
    'openai',
    'anthropic',
    'google',
    'deepseek',
    'xai',
    'groq',
    'qwen',
    'moonshot',
    'zhipu',
    'doubao',
    'minimax',
    'hunyuan',
  ]),
});

// ============================================================
// Whale schemas
// ============================================================
export const whaleQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  minVolume: z.coerce.number().min(0).optional(),
  sort: z.enum(['volume', 'win_rate']).default('volume'),
  minSamples: z.coerce.number().int().min(0).max(1000).default(5),
  minWinRate: z.coerce.number().min(0).max(1).optional(),
  minRoi: z.coerce.number().min(-1).max(10).optional(),
});

export const whaleLeaderboardQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  minSamples: z.coerce.number().int().min(1).max(1000).default(20),
  minWinRate: z.coerce.number().min(0).max(1).default(0.5),
  minRoi: z.coerce.number().min(-1).max(10).default(0.02),
});

export const followWalletBodySchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  label: z.string().max(64).optional(),
  minTradeUsd: z.coerce.number().min(0).max(1_000_000).optional(),
  alertsEnabled: z.boolean().optional(),
  autoCopyEnabled: z.boolean().optional(),
});

export const walletCopyConfigBodySchema = z.object({
  enabled: z.boolean().optional(),
  mode: z.enum(['paper', 'live']).optional(),
  copyRatio: z.coerce.number().min(0.01).max(1).optional(),
  maxOrderUsd: z.coerce.number().min(1).max(100_000).optional(),
  minLeaderTradeUsd: z.coerce.number().min(0).max(1_000_000).optional(),
  maxSlippage: z.coerce.number().min(0).max(1).optional(),
  cs2Only: z.boolean().optional(),
  minLeaderWinRate: z.coerce.number().min(0).max(1).optional(),
  minLeaderRoi: z.coerce.number().min(-1).max(10).optional(),
  minLeaderSamples: z.coerce.number().int().min(0).max(10_000).optional(),
  dailyCapUsd: z.coerce.number().min(1).max(1_000_000).optional(),
  minMarketVolumeShare: z.coerce.number().min(0).max(1).optional(),
  minMarketVolumeUsd: z.coerce.number().min(0).max(10_000_000).optional(),
  requireUserConfirm: z.boolean().optional(),
});

export const walletFollowQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  status: z.enum(['pending', 'executed', 'skipped', 'failed']).optional(),
});

export const walletFollowSignalParamsSchema = z.object({
  signalId: z.string().uuid('Invalid signal id'),
});

export const walletFollowUnfollowParamsSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
});

export const whaleParamsSchema = z.object({
  address: z
    .string()
    .min(1, 'address is required')
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
});

// ============================================================
// Esports schemas
// ============================================================
export const teamParamsSchema = z.object({
  teamId: z.string().min(1, 'teamId is required'),
});

export const teamSourceParamsSchema = z.object({
  teamId: z.string().min(1, 'teamId is required'),
  source: z.enum(['polymarket', 'hltv', 'liquipedia', 'grid', 'cs_api', 'manual']),
});

export const upsertTeamSourceBodySchema = z.object({
  sourceId: z.string().min(1, 'sourceId is required'),
  sourceName: z.string().max(160).optional(),
  sourceSlug: z.string().max(200).optional(),
  sourceUrl: z.string().url().or(z.literal('')).optional(),
  confidence: z.coerce.number().min(0).max(1).optional(),
  isPrimary: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const matchParamsSchema = z.object({
  matchId: z.string().min(1, 'matchId is required'),
});

export const esportsGameParamsSchema = z.object({
  game: z.enum(['cs2', 'lol', 'dota2', 'valorant']),
});

export const esportsGameMatchParamsSchema = z.object({
  game: z.enum(['lol', 'dota2', 'valorant']),
  matchId: z.string().min(1, 'matchId is required'),
});

export const esportsSourceSnapshotsQuerySchema = z.object({
  entityType: z.enum(['match', 'team', 'player', 'event', 'patch', 'content']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const esportsMatchIdentitiesQuerySchema = z.object({
  canonicalMatchId: z.string().trim().min(1).max(240).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const esportsTeamAliasesQuerySchema = z.object({
  status: z
    .enum(['candidate', 'confirmed', 'conflict', 'unmatched', 'rejected'])
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const esportsSourceIdSchema = z.enum([
  'hltv',
  'liquipedia',
  'grid',
  'riot',
  'riot-data-dragon',
  'valorant-api',
  'opendota',
  'steam',
  'stratz',
  'vlr',
  'oracles-elixir',
]);

export const reviewEsportsTeamAliasBodySchema = z
  .object({
    source: esportsSourceIdSchema,
    sourceTeamId: z.string().trim().max(160).optional(),
    alias: z.string().trim().min(1).max(160),
    targetSource: esportsSourceIdSchema.default('opendota'),
    targetTeamId: z.string().trim().min(1).max(160).optional(),
    status: z.enum(['confirmed', 'conflict', 'rejected']),
    evidence: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((value, context) => {
    if (value.status === 'confirmed' && !value.targetTeamId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetTeamId'],
        message: 'targetTeamId is required for a confirmed alias',
      });
    }
  });

export const esportsTeamSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
});

export const esportsTeamRosterBodySchema = z.object({
  title: z.string().trim().min(1).max(160),
});

// ============================================================
// Signals schemas
// ============================================================
export const signalParamsSchema = z.object({
  marketId: z.string().min(1, 'marketId is required'),
});

export const signalSnapshotQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export const signalBacktestQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(5000).default(1000),
  minEdge: z.coerce.number().min(0).max(0.5).optional(),
});

const signalSourceWeightsSchema = z.object({
  polymarket: z.coerce.number().min(0).max(5).optional(),
  prediction_model: z.coerce.number().min(0).max(5).optional(),
  hltv_odds: z.coerce.number().min(0).max(5).optional(),
  community: z.coerce.number().min(0).max(5).optional(),
  capital_flow: z.coerce.number().min(0).max(5).optional(),
  whale_flow: z.coerce.number().min(0).max(5).optional(),
  smart_wallet: z.coerce.number().min(0).max(5).optional(),
  mean_reversion: z.coerce.number().min(0).max(5).optional(),
  market_behavior: z.coerce.number().min(0).max(5).optional(),
  ai_debate: z.coerce.number().min(0).max(5).optional(),
});

const signalBehaviorWeightsSchema = z.object({
  capitalWithOrderBook: z.coerce.number().min(0).max(5).optional(),
  capitalWithoutOrderBook: z.coerce.number().min(0).max(5).optional(),
  reversionWithHistory: z.coerce.number().min(0).max(5).optional(),
  reversionWithoutHistory: z.coerce.number().min(0).max(5).optional(),
  whaleWithFlow: z.coerce.number().min(0).max(5).optional(),
  whaleWithoutFlow: z.coerce.number().min(0).max(5).optional(),
  market: z.coerce.number().min(0).max(5).optional(),
});

const signalRecommendationSchema = z.object({
  minEdge: z.coerce.number().min(0).max(0.5).optional(),
  bubbleMinEdge: z.coerce.number().min(0).max(0.5).optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  bubbleRiskPenalty: z.coerce.number().min(0).max(5).optional(),
});

export const signalTuningConfigBodySchema = z.object({
  sourceWeights: signalSourceWeightsSchema.optional(),
  behaviorWeights: signalBehaviorWeightsSchema.optional(),
  recommendation: signalRecommendationSchema.optional(),
});

// ============================================================
// Betting schemas
// ============================================================
export const placeBetBodySchema = z.object({
  matchId: z.string().min(1),
  team: z.string().min(1),
  amount: z.number().min(10).max(10000),
  odds: z.number().min(1.01).max(100),
  reasoning: z.string().optional(),
  provider: z.string().min(1).max(64).optional(),
  game: z.enum(['cs2', 'lol', 'dota2', 'valorant']).optional(),
  marketKind: z
    .enum(['match_winner', 'map_winner', 'handicap', 'total_maps', 'correct_score'])
    .optional(),
});

export const placeMarketOrderBodySchema = z.object({
  slug: z.string().min(1),
  side: z.enum(['buy', 'sell']).default('buy'),
  team: z.enum(['team_a', 'team_b']),
  amountUsd: z.number().min(1).max(10000),
  price: z.number().min(0.01).max(0.99).optional(),
});

export const cancelMarketOrderParamsSchema = z.object({
  orderId: z.string().min(1),
});

export const settleBetSchema = z.object({
  result: z.enum(['won', 'lost']),
  profitLoss: z.number().optional(),
});

// ============================================================
// Allocation schemas
// ============================================================
export const updateBankrollBodySchema = z.object({
  totalCapital: z.number().min(0),
  targetReturnRate: z.number().min(0).max(1),
  riskTolerance: z.enum(['conservative', 'balanced', 'aggressive']),
  maxBetFraction: z.number().min(0.01).max(1).optional(),
  maxTotalExposure: z.number().min(0.01).max(1).optional(),
});

export const createAllocationBodySchema = z.object({
  opportunities: z
    .array(
      z.object({
        matchId: z.string().min(1),
        matchLabel: z.string().min(1),
        team: z.string().min(1),
        winProbability: z.number().min(0).max(1),
        odds: z.number().min(1.01).max(100),
        kellyFraction: z.number().min(0).max(1),
        consensusLevel: z.enum(['strong', 'moderate', 'weak', 'divergent']),
        confidence: z.number().min(0).max(1),
        expectedValue: z.number(),
      }),
    )
    .min(1),
  useLLM: z.boolean().optional(),
});

export const allocationHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ============================================================
// Prompt Variant schemas (A/B testing)
// ============================================================
export const createVariantSchema = z.object({
  variantId: z.string().min(1),
  name: z.string().min(1),
  systemPrompt: z.string().min(1),
  contextTemplate: z.string().optional(),
  outputSchema: z.string().optional(),
  trafficWeight: z.number().min(0).max(1).default(1),
  notes: z.string().optional(),
});

export const updateVariantSchema = z.object({
  name: z.string().min(1).optional(),
  systemPrompt: z.string().min(1).optional(),
  contextTemplate: z.string().optional(),
  outputSchema: z.string().optional(),
  isEnabled: z.boolean().optional(),
  trafficWeight: z.number().min(0).max(1).optional(),
  notes: z.string().optional(),
});

export const variantParamsSchema = z.object({
  variantId: z.string().min(1),
});

export const abCompareQuerySchema = z.object({
  variantA: z.string().min(1),
  variantB: z.string().min(1),
});

export const abApplyRecommendationSchema = z.object({
  variantA: z.string().min(1),
  variantB: z.string().min(1),
  boostRatio: z.number().min(0.01).max(0.5).optional(),
});

export const applySignalWeightsSchema = z.object({
  minSampleSize: z.number().int().min(1).max(1000).optional(),
  maxStepRatio: z.number().min(0.05).max(1).optional(),
});

// ============================================================
// Alert schemas
// ============================================================
export const createAlertBodySchema = z.object({
  marketSlug: z.string().min(1, 'marketSlug is required'),
  marketQuestion: z.string().min(1, 'marketQuestion is required'),
  alertType: z.enum(['price_above', 'price_below', 'volume_above']),
  threshold: z.number().min(0),
});

export const updateAlertBodySchema = z.object({
  threshold: z.number().min(0).optional(),
  currentValue: z.number().min(0).optional(),
  triggered: z.boolean().optional(),
});

export const alertParamsSchema = z.object({
  id: z.string().min(1, 'id is required'),
});

export const alertQuerySchema = z.object({
  triggered: z.enum(['true', 'false']).optional(),
});

// ============================================================
// Type exports
// ============================================================
export type MarketQuery = z.infer<typeof marketQuerySchema>;
export type AnalyzeBody = z.infer<typeof analyzeBodySchema>;
export type SetKeyBody = z.infer<typeof setKeyBodySchema>;
export type PlaceBetBody = z.infer<typeof placeBetBodySchema>;
export type UpdateBankrollBody = z.infer<typeof updateBankrollBodySchema>;
export type CreateAllocationBody = z.infer<typeof createAllocationBodySchema>;
export type CreateVariantBody = z.infer<typeof createVariantSchema>;
export type UpdateVariantBody = z.infer<typeof updateVariantSchema>;

// ============================================================
// Sim Betting schemas
// ============================================================
export const placeSimBetBodySchema = z.object({
  accountId: z.string().optional(),
  matchId: z.string().optional(),
  marketId: z.string().optional(),
  provider: z.string().min(1).max(100).optional(),
  game: z.enum(['cs2', 'lol', 'dota2', 'valorant']).optional(),
  marketKind: z.string().min(1).max(100).optional(),
  betType: z.enum(['single', 'parlay']).default('single'),
  stake: z.number().min(1).max(1000000),
  legs: z
    .array(
      z.object({
        matchId: z.string().optional(),
        marketId: z.string().optional(),
        selection: z.string().min(1),
        odds: z.number().min(1.01).max(1000),
        source: z.string().optional(),
      }),
    )
    .min(1),
  userProbability: z.number().min(0).max(1).optional(),
  modelProbability: z.number().min(0).max(1).optional(),
  marketProbability: z.number().min(0).max(1).optional(),
  matchFormat: z.enum(['BO1', 'BO3', 'BO5']).nullable().optional(),
  matchTier: z.string().max(8).nullable().optional(),
  reasoning: z.string().optional(),
});

export const settleSimBetBodySchema = z.object({
  result: z.enum(['won', 'lost', 'push']),
  pnl: z.number().optional(),
});

export const captureClosingPriceBodySchema = z.object({
  closingOdds: z.number().gt(1).max(1000),
  source: z.string().min(1).max(64).default('manual'),
  capturedAt: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)))
    .optional(),
});

export const createSimReviewBodySchema = z.object({
  errorTags: z.array(z.string()).optional(),
  note: z.string().optional(),
  closingOdds: z.number().min(1.01).optional(),
});

export const reviewListQuerySchema = z.object({
  accountId: z.string().optional(),
  result: z.enum(['all', 'won', 'lost', 'push']).optional(),
  betType: z.enum(['all', 'single', 'parlay']).optional(),
  format: z.enum(['all', 'BO1', 'BO3', 'BO5']).optional(),
  tier: z.string().optional(),
  timing: z.enum(['all', 'pre', 'live']).optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  hasNote: z.enum(['all', 'yes', 'no']).optional(),
});

export type PlaceSimBetBody = z.infer<typeof placeSimBetBodySchema>;
export type SettleSimBetBody = z.infer<typeof settleSimBetBodySchema>;
export type CaptureClosingPriceBody = z.infer<typeof captureClosingPriceBodySchema>;
export type CreateSimReviewBody = z.infer<typeof createSimReviewBodySchema>;
export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;

export type CreateAlertBody = z.infer<typeof createAlertBodySchema>;
export type UpdateAlertBody = z.infer<typeof updateAlertBodySchema>;

// ============================================================
// Simulation Config
// ============================================================

export const updateSimulationConfigSchema = z.object({
  enabled: z.boolean().optional(),
  initialCapital: z.number().min(100).max(10000000).optional(),
  betStrategy: z.enum(['fixed', 'kelly', 'proportional']).optional(),
  betAmount: z.number().min(1).max(1000000).optional(),
  maxBetFraction: z.number().min(0.001).max(1).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
  minEdge: z.number().min(0).max(1).optional(),
  oddsSource: z.enum(['market', 'llm_inverse']).optional(),
  participatingProviders: z.array(z.string()).optional(),
  autoSettle: z.boolean().optional(),
});

// ============================================================
// Strategy Profile & Training Session schemas
// ============================================================
export const profileIdParamsSchema = z.object({
  id: z.string().min(1, 'Profile id is required'),
});

export const createStrategyProfileBodySchema = z.object({
  name: z.string().min(1, 'Name is required').max(128),
  description: z.string().max(512).optional(),
  sourceWeights: signalSourceWeightsSchema,
  behaviorWeights: signalBehaviorWeightsSchema,
  recommendation: signalRecommendationSchema,
  capitalParams: z
    .object({
      initialBankroll: z.number().min(0).optional(),
      maxSingleRiskPct: z.number().min(0).max(1).optional(),
      maxDailyRiskPct: z.number().min(0).max(1).optional(),
      betStrategy: z.enum(['fixed', 'kelly', 'proportional']).optional(),
    })
    .optional(),
  lastBacktest: z.record(z.string(), z.unknown()).optional(),
});

export const updateStrategyProfileBodySchema = z.object({
  name: z.string().min(1).max(128).optional(),
  description: z.string().max(512).optional().nullable(),
  sourceWeights: signalSourceWeightsSchema.optional(),
  behaviorWeights: signalBehaviorWeightsSchema.optional(),
  recommendation: signalRecommendationSchema.optional(),
  capitalParams: z
    .object({
      initialBankroll: z.number().min(0).optional(),
      maxSingleRiskPct: z.number().min(0).max(1).optional(),
      maxDailyRiskPct: z.number().min(0).max(1).optional(),
      betStrategy: z.enum(['fixed', 'kelly', 'proportional']).optional(),
    })
    .optional()
    .nullable(),
  lastBacktest: z.record(z.string(), z.unknown()).optional().nullable(),
});

export const createTrainingSessionBodySchema = z.object({
  title: z.string().min(1).max(128),
  type: z.enum(['consecutive_reasoning', 'single_risk_limit', 'high_confidence_bets']),
  target: z.object({
    count: z.number().int().min(1).optional(),
    maxRiskPct: z.number().min(0).max(1).optional(),
    minEdge: z.number().min(0).max(1).optional(),
    minConfidence: z.number().min(0).max(1).optional(),
    consecutive: z.boolean().optional(),
  }),
  startAt: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)))
    .optional(),
  endAt: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)))
    .optional(),
});

export const updateTrainingSessionBodySchema = z.object({
  title: z.string().min(1).max(128).optional(),
  target: z
    .object({
      count: z.number().int().min(1).optional(),
      maxRiskPct: z.number().min(0).max(1).optional(),
      minEdge: z.number().min(0).max(1).optional(),
      minConfidence: z.number().min(0).max(1).optional(),
      consecutive: z.boolean().optional(),
    })
    .optional(),
  status: z.enum(['active', 'completed', 'abandoned']).optional(),
  progress: z.number().min(0).max(1).optional(),
  endAt: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)))
    .optional()
    .nullable(),
});

export const trainingSessionIdParamsSchema = z.object({
  id: z.string().min(1, 'Session id is required'),
});

// ============================================================
// analysis.v1 run schemas
// ============================================================
export const analysisRunParamsSchema = z.object({
  runId: z.string().min(1, 'runId is required'),
});

export const analysisRunListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  game: z.enum(['cs2', 'lol', 'dota2', 'valorant']).optional(),
});

const analysisParticipantSchema = z
  .object({
    participantId: z.string().min(1),
    name: z.string().min(1).max(160),
    side: z.enum(['a', 'b']),
  })
  .strict();

const analysisMarketOutcomeSchema = z
  .object({
    outcomeId: z.string().min(1),
    label: z.string().min(1).max(160),
    marketProbability: z.number().min(0).max(1),
  })
  .strict();

const analysisFactSchema = z
  .object({
    factId: z.string().min(1),
    entityType: z.string().min(1),
    source: z.string().min(1),
    observedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
    field: z.string().min(1),
    value: z.unknown(),
  })
  .strict();

export const analysisEnvelopeSchema = z
  .object({
    contractVersion: z.literal('analysis.v1'),
    runId: z.string().min(1),
    promptVersion: z.string().min(1),
    game: z.enum(['cs2', 'lol', 'dota2', 'valorant']),
    locale: z.string().min(2).max(16),
    generatedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
    match: z
      .object({
        matchId: z.string().min(1),
        eventId: z.string().optional(),
        eventName: z.string().min(1).max(200),
        startsAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
        format: z.enum(['BO1', 'BO3', 'BO5']),
        status: z.string().min(1),
        participants: z.array(analysisParticipantSchema).length(2),
      })
      .strict(),
    market: z
      .object({
        marketId: z.string().min(1),
        kind: z.enum(['match_winner', 'map_winner', 'handicap', 'total_maps', 'correct_score']),
        line: z.number().nullable(),
        evidenceType: z.enum(['real', 'synthetic']).optional(),
        liquidityStatus: z.enum(['normal', 'low', 'unknown', 'synthetic']).optional(),
        outcomes: z.array(analysisMarketOutcomeSchema).min(2).max(16),
        liquidityUsd: z.number().min(0),
        observedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
      })
      .strict(),
    dataSnapshot: z
      .object({
        dataSnapshotHash: z.string().startsWith('sha256:'),
        completeness: z.number().min(0).max(1),
        freshnessSeconds: z.number().min(0),
        facts: z.array(analysisFactSchema).max(500),
        missing: z.array(z.string()).max(100),
      })
      .strict(),
    policy: z
      .object({
        minimumCompleteness: z.number().min(0).max(1),
        maximumFreshnessSeconds: z.number().int().positive(),
        minimumConfidence: z.number().min(0).max(1),
        minimumEdge: z.number().min(0).max(1),
        lowLiquidityThresholdUsd: z.number().min(0),
        allowedActions: z.array(z.enum(['recommend_outcome', 'pass'])).min(1),
      })
      .strict(),
  })
  .strict();

export const createAnalysisRunBodySchema = z.object({
  envelope: analysisEnvelopeSchema,
  provider: z.string().max(64).optional(),
  model: z.string().max(128).optional(),
  gameAdapterVersion: z.string().max(64).optional(),
  marketAdapterVersion: z.string().max(64).optional(),
});

export const executeStandardAnalysisBodySchema = z
  .object({
    game: z.enum(['cs2', 'lol', 'dota2', 'valorant']),
    matchId: z.string().min(1).optional(),
    provider: z
      .enum([
        'openai',
        'anthropic',
        'google',
        'deepseek',
        'xai',
        'groq',
        'qwen',
        'moonshot',
        'zhipu',
        'doubao',
        'minimax',
        'hunyuan',
      ])
      .optional(),
    locale: z.string().min(2).max(16).optional(),
    market: z
      .object({
        marketId: z.string().min(1).optional(),
        kind: z
          .enum(['match_winner', 'map_winner', 'handicap', 'total_maps', 'correct_score'])
          .optional(),
        line: z.number().nullable().optional(),
        liquidityUsd: z.number().min(0).optional(),
        observedAt: z
          .string()
          .refine((value) => !Number.isNaN(Date.parse(value)))
          .optional(),
        outcomes: z.array(analysisMarketOutcomeSchema).min(2).max(16).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const ingestAnalysisResponseBodySchema = z.object({
  rawResponse: z.string().min(1, 'rawResponse is required'),
  attempt: z.number().int().min(0).max(5).optional(),
  latencyMs: z.number().int().min(0).optional(),
  promptTokens: z.number().int().min(0).optional(),
  completionTokens: z.number().int().min(0).optional(),
  totalTokens: z.number().int().min(0).optional(),
  policy: z.record(z.string(), z.unknown()).optional(),
  settlementRulesAvailable: z.boolean().optional(),
  bankroll: z.number().min(0).optional(),
});

export const analysisFixtureBodySchema = z
  .object({
    game: z.enum(['cs2', 'lol', 'dota2', 'valorant']).optional(),
    invalid: z.boolean().optional(),
    provider: z.string().max(64).optional(),
    model: z.string().max(128).optional(),
  })
  .default({});
