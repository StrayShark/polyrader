import { useEffect, useState } from 'react';
import { BrainCircuit, ClipboardCheck, DatabaseZap, ExternalLink, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';
import { useI18n } from '../hooks/use-i18n';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { Badge, Button, Card, CardHeader, CardTitle } from '@/components/ui';
import { cn } from '../utils/cn';
import type { BoardValidationSummary, EsportsGame, EsportsSourceSyncResult } from '@polyrader/core/browser';

const GAMES: EsportsGame[] = ['cs2', 'lol', 'dota2', 'valorant'];

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
  const [active, setActive] = useState<BoardValidationSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<EsportsSourceSyncResult | null>(null);
  const [latestRunId, setLatestRunId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const load = async (selected = game) => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await api.get<{ data: BoardValidationSummary[] }>('/validation-lab/boards');
      setBoards(list.data);
      const detail = await api.post<{ data: { summary: BoardValidationSummary } }>(
        `/validation-lab/boards/${selected}/normalize`,
        {},
      );
      setActive(detail.data.summary);
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
      const synced = await api.post<{ data: EsportsSourceSyncResult }>(`/esports/sources/${game}/sync`);
      setSyncResult(synced.data);
      const detail = await api.post<{ data: { summary: BoardValidationSummary } }>(
        `/validation-lab/boards/${game}/normalize`,
        {},
      );
      setActive(detail.data.summary);
      const list = await api.get<{ data: BoardValidationSummary[] }>('/validation-lab/boards');
      setBoards(list.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const runAnalysis = async () => {
    if (!board?.sampleMatch) return;
    setIsAnalyzing(true);
    setError(null);
    try {
      const response = await api.post<{ data: { run: { runId: string } } }>('/analysis/execute', {
        game,
        matchId: board.sampleMatch.externalMatchId,
      }, { timeoutMs: 120000 });
      setLatestRunId(response.data.run.runId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    void load(game);
  }, [game]);

  const board = active ?? boards.find((item) => item.game === game) ?? null;

  return (
    <div className="space-y-6" data-testid="validation-lab-page">
      <Breadcrumbs items={[{ label: t('nav.validationLab') }]} />

      <div className="flex flex-wrap items-start justify-between gap-3">
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
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {syncResult && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm" data-testid="validation-sync-result">
          <Badge variant={syncResult.status === 'success' ? 'green' : syncResult.status === 'partial' ? 'yellow' : 'destructive'}>{syncResult.status}</Badge>
          <span>{syncResult.records} {t('validationLab.records')}</span>
          {syncResult.sources.map((source) => (
            <span key={source.source} className="text-xs text-muted-foreground">
              {source.source}: {source.status} ({source.records}){source.message ? ` · ${source.message}` : ''}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2" role="tablist">
        {GAMES.map((item) => (
          <button
            key={item}
            type="button"
            data-testid={`validation-game-${item}`}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm',
              game === item ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
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
        <Metric label={t('validationLab.completeness')} value={`${Math.round((board?.completeness ?? 0) * 100)}%`} meta={t('validationLab.minCompleteness')} />
        <Metric label={t('validationLab.freshness')} value={freshnessLabel(board?.freshnessSeconds ?? Number.POSITIVE_INFINITY)} meta={t('validationLab.maxAge')} />
        <Metric label={t('validationLab.sources')} value={String(board?.sourceCount ?? 0)} meta={`${board?.matchCount ?? 0} matches`} />
        <Metric label={t('validationLab.missing')} value={String(board?.missing.length ?? 0)} meta={(board?.missing ?? []).slice(0, 2).join(', ') || '—'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('validationLab.stages')}</CardTitle>
          </CardHeader>
          <div className="space-y-2 px-4 pb-4">
            {(board?.stages ?? []).map((stage) => (
              <div key={stage.stage} className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
                <Badge variant={stage.status === 'passed' ? 'green' : stage.status === 'warning' ? 'yellow' : stage.status === 'failed' ? 'destructive' : 'secondary'}>
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('validationLab.sampleMatch')}</CardTitle>
          </CardHeader>
          <div className="space-y-3 px-4 pb-4 text-sm">
            {board?.sampleMatch ? (
              <>
                <div className="font-medium">
                  {board.sampleMatch.participants.map((p) => p.name).join(' vs ')}
                </div>
                <div className="text-muted-foreground">
                  {board.sampleMatch.eventName} · {board.sampleMatch.format} · {board.sampleMatch.startsAt}
                </div>
                <div className="font-mono text-xs text-muted-foreground break-all">
                  {board.sampleMatch.dataSnapshotHash}
                </div>
                <div className="flex flex-wrap gap-1">
                  {board.sampleMatch.missing.map((item) => (
                    <Badge key={item} variant="yellow">{item}</Badge>
                  ))}
                  {board.conflictFlags.map((item) => (
                    <Badge key={item} variant="destructive">{item}</Badge>
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
                  <Button size="sm" onClick={() => void runAnalysis()} disabled={isAnalyzing}>
                    <BrainCircuit className={cn('h-3.5 w-3.5', isAnalyzing && 'animate-pulse')} />
                    {t('validationLab.runAnalysis')}
                  </Button>
                  {latestRunId && (
                    <Link
                      to={`/analysis/report/${encodeURIComponent(latestRunId)}`}
                      className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 text-xs hover:bg-accent"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {t('validationLab.openReport')}
                    </Link>
                  )}
                </div>
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
