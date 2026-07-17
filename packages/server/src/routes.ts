import express, { type Express } from 'express';
import { MarketController } from './controllers/market-controller';
import { MarketOrderController } from './controllers/market-order-controller';
import { DailyController } from './controllers/daily-controller';
import { WhaleController } from './controllers/whale-controller';
import { WalletFollowController } from './controllers/wallet-follow-controller';
import { EsportsController } from './controllers/esports-controller';
import { SignalController } from './controllers/signal-controller';
import { AiConfigController } from './controllers/ai-config-controller';
import { AiStatsController } from './controllers/ai-stats-controller';
import { AllocationController } from './controllers/allocation-controller';
import { AlertController } from './controllers/alert-controller';
import { SimulationController } from './controllers/simulation-controller';
import { SimController } from './controllers/sim-controller';
import { PolymarketAccountController } from './controllers/polymarket-account-controller';
import { createPromptVariantRouter } from './controllers/prompt-variant-controller';
import { BackupController } from './controllers/backup-controller';
import { SystemController } from './controllers/system-controller';
import { LLMRepository } from '@polyrader/infra';
import { validate } from './validation';
import {
  marketQuerySchema,
  marketParamsSchema,
  priceHistoryQuerySchema,
  analyzeBodySchema,
  analysisParamsSchema,
  setKeyBodySchema,
  providerParamsSchema,
  statsHistoryQuerySchema,
  calibrationParamsSchema,
  whaleQuerySchema,
  whaleLeaderboardQuerySchema,
  whaleParamsSchema,
  followWalletBodySchema,
  walletCopyConfigBodySchema,
  walletFollowQuerySchema,
  walletFollowSignalParamsSchema,
  walletFollowUnfollowParamsSchema,
  teamParamsSchema,
  teamSourceParamsSchema,
  upsertTeamSourceBodySchema,
  matchParamsSchema,
  signalParamsSchema,
  signalBacktestQuerySchema,
  signalSnapshotQuerySchema,
  signalTuningConfigBodySchema,
  applySignalWeightsSchema,
  placeBetBodySchema,
  placeSimBetBodySchema,
  settleSimBetBodySchema,
  createSimReviewBodySchema,
  placeMarketOrderBodySchema,
  cancelMarketOrderParamsSchema,
  createStrategyProfileBodySchema,
  updateStrategyProfileBodySchema,
  profileIdParamsSchema,
  createTrainingSessionBodySchema,
  updateTrainingSessionBodySchema,
  trainingSessionIdParamsSchema,
  settleBetSchema,
  updateBankrollBodySchema,
  createAllocationBodySchema,
  allocationHistoryQuerySchema,
  createAlertBodySchema,
  updateAlertBodySchema,
  alertParamsSchema,
  alertQuerySchema,
  updateSimulationConfigSchema,
} from './validation';

export function registerRoutes(app: Express): void {
  const marketCtrl = new MarketController();
  const marketOrderCtrl = new MarketOrderController();
  const dailyCtrl = new DailyController();
  const whaleCtrl = new WhaleController();
  const walletFollowCtrl = new WalletFollowController();
  const esportsCtrl = new EsportsController();
  const signalCtrl = new SignalController();
  const aiConfigCtrl = new AiConfigController();
  const aiStatsCtrl = new AiStatsController();
  const allocationCtrl = new AllocationController();
  const alertCtrl = new AlertController();
  const simulationCtrl = new SimulationController();
  const simCtrl = new SimController();
  const polymarketAccountCtrl = new PolymarketAccountController();
  const backupCtrl = new BackupController();
  const systemCtrl = new SystemController();

  // System
  app.get('/api/system/tasks', (req, res) => systemCtrl.getTasks(req, res));
  app.get('/api/system/features', (req, res) => systemCtrl.getFeatures(req, res));
  app.get('/api/system/health', (req, res) => systemCtrl.getHealth(req, res));

  // Markets
  app.get('/api/markets', validate(marketQuerySchema, 'query'), (req, res) => marketCtrl.getMarkets(req, res));
  app.get('/api/markets/anomalies', (req, res) => marketCtrl.getAnomalies(req, res));

  // Market orders are hidden from the main simulation-first path unless explicitly enabled.
  const marketOrdersEnabled = process.env.CS2_SIMBOOK_ENABLE_MARKET_ORDERS === 'true';
  const polymarketAccountEnabled =
    process.env.CS2_SIMBOOK_ENABLE_POLYMARKET_ACCOUNT === 'true' ||
    process.env.POLYMARKET_ACCOUNT_ENABLED === 'true';
  if (marketOrdersEnabled) {
    app.get('/api/market-orders/status', (req, res) => marketOrderCtrl.getTradingStatus(req, res));
    app.post('/api/market-orders', validate(placeMarketOrderBodySchema), (req, res) => marketOrderCtrl.placeOrder(req, res));
    app.delete('/api/market-orders/:orderId', validate(cancelMarketOrderParamsSchema, 'params'), (req, res) => marketOrderCtrl.cancelOrder(req, res));
  }

  // Polymarket Personal Account (read-only, advanced only)
  if (polymarketAccountEnabled) {
    app.get('/api/polymarket/account', (req, res) => polymarketAccountCtrl.getOverview(req, res));
  }

  app.get('/api/markets/by-slug/:slug', (req, res) => marketCtrl.getMarketBySlug(req, res));
  app.get('/api/markets/:conditionId', validate(marketParamsSchema, 'params'), (req, res) => marketCtrl.getMarket(req, res));
  app.get('/api/markets/:conditionId/prices', validate(marketParamsSchema, 'params'), validate(priceHistoryQuerySchema, 'query'), (req, res) => marketCtrl.getPrices(req, res));
  app.get('/api/markets/:conditionId/local-odds', validate(marketParamsSchema, 'params'), (req, res) => marketCtrl.getLocalOdds(req, res));
  app.get('/api/markets/:conditionId/orderbook', validate(marketParamsSchema, 'params'), (req, res) => marketCtrl.getOrderBook(req, res));
  app.get('/api/markets/:conditionId/holders', validate(marketParamsSchema, 'params'), (req, res) => marketCtrl.getHolders(req, res));
  app.get('/api/markets/:conditionId/positions', validate(marketParamsSchema, 'params'), (req, res) => marketCtrl.getMarketPositions(req, res));

  // Daily Dashboard
  app.get('/api/daily', (req, res) => dailyCtrl.getDashboard(req, res));
  app.post('/api/daily/refresh', (req, res) => dailyCtrl.refresh(req, res));

  // Whales
  app.get('/api/whales', validate(whaleQuerySchema, 'query'), (req, res) => whaleCtrl.getWhales(req, res));
  app.get('/api/whales/leaderboard', validate(whaleLeaderboardQuerySchema, 'query'), (req, res) => whaleCtrl.getLeaderboard(req, res));
  app.get('/api/whales/graph', (req, res) => whaleCtrl.getAddressGraph(req, res));

  // Wallet follow & copy trading
  app.get('/api/whale-follow', (req, res) => walletFollowCtrl.listFollowed(req, res));
  app.post('/api/whale-follow', validate(followWalletBodySchema), (req, res) => walletFollowCtrl.follow(req, res));
  app.put('/api/whale-follow/:address', validate(walletFollowUnfollowParamsSchema, 'params'), validate(followWalletBodySchema.partial(), 'body'), (req, res) => walletFollowCtrl.updateFollow(req, res));
  app.delete('/api/whale-follow/:address', validate(walletFollowUnfollowParamsSchema, 'params'), (req, res) => walletFollowCtrl.unfollow(req, res));
  app.get('/api/whale-follow/config', (req, res) => walletFollowCtrl.getConfig(req, res));
  app.put('/api/whale-follow/config', validate(walletCopyConfigBodySchema), (req, res) => walletFollowCtrl.updateConfig(req, res));
  app.get('/api/whale-follow/signals', validate(walletFollowQuerySchema, 'query'), (req, res) => walletFollowCtrl.listSignals(req, res));
  app.get('/api/whale-follow/trades/summary', (req, res) => walletFollowCtrl.getCopyTradeSummary(req, res));
  app.get('/api/whale-follow/trading-status', (req, res) => walletFollowCtrl.getTradingStatus(req, res));
  app.get('/api/whale-follow/trades', validate(walletFollowQuerySchema, 'query'), (req, res) => walletFollowCtrl.listCopyTrades(req, res));
  app.post('/api/whale-follow/signals/:signalId/execute', validate(walletFollowSignalParamsSchema, 'params'), (req, res) => walletFollowCtrl.executeSignal(req, res));

  app.get('/api/whales/:address', validate(whaleParamsSchema, 'params'), (req, res) => whaleCtrl.getWhale(req, res));

  // Esports
  app.get('/api/esports/events', (req, res) => esportsCtrl.getEvents(req, res));
  app.get('/api/esports/rankings', (req, res) => esportsCtrl.getRankings(req, res));
  app.get('/api/esports/map-pool', (req, res) => esportsCtrl.getMapPool(req, res));
  app.get('/api/esports/teams/:teamId/sources', validate(teamParamsSchema, 'params'), (req, res) => esportsCtrl.getTeamSources(req, res));
  app.put('/api/esports/teams/:teamId/sources/:source', validate(teamSourceParamsSchema, 'params'), validate(upsertTeamSourceBodySchema, 'body'), (req, res) => esportsCtrl.upsertTeamSource(req, res));
  app.post('/api/esports/teams/:teamId/sync-liquipedia', validate(teamParamsSchema, 'params'), (req, res) => esportsCtrl.syncLiquipediaTeam(req, res));
  app.get('/api/esports/teams/:teamId', validate(teamParamsSchema, 'params'), (req, res) => esportsCtrl.getTeam(req, res));
  app.get('/api/esports/matches/:matchId/sources', validate(matchParamsSchema, 'params'), (req, res) => esportsCtrl.getMatchSources(req, res));
  app.post('/api/esports/matches/:matchId/refresh-lineup', validate(matchParamsSchema, 'params'), (req, res) => esportsCtrl.refreshMatchLineup(req, res));
  app.post('/api/esports/matches/:matchId/reconcile', validate(matchParamsSchema, 'params'), (req, res) => esportsCtrl.reconcileMatch(req, res));
  app.get('/api/esports/matches/:matchId', validate(matchParamsSchema, 'params'), (req, res) => esportsCtrl.getMatch(req, res));
  app.post('/api/esports/fetch-upcoming', (req, res) => esportsCtrl.fetchUpcomingMatches(req, res));
  app.post('/api/esports/enrich', (req, res) => esportsCtrl.enrichMatch(req, res));

  // Signals
  app.get('/api/signals/top', (req, res) => signalCtrl.getTopSignals(req, res));
  app.get('/api/signals/stats', (req, res) => signalCtrl.getStats(req, res));
  app.get('/api/signals/arbitrage', (req, res) => signalCtrl.getArbitrage(req, res));
  app.get('/api/signals/backtest', validate(signalBacktestQuerySchema, 'query'), (req, res) => signalCtrl.getSignalBacktest(req, res));
  app.get('/api/signals/config', (req, res) => signalCtrl.getSignalTuningConfig(req, res));
  app.put('/api/signals/config', validate(signalTuningConfigBodySchema, 'body'), (req, res) => signalCtrl.updateSignalTuningConfig(req, res));
  app.post('/api/signals/config/apply-suggestions', validate(applySignalWeightsSchema, 'body'), (req, res) => signalCtrl.applySuggestedWeights(req, res));
  app.get('/api/signals/snapshots/recent', validate(signalSnapshotQuerySchema, 'query'), (req, res) => signalCtrl.getRecentSignalSnapshots(req, res));
  app.get('/api/signals/:marketId/snapshots', validate(signalParamsSchema, 'params'), validate(signalSnapshotQuerySchema, 'query'), (req, res) => signalCtrl.getSignalSnapshots(req, res));
  app.get('/api/signals/:marketId', validate(signalParamsSchema, 'params'), (req, res) => signalCtrl.getSignals(req, res));

  // AI Analysis
  app.post('/api/ai/analyze', validate(analyzeBodySchema, 'body'), (req, res) => aiConfigCtrl.analyze(req, res));
  app.post('/api/ai/analyze/stream', validate(analyzeBodySchema, 'body'), (req, res) => aiConfigCtrl.analyzeStream(req, res));
  app.get('/api/ai/analysis/:analysisId', validate(analysisParamsSchema, 'params'), (req, res) => aiConfigCtrl.getAnalysis(req, res));
  app.get('/api/ai/analysis/timeline/:matchId', (req, res) => aiConfigCtrl.getMatchTimeline(req, res));

  // AI Config
  app.get('/api/ai/config/keys', (req, res) => aiConfigCtrl.getKeys(req, res));
  app.put('/api/ai/config/keys/:providerId', validate(providerParamsSchema, 'params'), validate(setKeyBodySchema, 'body'), (req, res) => aiConfigCtrl.setKey(req, res));
  app.post('/api/ai/config/test/:providerId', validate(providerParamsSchema, 'params'), (req, res) => aiConfigCtrl.testConnection(req, res));
  app.get('/api/ai/config/usage', (req, res) => aiConfigCtrl.getUsage(req, res));
  app.get('/api/ai/config/analysis-filter', (req, res) => aiConfigCtrl.getAnalysisFilter(req, res));
  app.put('/api/ai/config/analysis-filter', (req, res) => aiConfigCtrl.updateAnalysisFilter(req, res));

  // AI Stats
  app.get('/api/ai/stats/leaderboard', (req, res) => aiStatsCtrl.getLeaderboard(req, res));
  app.get('/api/ai/stats/user', (req, res) => aiStatsCtrl.getUserStats(req, res));
  app.get('/api/ai/stats/history', validate(statsHistoryQuerySchema, 'query'), (req, res) => aiStatsCtrl.getHistory(req, res));
  app.get('/api/ai/stats/calibration/:providerId', validate(calibrationParamsSchema, 'params'), (req, res) => aiStatsCtrl.getCalibration(req, res));
  app.post('/api/ai/stats/bet', validate(placeBetBodySchema, 'body'), (req, res) => aiStatsCtrl.placeBet(req, res));
  app.patch('/api/ai/stats/bet/:id', validate(settleBetSchema, 'body'), (req, res) => aiStatsCtrl.settleBet(req, res));
  app.delete('/api/ai/stats/bet/:id', (req, res) => aiStatsCtrl.deleteBet(req, res));
  app.get('/api/ai/stats/equity-curve', (req, res) => aiStatsCtrl.getEquityCurve(req, res));
  app.get('/api/ai/stats/provider/:providerId', (req, res) => aiStatsCtrl.getProviderAnalysis(req, res));

  // AI Bet Allocation
  app.get('/api/allocation/bankroll', (req, res) => allocationCtrl.getBankroll(req, res));
  app.put('/api/allocation/bankroll', validate(updateBankrollBodySchema, 'body'), (req, res) => allocationCtrl.updateBankroll(req, res));
  app.post('/api/allocation/plan', validate(createAllocationBodySchema, 'body'), (req, res) => allocationCtrl.createAllocation(req, res));
  app.get('/api/allocation/plan/latest', (req, res) => allocationCtrl.getLatestPlan(req, res));
  app.get('/api/allocation/plan/history', validate(allocationHistoryQuerySchema, 'query'), (req, res) => allocationCtrl.getPlanHistory(req, res));

  // Prompt Variants (A/B testing)
  const llmRepo = new LLMRepository();
  app.use('/api/ai/prompts', createPromptVariantRouter(llmRepo));

  // Price/Volume Alerts
  app.get('/api/alerts', validate(alertQuerySchema, 'query'), (req, res) => alertCtrl.getAlerts(req, res));
  app.post('/api/alerts', validate(createAlertBodySchema, 'body'), (req, res) => alertCtrl.createAlert(req, res));
  app.put('/api/alerts/:id', validate(alertParamsSchema, 'params'), validate(updateAlertBodySchema, 'body'), (req, res) => alertCtrl.updateAlert(req, res));
  app.delete('/api/alerts/:id', validate(alertParamsSchema, 'params'), (req, res) => alertCtrl.deleteAlert(req, res));

  // User Simulation Betting
  app.get('/api/sim/account', (req, res) => simCtrl.getAccount(req, res));
  app.put('/api/sim/account/:id', (req, res) => simCtrl.updateAccount(req, res));
  app.get('/api/sim/bankroll', (req, res) => simCtrl.getBankroll(req, res));
  app.get('/api/sim/bets', (req, res) => simCtrl.listBets(req, res));
  app.post('/api/sim/bets', validate(placeSimBetBodySchema), (req, res) => simCtrl.placeBet(req, res));
  app.get('/api/sim/bets/:id', (req, res) => simCtrl.getBet(req, res));
  app.patch('/api/sim/bets/:id/settle', validate(settleSimBetBodySchema), (req, res) => simCtrl.settleBet(req, res));
  app.get('/api/sim/reviews', (req, res) => simCtrl.listReviews(req, res));
  app.get('/api/sim/bets/:id/review', (req, res) => simCtrl.getReview(req, res));
  app.post('/api/sim/bets/:id/review', validate(createSimReviewBodySchema), (req, res) => simCtrl.createOrUpdateReview(req, res));
  app.get('/api/sim/bets/:id/snapshots', (req, res) => simCtrl.getSnapshotsForBet(req, res));

  // Strategy Profiles
  app.get('/api/sim/profiles', (req, res) => simCtrl.listProfiles(req, res));
  app.post('/api/sim/profiles', validate(createStrategyProfileBodySchema), (req, res) => simCtrl.createProfile(req, res));
  app.get('/api/sim/profiles/:id', validate(profileIdParamsSchema, 'params'), (req, res) => simCtrl.getProfile(req, res));
  app.patch('/api/sim/profiles/:id', validate(profileIdParamsSchema, 'params'), validate(updateStrategyProfileBodySchema, 'body'), (req, res) => simCtrl.updateProfile(req, res));
  app.delete('/api/sim/profiles/:id', validate(profileIdParamsSchema, 'params'), (req, res) => simCtrl.deleteProfile(req, res));
  app.post('/api/sim/profiles/:id/activate', validate(profileIdParamsSchema, 'params'), (req, res) => simCtrl.activateProfile(req, res));

  // Training Sessions
  app.get('/api/sim/training-sessions', (req, res) => simCtrl.listTrainingSessions(req, res));
  app.post('/api/sim/training-sessions', validate(createTrainingSessionBodySchema), (req, res) => simCtrl.createTrainingSession(req, res));
  app.get('/api/sim/training-sessions/:id', validate(trainingSessionIdParamsSchema, 'params'), (req, res) => simCtrl.getTrainingSession(req, res));
  app.patch('/api/sim/training-sessions/:id', validate(trainingSessionIdParamsSchema, 'params'), validate(updateTrainingSessionBodySchema, 'body'), (req, res) => simCtrl.updateTrainingSession(req, res));
  app.delete('/api/sim/training-sessions/:id', validate(trainingSessionIdParamsSchema, 'params'), (req, res) => simCtrl.deleteTrainingSession(req, res));
  app.post('/api/sim/training-sessions/:id/refresh', validate(trainingSessionIdParamsSchema, 'params'), (req, res) => simCtrl.refreshTrainingSessionProgress(req, res));

  // Simulation (Paper Trading)
  app.get('/api/simulation/config', (req, res) => simulationCtrl.getConfig(req, res));
  app.put('/api/simulation/config', validate(updateSimulationConfigSchema, 'body'), (req, res) => simulationCtrl.updateConfig(req, res));
  app.get('/api/simulation/stats', (req, res) => simulationCtrl.getProviderStats(req, res));
  app.get('/api/simulation/equity-curves', (req, res) => simulationCtrl.getAllEquityCurves(req, res));
  app.get('/api/simulation/equity-curve/:provider', (req, res) => simulationCtrl.getEquityCurve(req, res));
  app.get('/api/simulation/bets/:provider', (req, res) => simulationCtrl.getBetHistory(req, res));
  app.post('/api/simulation/backtest', (req, res) => simulationCtrl.runBacktest(req, res));

  // Backup / Restore
  app.get('/api/backup/info', (req, res) => backupCtrl.getBackupInfo(req, res));
  app.get('/api/backup/tables/:tableName', (req, res) => backupCtrl.getTableRows(req, res));
  app.get('/api/backup/export', (req, res) => backupCtrl.exportDatabase(req, res));
  app.get('/api/backup/export/csv', (req, res) => backupCtrl.exportCsv(req, res));
  app.get('/api/backup/export/json', (req, res) => backupCtrl.exportJson(req, res));
  app.post('/api/backup/import', express.raw({ type: 'application/octet-stream', limit: '256mb' }), (req, res) => backupCtrl.importDatabase(req, res));
  app.post('/api/backup/cleanup', (req, res) => backupCtrl.cleanupWal(req, res));
}
