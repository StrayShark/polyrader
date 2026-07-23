import { useEffect, useState } from 'react';
import {
  BrainCircuit,
  ClipboardCheck,
  DatabaseZap,
  Download,
  ExternalLink,
  FlaskConical,
  History,
  RefreshCw,
  Scale,
  ShieldCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';
import { useI18n } from '../hooks/use-i18n';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { Badge, Button, Card, CardHeader, CardTitle } from '@/components/ui';
import { cn } from '../utils/cn';
import { isPrematchAnalysisEligible } from '../utils/match-eligibility';
import { DotaDataQualityPanel } from '../components/DotaDataQualityPanel';
import { RiotGameDataQualityPanel } from '../components/RiotGameDataQualityPanel';
import { DotaSprint3EvidencePanel } from '../components/DotaSprint3EvidencePanel';
import type {
  BoardReleaseGateSummary,
  BoardValidationSummary,
  CurrentSourceReleaseAuditResult,
  EsportsGame,
  EsportsSourceSyncResult,
  EsportsTeamAlias,
  ReleaseAuditHistoryEntry,
  ReleaseDiagnosticsBundle,
  ReleaseLifecycleSummary,
} from '@polyrader/core/browser';

const GAMES: EsportsGame[] = ['cs2', 'lol', 'dota2', 'valorant'];

interface MatchSettlementResult {
  source: 'opendota' | 'grid' | 'unknown';
  status: 'pending' | 'settled' | 'unavailable';
  winnerTeamName?: string;
  settledBets: number;
  resolvedMarkets: number;
  message?: string;
}

function freshnessLabel(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export function ValidationLabPage() {
  const { t } = useI18n();
  const [game, setGame] = useState<EsportsGame>('cs2');
  const [boards, setBoards] = useState<BoardValidationSummary[]>([]);
  const [releaseGates, setReleaseGates] = useState<BoardReleaseGateSummary[]>([]);
  const [active, setActive] = useState<BoardValidationSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<EsportsSourceSyncResult | null>(null);
  const [latestRunId, setLatestRunId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [settlementResult, setSettlementResult] = useState<MatchSettlementResult | null>(null);
  const [isReconciling, setIsReconciling] = useState(false);
  const [releaseAudit, setReleaseAudit] = useState<CurrentSourceReleaseAuditResult | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditHistory, setAuditHistory] = useState<ReleaseAuditHistoryEntry[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [lifecycle, setLifecycle] = useState<ReleaseLifecycleSummary | null>(null);
  const [teamAliases, setTeamAliases] = useState<EsportsTeamAlias[]>([]);
  const [selectedDotaMarketId, setSelectedDotaMarketId] = useState<string | undefined>();

  const loadTeamAliases = async () => {
    if (game !== 'dota2' && game !== 'lol' && game !== 'valorant') {
      setTeamAliases([]);
      return;
    }
    const response = await api.get<{ data: EsportsTeamAlias[] }>(
      `/esports/sources/${game}/team-aliases?limit=200`,
    );
    setTeamAliases(response.data);
  };

  const load = async (selected = game) => {
    setIsLoading(true);
    setError(null);
    try {
      const [list, gates, history, lifecycleResult] = await Promise.all([
        api.get<{ data: BoardValidationSummary[] }>('/validation-lab/boards'),
        api.get<{ data: BoardReleaseGateSummary[] }>('/validation-lab/release-gates'),
        api.get<{ data: ReleaseAuditHistoryEntry[] }>(
          `/validation-lab/release-audits?game=${selected}&limit=10`,
        ),
        api.get<{ data: ReleaseLifecycleSummary }>(`/validation-lab/lifecycle/${selected}`),
      ]);
      setBoards(list.data);
      setReleaseGates(gates.data);
      setAuditHistory(history.data);
      setLifecycle(lifecycleResult.data);
      const detail = await api.post<{ data: { summary: BoardValidationSummary } }>(
        `/validation-lab/boards/${selected}/normalize`,
        {},
      );
      setActive(detail.data.summary);
      setSelectedDotaMarketId(detail.data.summary.analysisEligibility?.selectedMarket?.marketId);
      if (selected === 'dota2' || selected === 'lol' || selected === 'valorant') {
        const aliases = await api.get<{ data: EsportsTeamAlias[] }>(
          `/esports/sources/${selected}/team-aliases?limit=200`,
        );
        setTeamAliases(aliases.data);
      } else {
        setTeamAliases([]);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const syncAndNormalize = async () => {
    setIsLoading(true);
    setError(null);
    setSyncResult(null);
    setLatestRunId(null);
    try {
      const synced = await api.post<{ data: EsportsSourceSyncResult }>(
        `/esports/sources/${game}/sync`,
      );
      setSyncResult(synced.data);
      const detail = await api.post<{ data: { summary: BoardValidationSummary } }>(
        `/validation-lab/boards/${game}/normalize`,
        { discoverMarkets: ['dota2', 'lol', 'valorant', 'cs2'].includes(game) },
      );
      setActive(detail.data.summary);
      setSelectedDotaMarketId(detail.data.summary.analysisEligibility?.selectedMarket?.marketId);
      const list = await api.get<{ data: BoardValidationSummary[] }>('/validation-lab/boards');
      setBoards(list.data);
      const history = await api.get<{ data: ReleaseAuditHistoryEntry[] }>(
        `/validation-lab/release-audits?game=${game}&limit=10`,
      );
      setAuditHistory(history.data);
      const lifecycleResult = await api.get<{ data: ReleaseLifecycleSummary }>(
        `/validation-lab/lifecycle/${game}`,
      );
      setLifecycle(lifecycleResult.data);
      const gates = await api.get<{ data: BoardReleaseGateSummary[] }>(
        '/validation-lab/release-gates',
      );
      setReleaseGates(gates.data);
      await loadTeamAliases();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const exportDiagnostics = async () => {
    setIsExporting(true);
    setError(null);
    try {
      const response = await api.get<{ data: ReleaseDiagnosticsBundle }>(
        '/validation-lab/diagnostics/export?limit=50',
      );
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `polyrader-release-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsExporting(false);
    }
  };

  const runAnalysis = async () => {
    if (
      !board?.sampleMatch ||
      !isPrematchAnalysisEligible(board.sampleMatch.status, board.sampleMatch.startsAt)
    )
      return;
    setIsAnalyzing(true);
    setError(null);
    try {
      const response = await api.post<{ data: { run: { runId: string } } }>(
        '/analysis/execute',
        {
          game,
          matchId: board.sampleMatch.externalMatchId,
          ...(game === 'dota2' && selectedDotaMarketId
            ? { market: { marketId: selectedDotaMarketId } }
            : {}),
        },
        { timeoutMs: 120000 },
      );
      setLatestRunId(response.data.run.runId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const runFixtureAnalysis = async () => {
    setIsAnalyzing(true);
    setError(null);
    try {
      const response = await api.post<{ data: { run: { runId: string } } }>(
        '/analysis/runs/fixture',
        { game: 'dota2', provider: 'fixture', model: 'dota2-sprint4-fixture-v1' },
      );
      setLatestRunId(response.data.run.runId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const runReleaseAudit = async () => {
    setIsAuditing(true);
    setError(null);
    setReleaseAudit(null);
    setLatestRunId(null);
    try {
      const response = await api.post<{ data: CurrentSourceReleaseAuditResult }>(
        `/validation-lab/release-audits/${game}`,
        { executeAnalysis: true },
        { timeoutMs: 180000 },
      );
      setReleaseAudit(response.data);
      setSyncResult(response.data.sync);
      setActive(response.data.board);
      setLatestRunId(response.data.analysis.runId ?? null);
      setReleaseGates((current) => [
        ...current.filter((item) => item.game !== game),
        response.data.gate,
      ]);
      const list = await api.get<{ data: BoardValidationSummary[] }>('/validation-lab/boards');
      setBoards(list.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsAuditing(false);
    }
  };

  const reconcileMatch = async () => {
    if (!['lol', 'dota2', 'valorant'].includes(game) || !board?.sampleMatch) return;
    setIsReconciling(true);
    setError(null);
    setSettlementResult(null);
    try {
      const response = await api.post<{ data: MatchSettlementResult }>(
        `/esports/${game}/matches/${encodeURIComponent(board.sampleMatch.externalMatchId)}/reconcile`,
      );
      setSettlementResult(response.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsReconciling(false);
    }
  };

  useEffect(() => {
    setSettlementResult(null);
    setReleaseAudit(null);
    void load(game);
  }, [game]);

  const board = active ?? boards.find((item) => item.game === game) ?? null;
  const verifiedBoards = releaseGates.filter((gate) => gate.status === 'verified').length;
  const canReconcileMatch =
    ['lol', 'dota2', 'valorant'].includes(game) &&
    Boolean(board?.sampleMatch) &&
    !['scheduled', 'upcoming', 'pre_match'].includes(board?.sampleMatch?.status ?? '') &&
    Date.parse(board?.sampleMatch?.startsAt ?? '') <= Date.now();
  const canRunAnalysis = Boolean(
    board?.sampleMatch &&
    isPrematchAnalysisEligible(board.sampleMatch.status, board.sampleMatch.startsAt) &&
    (!['dota2', 'lol', 'valorant'].includes(game) ||
      board.analysisEligibility?.analysisEligible),
  );

  return (
    <div className="space-y-6" data-testid="validation-lab-page">
      <Breadcrumbs items={[{ label: t('nav.validationLab') }]} />

      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-start 2xl:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ClipboardCheck className="h-6 w-6 text-primary" />
            {t('validationLab.title')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('validationLab.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void load(game)} disabled={isLoading}>
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            {t('validationLab.refreshFacts')}
          </Button>
          <Button size="sm" onClick={() => void syncAndNormalize()} disabled={isLoading}>
            <DatabaseZap className="h-3.5 w-3.5" />
            {t('validationLab.runBoard')}
          </Button>
          <Button
            size="sm"
            onClick={() => void runReleaseAudit()}
            disabled={isAuditing || isLoading}
            data-testid="run-release-audit"
          >
            <ShieldCheck className={cn('h-3.5 w-3.5', isAuditing && 'animate-pulse')} />
            {t('validationLab.runReleaseAudit')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void exportDiagnostics()}
            disabled={isExporting}
            data-testid="export-release-diagnostics"
          >
            <Download className="h-3.5 w-3.5" />
            {t('validationLab.exportDiagnostics')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {syncResult && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
          data-testid="validation-sync-result"
        >
          <Badge
            variant={
              syncResult.status === 'success'
                ? 'green'
                : syncResult.status === 'partial'
                  ? 'yellow'
                  : 'destructive'
            }
          >
            {syncResult.status}
          </Badge>
          <span>
            {syncResult.records} {t('validationLab.records')}
          </span>
          {syncResult.sources.map((source) => (
            <span key={source.source} className="text-xs text-muted-foreground">
              {source.source}: {source.status} ({source.records})
              {source.message ? ` · ${source.message}` : ''}
            </span>
          ))}
        </div>
      )}

      {releaseAudit && (
        <div className="space-y-2" data-testid="release-audit-result">
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
            <Badge
              variant={
                releaseAudit.analysis.status === 'completed'
                  ? 'green'
                  : releaseAudit.analysis.status === 'failed'
                    ? 'destructive'
                    : 'yellow'
              }
            >
              {releaseAudit.analysis.status}
            </Badge>
            {releaseAudit.analysis.failure && (
              <Badge variant="destructive">{releaseAudit.analysis.failure.category}</Badge>
            )}
            <span>{releaseAudit.analysis.detail}</span>
            <Badge variant={releaseAudit.gate.status === 'verified' ? 'green' : 'secondary'}>
              {releaseAudit.gate.status}
            </Badge>
            {releaseAudit.analysis.runId && (
              <Link
                to={`/analysis/report/${encodeURIComponent(releaseAudit.analysis.runId)}`}
                className="inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
              >
                {t('validationLab.openReport')}
                <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>
          <div className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
            {releaseAudit.stageTimings.map((stage) => (
              <div key={stage.stage} className="min-w-0 bg-card px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{stage.stage.replaceAll('_', ' ')}</span>
                  <span className="font-mono text-muted-foreground">{stage.durationMs}ms</span>
                </div>
                <div className="mt-1 truncate text-muted-foreground" title={stage.detail}>
                  {stage.status} · {stage.detail}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Card data-testid="release-gate-summary">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{t('validationLab.releaseGate')}</CardTitle>
          <Badge variant={verifiedBoards === GAMES.length ? 'green' : 'yellow'}>
            {verifiedBoards}/{GAMES.length} {t('validationLab.verifiedBoards')}
          </Badge>
        </CardHeader>
        <div className="grid gap-px border-t border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
          {GAMES.map((item) => {
            const gate = releaseGates.find((candidate) => candidate.game === item);
            const blocker = gate?.currentSource.blockers[0];
            return (
              <div key={item} className="min-w-0 bg-card p-3" data-testid={`release-gate-${item}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold uppercase">{item}</span>
                  <Badge variant={gate?.status === 'verified' ? 'green' : 'yellow'}>
                    {gate?.status ?? 'checking'}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                  <Badge variant={gate?.fixture.status === 'passed' ? 'green' : 'secondary'}>
                    {t('validationLab.fixtureEvidence')}: {gate?.fixture.status ?? 'checking'}
                  </Badge>
                  <Badge variant={gate?.currentSource.status === 'passed' ? 'green' : 'secondary'}>
                    {t('validationLab.currentSourceEvidence')}:{' '}
                    {gate?.currentSource.status ?? 'checking'}
                  </Badge>
                </div>
                <p className="mt-2 truncate text-xs text-muted-foreground" title={blocker}>
                  {blocker ?? t('validationLab.noBlockers')}
                </p>
              </div>
            );
          })}
        </div>
      </Card>

      {lifecycle && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-xs"
          data-testid="release-lifecycle"
        >
          <span className="font-medium">{t('validationLab.lifecycle')}</span>
          <Badge variant={lifecycle.closing === 'captured' ? 'green' : 'secondary'}>
            close: {lifecycle.closing}
          </Badge>
          <Badge variant={lifecycle.settlement === 'settled' ? 'green' : 'secondary'}>
            settlement: {lifecycle.settlement}
          </Badge>
          <Badge variant={lifecycle.statistics === 'complete' ? 'green' : 'secondary'}>
            stats: {lifecycle.statistics}
          </Badge>
          <span className="min-w-0 basis-full text-muted-foreground lg:basis-auto lg:flex-1">
            {lifecycle.nextAction}
          </span>
        </div>
      )}

      <Card data-testid="release-audit-history">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            {t('validationLab.auditHistory')}
          </CardTitle>
          <Badge variant="secondary">{auditHistory.length}</Badge>
        </CardHeader>
        <div className="divide-y divide-border border-t border-border">
          {auditHistory.length === 0 ? (
            <p className="px-4 py-5 text-sm text-muted-foreground">
              {t('validationLab.noAuditHistory')}
            </p>
          ) : (
            auditHistory.map((audit) => (
              <div
                key={audit.auditId}
                className="grid gap-2 px-4 py-3 text-xs lg:grid-cols-[150px_1fr_auto]"
              >
                <div>
                  <Badge
                    variant={
                      audit.outcome === 'verified'
                        ? 'green'
                        : audit.outcome === 'failed'
                          ? 'destructive'
                          : 'yellow'
                    }
                  >
                    {audit.outcome}
                  </Badge>
                  {audit.providerFailure && (
                    <div className="mt-1 text-destructive">{audit.providerFailure.category}</div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {audit.externalMatchId ?? t('validationLab.noSample')} · {audit.boardState}
                  </div>
                  <div className="mt-1 truncate text-muted-foreground" title={audit.blockers[0]}>
                    {audit.blockers[0] ?? t('validationLab.noBlockers')}
                  </div>
                </div>
                <div className="text-right font-mono text-muted-foreground">
                  <div>{audit.durationMs}ms</div>
                  <div>{new Date(audit.startedAt).toLocaleString()}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <div className="flex flex-wrap gap-2" role="tablist">
        {GAMES.map((item) => (
          <button
            key={item}
            type="button"
            data-testid={`validation-game-${item}`}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm',
              game === item
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground',
            )}
            onClick={() => setGame(item)}
          >
            {item.toUpperCase()}
          </button>
        ))}
        {board && (
          <Badge variant={board.boardState === 'paper_ready' ? 'green' : 'yellow'}>
            {board.boardState}
          </Badge>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric
          label={t('validationLab.completeness')}
          value={`${Math.round((board?.completeness ?? 0) * 100)}%`}
          meta={t('validationLab.minCompleteness')}
        />
        <Metric
          label={t('validationLab.freshness')}
          value={freshnessLabel(board?.freshnessSeconds ?? Number.POSITIVE_INFINITY)}
          meta={t('validationLab.maxAge')}
        />
        <Metric
          label={t('validationLab.sources')}
          value={String(board?.sourceCount ?? 0)}
          meta={`${board?.matchCount ?? 0} matches`}
        />
        <Metric
          label={t('validationLab.missing')}
          value={String(board?.missing.length ?? 0)}
          meta={(board?.missing ?? []).slice(0, 2).join(', ') || '—'}
        />
      </div>

      {game === 'dota2' && board?.sampleMatch && <DotaDataQualityPanel match={board.sampleMatch} />}
      {(game === 'lol' || game === 'valorant') && board?.sampleMatch && (
        <RiotGameDataQualityPanel match={board.sampleMatch} />
      )}
      {(game === 'dota2' || game === 'lol' || game === 'valorant') && (
        <DotaSprint3EvidencePanel
          game={game}
          alignment={board?.marketAlignment}
          eligibility={board?.analysisEligibility}
          aliases={teamAliases}
          selectedMarketId={
            selectedDotaMarketId ?? board?.analysisEligibility?.selectedMarket?.marketId
          }
          onSelectMarket={setSelectedDotaMarketId}
          onReviewed={() => void loadTeamAliases()}
        />
      )}

      {(game === 'lol' || game === 'valorant') &&
        board?.stages.some(
          (stage) =>
            stage.stage === 'settlement' &&
            stage.detail.toLowerCase().includes('liquipedia-only'),
        ) && (
          <Card
            className="border-amber-500/40 bg-amber-500/5"
            data-testid={`${game}-liquipedia-only-settlement`}
          >
            <CardHeader className="py-3">
              <CardTitle className="text-sm">{t('validationLab.liquipediaOnlyTitle')}</CardTitle>
            </CardHeader>
            <div className="px-4 pb-4 text-sm text-muted-foreground">
              {t('validationLab.liquipediaOnlyBody')}
            </div>
          </Card>
        )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">{t('validationLab.stages')}</CardTitle>
          </CardHeader>
          <div className="space-y-2 px-4 pb-4">
            {(board?.stages ?? []).map((stage) => (
              <div
                key={stage.stage}
                className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"
              >
                <Badge
                  variant={
                    stage.status === 'passed'
                      ? 'green'
                      : stage.status === 'warning'
                        ? 'yellow'
                        : stage.status === 'failed'
                          ? 'destructive'
                          : 'secondary'
                  }
                >
                  {stage.status}
                </Badge>
                <div className="min-w-0 flex-1">
                  <div className="font-medium capitalize">{stage.stage.replaceAll('_', ' ')}</div>
                  <div className="truncate text-xs text-muted-foreground">{stage.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">{t('validationLab.sampleMatch')}</CardTitle>
          </CardHeader>
          <div className="space-y-3 px-4 pb-4 text-sm">
            {board?.sampleMatch ? (
              <>
                <div className="font-medium">
                  {board.sampleMatch.participants.map((p) => p.name).join(' vs ')}
                </div>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary">{board.sampleMatch.status}</Badge>
                  {!canRunAnalysis && (
                    <Badge variant="yellow" data-testid="historical-sample-badge">
                      {t('validationLab.historicalSample')}
                    </Badge>
                  )}
                </div>
                <div className="text-muted-foreground">
                  {board.sampleMatch.eventName} · {board.sampleMatch.format} ·{' '}
                  {board.sampleMatch.startsAt}
                </div>
                <div className="font-mono text-xs text-muted-foreground break-all">
                  {board.sampleMatch.dataSnapshotHash}
                </div>
                <div className="flex flex-wrap gap-1">
                  {board.sampleMatch.missing.map((item) => (
                    <Badge key={item} variant="yellow">
                      {item}
                    </Badge>
                  ))}
                  {board.conflictFlags.map((item) => (
                    <Badge key={item} variant="destructive">
                      {item}
                    </Badge>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md border border-border p-2">
                    <div className="text-xs text-muted-foreground">players</div>
                    <div className="font-mono">{board.sampleMatch.players.length}</div>
                  </div>
                  <div className="rounded-md border border-border p-2">
                    <div className="text-xs text-muted-foreground">facts</div>
                    <div className="font-mono">{board.sampleMatch.facts.length}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  <Button
                    size="sm"
                    onClick={() => void runAnalysis()}
                    disabled={isAnalyzing || !canRunAnalysis}
                    title={
                      !canRunAnalysis
                        ? board.analysisEligibility?.reasonCodes.join(', ') ||
                          t('validationLab.analysisRequiresPrematch')
                        : undefined
                    }
                    data-testid="run-standard-analysis"
                  >
                    <BrainCircuit className={cn('h-3.5 w-3.5', isAnalyzing && 'animate-pulse')} />
                    {t('validationLab.runAnalysis')}
                  </Button>
                  {game === 'dota2' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void runFixtureAnalysis()}
                      disabled={isAnalyzing}
                      data-testid="run-dota-fixture-analysis"
                    >
                      <FlaskConical className="h-3.5 w-3.5" />
                      {t('validationLab.runDotaFixture')}
                    </Button>
                  )}
                  {latestRunId && (
                    <Link
                      to={`/analysis/report/${encodeURIComponent(latestRunId)}`}
                      className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 text-xs hover:bg-accent"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {t('validationLab.openReport')}
                    </Link>
                  )}
                  {canReconcileMatch && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void reconcileMatch()}
                      disabled={isReconciling}
                      data-testid={`${game}-reconcile-button`}
                    >
                      <Scale className={cn('h-3.5 w-3.5', isReconciling && 'animate-pulse')} />
                      {t('validationLab.reconcileDota2')}
                    </Button>
                  )}
                </div>
                {settlementResult && (
                  <div
                    className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-xs"
                    data-testid={`${game}-settlement-result`}
                  >
                    <Badge variant={settlementResult.status === 'settled' ? 'green' : 'yellow'}>
                      {settlementResult.status}
                    </Badge>
                    <span>{settlementResult.source}</span>
                    {settlementResult.winnerTeamName && (
                      <span className="font-medium">{settlementResult.winnerTeamName}</span>
                    )}
                    <span>
                      {settlementResult.settledBets} {t('validationLab.settledBets')}
                    </span>
                    <span>
                      {settlementResult.resolvedMarkets} {t('validationLab.resolvedMarkets')}
                    </span>
                    {settlementResult.message && (
                      <span className="text-muted-foreground">{settlementResult.message}</span>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">{t('validationLab.noSample')}</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Metric(props: { label: string; value: string; meta: string }) {
  return (
    <Card>
      <div className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{props.label}</div>
        <div className="mt-1 text-2xl font-semibold">{props.value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{props.meta}</div>
      </div>
    </Card>
  );
}
