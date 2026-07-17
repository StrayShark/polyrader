import { lazy, Suspense } from 'react';
import { createHashRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '../layouts/app-layout';
import { useI18n } from '../hooks/use-i18n';

// Code-split all pages for lazy loading
const DailyPage = lazy(() => import('../pages/daily-page').then((m) => ({ default: m.DailyPage })));
const MatchDetailPage = lazy(() => import('../pages/match-detail-page').then((m) => ({ default: m.MatchDetailPage })));
const WhalesPage = lazy(() => import('../pages/whales-page').then((m) => ({ default: m.WhalesPage })));
const WhaleDetailPage = lazy(() => import('../pages/whale-detail-page').then((m) => ({ default: m.WhaleDetailPage })));
const EsportsPage = lazy(() => import('../pages/esports-page').then((m) => ({ default: m.EsportsPage })));
const SignalsPage = lazy(() => import('../pages/signals-page').then((m) => ({ default: m.SignalsPage })));
const PolymarketAccountPage = lazy(() => import('../pages/polymarket-account-page').then((m) => ({ default: m.PolymarketAccountPage })));
const AiConfigPage = lazy(() => import('../pages/ai-config-page').then((m) => ({ default: m.AiConfigPage })));
const AiStatsPage = lazy(() => import('../pages/ai-stats-page').then((m) => ({ default: m.AiStatsPage })));
const LlmAnalysisPage = lazy(() => import('../pages/llm-analysis-page').then((m) => ({ default: m.LlmAnalysisPage })));
const PromptVariantsPage = lazy(() => import('../pages/prompt-variants-page').then((m) => ({ default: m.PromptVariantsPage })));
const AllocationPage = lazy(() => import('../pages/allocation-page').then((m) => ({ default: m.AllocationPage })));
const SimulationPage = lazy(() => import('../pages/simulation-page').then((m) => ({ default: m.SimulationPage })));
const NotFoundPage = lazy(() => import('../pages/not-found-page').then((m) => ({ default: m.NotFoundPage })));

// New simulation-first pages (placeholders until M3-M5)
const EventLobbyPage = lazy(() => import('../pages/event-lobby-page').then((m) => ({ default: m.EventLobbyPage })));
const BankrollPage = lazy(() => import('../pages/bankroll-page').then((m) => ({ default: m.BankrollPage })));
const ReviewPage = lazy(() => import('../pages/review-page').then((m) => ({ default: m.ReviewPage })));
const DatabasePage = lazy(() => import('../pages/database-page').then((m) => ({ default: m.DatabasePage })));
const StrategyLabPage = lazy(() => import('../pages/strategy-lab-page').then((m) => ({ default: m.StrategyLabPage })));
const SettingsPage = lazy(() => import('../pages/settings-page').then((m) => ({ default: m.SettingsPage })));

function PageLoader() {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-center py-20">
      <div className="flex flex-col items-center gap-2">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        <span className="text-sm text-muted-foreground">{t('common.loading')}</span>
      </div>
    </div>
  );
}

function withSuspense(Component: React.ComponentType) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
}

export const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: withSuspense(EventLobbyPage) },
      { path: 'dashboard', element: <Navigate to="/" replace /> },
      { path: 'daily', element: withSuspense(DailyPage) },
      { path: 'match/:slug', element: withSuspense(MatchDetailPage) },
      { path: 'match', element: withSuspense(MatchDetailPage) },
      { path: 'bankroll', element: withSuspense(BankrollPage) },
      { path: 'review', element: withSuspense(ReviewPage) },
      { path: 'database', element: withSuspense(DatabasePage) },
      { path: 'strategy', element: withSuspense(StrategyLabPage) },
      { path: 'settings', element: withSuspense(SettingsPage) },
      { path: 'whales', element: withSuspense(WhalesPage) },
      { path: 'whales/:address', element: withSuspense(WhaleDetailPage) },
      { path: 'esports', element: withSuspense(EsportsPage) },
      { path: 'signals', element: withSuspense(SignalsPage) },
      { path: 'polymarket/account', element: withSuspense(PolymarketAccountPage) },
      { path: 'ai/config', element: withSuspense(AiConfigPage) },
      { path: 'ai/stats', element: withSuspense(AiStatsPage) },
      { path: 'llm/analysis/:providerId', element: withSuspense(LlmAnalysisPage) },
      { path: 'prompt-variants', element: withSuspense(PromptVariantsPage) },
      { path: 'allocation', element: withSuspense(AllocationPage) },
      { path: 'simulation', element: withSuspense(SimulationPage) },
      { path: '*', element: withSuspense(NotFoundPage) },
    ],
  },
]);
