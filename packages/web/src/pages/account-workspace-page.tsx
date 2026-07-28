import { lazy, Suspense } from 'react';
import { BarChart3, BookOpen, ClipboardList, FlaskConical, Wallet } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { useI18n } from '../hooks/use-i18n';

const LedgerSection = lazy(() =>
  import('./bankroll-page').then((module) => ({ default: module.BankrollPage })),
);
const PaperOrdersSection = lazy(() =>
  import('./paper-orders-page').then((module) => ({ default: module.PaperOrdersPage })),
);
const SimulationSection = lazy(() =>
  import('./simulation-page').then((module) => ({ default: module.SimulationPage })),
);
const PerformanceSection = lazy(() =>
  import('./performance-page').then((module) => ({ default: module.PerformancePage })),
);
const ReviewSection = lazy(() =>
  import('./review-page').then((module) => ({ default: module.ReviewPage })),
);

type AccountSection = 'ledger' | 'simulation' | 'orders' | 'performance' | 'review';

function getAccountSection(value: string | null): AccountSection {
  if (
    value === 'simulation' ||
    value === 'orders' ||
    value === 'performance' ||
    value === 'review'
  ) {
    return value;
  }
  return 'ledger';
}

function SectionLoader() {
  return (
    <div className="space-y-3 py-1" aria-busy="true">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function AccountWorkspacePage() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const section = getAccountSection(searchParams.get('section'));

  const changeSection = (next: string) => {
    const nextSection = getAccountSection(next);
    setSearchParams(nextSection === 'ledger' ? {} : { section: nextSection }, { replace: true });
  };

  return (
    <div className="space-y-4" data-testid="account-workspace">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('accountWorkspace.title')}</h1>
      </div>

      <Tabs value={section} onValueChange={changeSection} className="space-y-4">
        <TabsList
          className="h-auto w-full justify-start overflow-x-auto rounded-md border border-border bg-transparent p-1"
          data-testid="account-workspace-tabs"
        >
          <TabsTrigger value="ledger" className="gap-2">
            <Wallet className="h-4 w-4" />
            {t('accountWorkspace.ledger')}
          </TabsTrigger>
          <TabsTrigger value="simulation" className="gap-2">
            <FlaskConical className="h-4 w-4" />
            {t('accountWorkspace.simulation')}
          </TabsTrigger>
          <TabsTrigger value="orders" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            {t('accountWorkspace.orders')}
          </TabsTrigger>
          <TabsTrigger value="performance" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            {t('accountWorkspace.performance')}
          </TabsTrigger>
          <TabsTrigger value="review" className="gap-2">
            <BookOpen className="h-4 w-4" />
            {t('accountWorkspace.review')}
          </TabsTrigger>
        </TabsList>

        <Suspense fallback={<SectionLoader />}>
          <TabsContent value="ledger" className="mt-0">
            <LedgerSection embedded />
          </TabsContent>
          <TabsContent value="simulation" className="mt-0">
            <SimulationSection embedded />
          </TabsContent>
          <TabsContent value="orders" className="mt-0">
            <PaperOrdersSection embedded />
          </TabsContent>
          <TabsContent value="performance" className="mt-0">
            <PerformanceSection embedded />
          </TabsContent>
          <TabsContent value="review" className="mt-0">
            <ReviewSection embedded />
          </TabsContent>
        </Suspense>
      </Tabs>
    </div>
  );
}
