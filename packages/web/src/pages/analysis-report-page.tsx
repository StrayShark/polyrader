import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { FileJson2, RefreshCw, Copy, FlaskConical, BookOpen, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../utils/api';
import { useI18n } from '../hooks/use-i18n';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { Badge, Button, Card, CardHeader, CardTitle } from '@/components/ui';
import { cn } from '../utils/cn';
import {
  CS2_ANALYSIS_REPORT_FIXTURE,
  mapAnalysisRunDetailToViewModel,
  type AnalysisReportViewModel,
  type ReportTab,
} from '../fixtures/cs2-analysis-report';

function pct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function pp(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(1)}pp`;
}

function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `$${value.toFixed(2)}`;
}

export function AnalysisReportPage() {
  const { t } = useI18n();
  const { runId: routeRunId } = useParams<{ runId?: string }>();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<ReportTab>('report');
  const [view, setView] = useState<AnalysisReportViewModel>(CS2_ANALYSIS_REPORT_FIXTURE);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'fixture' | 'api'>('fixture');
  const [settling, setSettling] = useState(false);

  const loadFixtureLocal = () => {
    setView(CS2_ANALYSIS_REPORT_FIXTURE);
    setSource('fixture');
    setError(null);
  };

  const loadFromApi = async (runId?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      if (runId) {
        const { data } = await api.get<{ data: Parameters<typeof mapAnalysisRunDetailToViewModel>[0] }>(
          `/analysis/runs/${encodeURIComponent(runId)}`,
        );
        const mapped = mapAnalysisRunDetailToViewModel(data);
        if (!mapped) throw new Error(t('analysisReport.incompleteRun'));
        setView(mapped);
        setSource('api');
      } else {
        const { data } = await api.post<{ data: Parameters<typeof mapAnalysisRunDetailToViewModel>[0] }>(
          '/analysis/execute',
          {
            game: searchParams.get('game') ?? view.envelope.game,
            matchId: searchParams.get('matchId') ?? undefined,
          },
          { timeoutMs: 120000 },
        );
        const mapped = mapAnalysisRunDetailToViewModel(data);
        if (!mapped) throw new Error(t('analysisReport.incompleteRun'));
        setView(mapped);
        setSource('api');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const queryRunId = searchParams.get('runId') ?? routeRunId;
    const preferApi = searchParams.get('live') === '1' || Boolean(queryRunId);
    if (preferApi) {
      void loadFromApi(queryRunId ?? undefined);
    } else {
      loadFixtureLocal();
    }
  }, [routeRunId, searchParams]);

  const copyReportId = async () => {
    try {
      await navigator.clipboard.writeText(view.reportId);
    } catch {
      /* ignore */
    }
  };

  const settleLinkedBet = async (result: 'won' | 'lost') => {
    if (!view.linkedBet || view.linkedBet.status !== 'open') return;
    setSettling(true);
    setError(null);
    try {
      await api.patch(`/sim/bets/${encodeURIComponent(view.linkedBet.id)}/settle`, { result });
      await loadFromApi(view.runId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSettling(false);
    }
  };

  const matchTitle = `${view.envelope.match.participants[0]?.name ?? 'A'} vs ${view.envelope.match.participants[1]?.name ?? 'B'}`;
  const tabs: Array<{ id: ReportTab; label: string }> = [
    { id: 'report', label: t('analysisReport.tabReport') },
    { id: 'prompt', label: t('analysisReport.tabPrompt') },
    { id: 'response', label: t('analysisReport.tabResponse') },
    { id: 'timeline', label: t('analysisReport.tabTimeline') },
  ];

  return (
    <div className="space-y-6" data-testid="analysis-report-page">
      <Breadcrumbs
        items={[
          { label: t('nav.strategy'), to: '/strategy' },
          { label: t('nav.analysisReport') },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <FileJson2 className="h-6 w-6 text-primary" />
            {t('analysisReport.title')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('analysisReport.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={view.validationStatus === 'valid' ? 'green' : 'destructive'}>
            {view.validationStatus === 'valid' ? t('analysisReport.schemaValid') : t('analysisReport.schemaInvalid')}
          </Badge>
          <Badge variant="outline">{source === 'fixture' ? t('analysisReport.sourceFixture') : t('analysisReport.sourceApi')}</Badge>
          <Button variant="outline" size="sm" onClick={copyReportId}>
            <Copy className="h-3.5 w-3.5" />
            {t('analysisReport.copyReportId')}
          </Button>
          <Button variant="outline" size="sm" onClick={loadFixtureLocal} disabled={isLoading}>
            <FlaskConical className="h-3.5 w-3.5" />
            {t('analysisReport.loadFixture')}
          </Button>
          <Button size="sm" onClick={() => void loadFromApi()} disabled={isLoading}>
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            {t('analysisReport.runPipeline')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error} · {t('analysisReport.fallbackHint')}
        </div>
      )}

      <Card data-testid="analysis-report-shell">
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">
              {matchTitle} · {view.report.marketKind.replaceAll('_', ' ')}
            </CardTitle>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              report · {view.reportId}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">{view.envelope.game.toUpperCase()}</Badge>
            <Badge variant="outline">{view.provider} · {view.model}</Badge>
            <Badge variant="outline">prompt {view.envelope.promptVersion}</Badge>
            <Badge variant="secondary">{Math.round(view.report.dataQuality.completeness * 100)}% data</Badge>
          </div>
        </CardHeader>

        <div className="grid gap-4 border-t border-border p-4 lg:grid-cols-[1fr_240px]">
          <div className="space-y-3">
            {view.report.marketComparison.map((row) => (
              <div key={row.outcomeId} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <strong>{row.label}</strong>
                  <div className="flex items-center gap-3 font-mono text-xs">
                    <span>{pct(row.modelProbability)}</span>
                    <span className={row.edge >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{pp(row.edge)}</span>
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded bg-muted">
                  <div
                    className="h-full rounded bg-primary/80 transition-all"
                    style={{ width: `${Math.max(4, row.modelProbability * 100)}%` }}
                  />
                </div>
              </div>
            ))}
            <p className="text-sm text-muted-foreground">{view.report.rationaleSummary}</p>
          </div>

          <aside className="rounded-md border border-border bg-muted/30 p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{t('analysisReport.decision')}</div>
            <div className="mt-1 text-sm font-semibold text-emerald-600">
              {view.decision.action.toUpperCase()}
              {view.decision.outcomeId ? ` · ${view.decision.outcomeId.toUpperCase()}` : ''}
            </div>
            <div className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">{t('analysisReport.modelProb')}</span><span className="font-mono">{pct(view.decision.modelProbability)}</span></div>
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">{t('analysisReport.marketProb')}</span><span className="font-mono">{pct(view.decision.marketProbability)}</span></div>
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">{t('analysisReport.confidence')}</span><span className="font-mono">{pct(view.report.confidence.score)}</span></div>
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">{t('analysisReport.stake')}</span><span className="font-mono">{money(view.decision.stake)}</span></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {view.decision.reasonCodes.map((code) => (
                <Badge key={code} variant="green">{code}</Badge>
              ))}
            </div>
            <div className="mt-4 border-t border-border pt-3" data-testid="analysis-linked-bet">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{t('analysisReport.linkedBet')}</div>
              {view.linkedBet ? (
                <div className="mt-2 space-y-1.5 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t('analysisReport.betId')}</span>
                    <span className="font-mono text-xs">{view.linkedBet.id.slice(0, 18)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t('analysisReport.betStatus')}</span>
                    <Badge variant={view.linkedBet.status === 'settled' ? 'green' : view.linkedBet.status === 'voided' ? 'secondary' : 'outline'}>
                      {view.linkedBet.status}
                      {view.linkedBet.result ? ` · ${view.linkedBet.result}` : ''}
                    </Badge>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t('analysisReport.betStake')}</span>
                    <span className="font-mono">{money(view.linkedBet.stake)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t('analysisReport.betPnl')}</span>
                    <span className={`font-mono ${view.linkedBet.pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {view.linkedBet.status === 'open' ? '—' : money(view.linkedBet.pnl)}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      to={`/bankroll?section=review&betId=${encodeURIComponent(view.linkedBet.id)}`}
                      className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 text-xs hover:bg-accent"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      {t('analysisReport.openReview')}
                    </Link>
                    {view.linkedBet.status === 'open' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={settling}
                          onClick={() => void settleLinkedBet('won')}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {t('analysisReport.settleWon')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={settling}
                          onClick={() => void settleLinkedBet('lost')}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          {t('analysisReport.settleLost')}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  {view.decision.action === 'paper_bet'
                    ? t('analysisReport.linkedBetPending')
                    : t('analysisReport.linkedBetNone')}
                </p>
              )}
            </div>
          </aside>
        </div>

        <div className="flex gap-1 border-t border-border px-3 pt-3" role="tablist">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              data-testid={`analysis-tab-${item.id}`}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm transition-colors',
                tab === item.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="p-4" data-testid={`analysis-pane-${tab}`}>
          {tab === 'report' && (
            <div className="space-y-3">
              {view.report.evidence.map((item, index) => (
                <div key={`ev-${index}`} className="rounded-md border border-border p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <strong className="text-sm">{item.summary.slice(0, 40)}</strong>
                    <Badge variant={item.direction === 'supports' ? 'green' : 'secondary'}>{item.direction}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {item.summary}
                    <span className="ml-2 font-mono text-xs">fact: {item.factIds.join(', ')}</span>
                  </p>
                </div>
              ))}
              {view.report.risks.map((item) => (
                <div key={item.code} className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <strong className="text-sm">{item.code}</strong>
                    <Badge variant="yellow">{item.severity}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{item.summary}</p>
                </div>
              ))}
            </div>
          )}

          {tab === 'prompt' && (
            <div className="space-y-3">
              <p className="font-mono text-xs text-muted-foreground">{view.promptArtifact.promptHash}</p>
              <pre className="max-h-[480px] overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed">
                {view.promptArtifact.userEnvelopeJson}
              </pre>
            </div>
          )}

          {tab === 'response' && (
            <pre className="max-h-[480px] overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed">
              {view.rawResponse}
            </pre>
          )}

          {tab === 'timeline' && (
            <div className="space-y-2">
              {view.events.map((event, index) => (
                <div
                  key={`${event.stage}-${index}`}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {new Date(event.createdAt).toLocaleTimeString()}
                  </span>
                  <Badge variant={event.status === 'failed' ? 'destructive' : event.status === 'warning' ? 'yellow' : 'green'}>
                    {event.status}
                  </Badge>
                  <strong className="capitalize">{event.stage}</strong>
                  <span className="text-muted-foreground">{event.detail}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
