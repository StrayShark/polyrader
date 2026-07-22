import { useEffect, useState } from 'react';
import { ExternalLink, Gamepad2, Loader2, RefreshCw } from 'lucide-react';
import type {
  EsportsGame,
  EsportsSourceDescriptor,
  EsportsSourceSyncResult,
} from '@polyrader/core/browser';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@/components/ui';
import { api } from '../utils/api';
import { useI18n } from '../hooks/use-i18n';
import { useToast } from './ToastProvider';

interface SourceCatalogEntry {
  game: EsportsGame;
  sources: EsportsSourceDescriptor[];
  latestSync: EsportsSourceSyncResult | null;
}

export function EsportsDataSourcesPanel() {
  const { t } = useI18n();
  const { addToast } = useToast();
  const [catalog, setCatalog] = useState<SourceCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<EsportsGame | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCatalog = async () => {
    setError(null);
    try {
      const response = await api.get<{ data: SourceCatalogEntry[] }>('/esports/sources');
      setCatalog(response.data ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCatalog();
  }, []);

  const syncGame = async (game: EsportsGame) => {
    setSyncing(game);
    setError(null);
    try {
      const response = await api.post<{ data: EsportsSourceSyncResult }>(`/esports/sources/${game}/sync`);
      const result = response.data;
      addToast(
        result.status === 'failed' ? 'error' : result.status === 'partial' ? 'warning' : 'success',
        t(result.status === 'success' ? 'settings.sourceSyncSuccess' : 'settings.sourceSyncPartial', {
          game: t(`settings.game.${game}`),
          count: result.records,
        }),
      );
      await loadCatalog();
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      addToast('error', message);
    } finally {
      setSyncing(null);
    }
  };

  return (
    <Card data-testid="esports-data-sources">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Gamepad2 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">{t('settings.esportsSources')}</CardTitle>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{t('settings.esportsSourcesHint')}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => void loadCatalog()} title={t('common.refresh')}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      <CardContent>
        {error && <div className="mb-3 rounded border border-red/20 bg-red/5 p-2 text-xs text-red">{error}</div>}
        {loading ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {Array.from({ length: 4 }, (_value, index) => <Skeleton key={index} className="h-36 w-full" />)}
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {catalog.map((entry) => (
              <section key={entry.game} className="rounded-md border border-border" data-testid={`source-game-${entry.game}`}>
                <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/15 px-3 py-2.5">
                  <div>
                    <div className="text-sm font-medium">{t(`settings.game.${entry.game}`)}</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {entry.latestSync
                        ? t('settings.sourceLatestSync', {
                          count: entry.latestSync.records,
                          time: new Date(entry.latestSync.finishedAt).toLocaleString(),
                        })
                        : t('settings.sourceNeverSynced')}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void syncGame(entry.game)}
                    disabled={syncing !== null}
                  >
                    {syncing === entry.game ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    {t(syncing === entry.game ? 'settings.sourceSyncing' : 'settings.sourceSync')}
                  </Button>
                </div>
                <div className="divide-y divide-border/70 px-3">
                  {entry.sources.map((source) => (
                    <div key={source.source} className="flex items-center gap-2 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-medium">{source.label}</span>
                          <a
                            href={source.docsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                            title={t('settings.sourceDocs')}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                        <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                          {t(`settings.sourceAccess.${source.access}`)}
                        </div>
                      </div>
                      <Badge variant={sourceVariant(source.state)} className="shrink-0 text-[10px]">
                        {t(`settings.sourceState.${source.state}`)}
                      </Badge>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function sourceVariant(state: EsportsSourceDescriptor['state']): 'green' | 'yellow' | 'red' | 'secondary' {
  if (state === 'ready') return 'green';
  if (state === 'error') return 'red';
  if (state === 'degraded' || state === 'unconfigured') return 'yellow';
  return 'secondary';
}
