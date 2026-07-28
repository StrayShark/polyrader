import { lazy, Suspense } from 'react';
import { createHashRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '../layouts/app-layout';
import { useI18n } from '../hooks/use-i18n';
import { LoadingState } from '../components/LoadingState';

// Code-split all pages for lazy loading
const DailyPage = lazy(() => import('../pages/daily-page').then((m) => ({ default: m.DailyPage })));
const MatchDetailPage = lazy(() => import('../pages/match-detail-page').then((m) => ({ default: m.MatchDetailPage })));
const WhalesPage = lazy(() => import('../pages/whales-page').then((m) => ({ default: m.WhalesPage })));
const WhaleDetailPage = lazy(() => import('../pages/whale-detail-page').then((m) => ({ default: m.WhaleDetailPage })));
const EsportsPage = lazy(() => import('../pages/esports-page').then((m) => ({ default: m.EsportsPage })));
const SignalsPage = lazy(() => import('../pages/signals-page').then((m) => ({ default: m.SignalsPage })));
const PolymarketAccountPage = lazy(() => import('../pages/polymarket-account-page').then((m) => ({ default: m.PolymarketAccountPage })));
const AiStatsPage = lazy(() => import('../pages/ai-stats-page').then((m) => ({ default: m.AiStatsPage })));
const LlmAnalysisPage = lazy(() => import('../pages/llm-analysis-page').then((m) => ({ default: m.LlmAnalysisPage })));
const PromptVariantsPage = lazy(() => import('../pages/prompt-variants-page').then((m) => ({ default: m.PromptVariantsPage })));
const AllocationPage = lazy(() => import('../pages/allocation-page').then((m) => ({ default: m.AllocationPage })));
const AnalysisReportPage = lazy(() => import('../pages/analysis-report-page').then((m) => ({ default: m.AnalysisReportPage })));
const ValidationLabPage = lazy(() => import('../pages/validation-lab-page').then((m) => ({ default: m.ValidationLabPage })));
const NotFoundPage = lazy(() => import('../pages/not-found-page').then((m) => ({ default: m.NotFoundPage })));

// New simulation-first pages (placeholders until M3-M5)
const EventLobbyPage = lazy(() => import('../pages/event-lobby-page').then((m) => ({ default: m.EventLobbyPage })));
const AccountWorkspacePage = lazy(() => import('../pages/account-workspace-page').then((m) => ({ default: m.AccountWorkspacePage })));
const StrategyLabPage = lazy(() => import('../pages/strategy-lab-page').then((m) => ({ default: m.StrategyLabPage })));
const SettingsPage = lazy(() => import('../pages/settings-page').then((m) => ({ default: m.SettingsPage })));

function PageLoader() {
  const { t } = useI18n();
  return <LoadingState className="py-20" label={t('common.loading')} />;
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
      { path: 'bankroll', element: withSuspense(AccountWorkspacePage) },
      { path: 'review', element: <Navigate to="/bankroll?section=review" replace /> },
      { path: 'database', element: <Navigate to="/settings?section=database" replace /> },
      { path: 'strategy', element: withSuspense(StrategyLabPage) },
      { path: 'analysis/report', element: withSuspense(AnalysisReportPage) },
      { path: 'analysis/report/:runId', element: withSuspense(AnalysisReportPage) },
      { path: 'validation-lab', element: withSuspense(ValidationLabPage) },
      { path: 'settings', element: withSuspense(SettingsPage) },
      { path: 'whales', element: withSuspense(WhalesPage) },
      { path: 'whales/:address', element: withSuspense(WhaleDetailPage) },
      { path: 'esports', element: withSuspense(EsportsPage) },
      { path: 'signals', element: withSuspense(SignalsPage) },
      { path: 'polymarket/account', element: withSuspense(PolymarketAccountPage) },
      { path: 'ai/config', element: <Navigate to="/settings?section=llm" replace /> },
      { path: 'ai/stats', element: withSuspense(AiStatsPage) },
      { path: 'llm/analysis/:providerId', element: withSuspense(LlmAnalysisPage) },
      { path: 'prompt-variants', element: withSuspense(PromptVariantsPage) },
      { path: 'allocation', element: withSuspense(AllocationPage) },
      { path: 'simulation', element: <Navigate to="/bankroll?section=simulation" replace /> },
      { path: '*', element: withSuspense(NotFoundPage) },
    ],
  },
]);
