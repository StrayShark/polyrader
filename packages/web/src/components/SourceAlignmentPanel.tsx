import { useCallback, useEffect, useState } from 'react';
import { Clock, Database, ExternalLink, Link2, Loader2, RefreshCw, Save, ShieldCheck, Users } from 'lucide-react';
import type { MatchLineups, TeamBrief } from '@polyrader/core';
import { Button, Badge, Card, CardHeader, CardTitle, Input, Skeleton } from '@/components/ui';
import { api } from '../utils/api';
import { cn } from '../utils/cn';
import { useI18n } from '../hooks/use-i18n';
import { useToast } from './ToastProvider';

type SourceName = 'polymarket' | 'hltv' | 'liquipedia' | 'grid' | 'cs_api' | 'manual';

interface SourceLink {
  teamId?: string;
  matchId?: string;
  source: string;
  sourceId: string;
  sourceName?: string;
  sourceSlug?: string;
  sourceUrl?: string;
  confidence?: number;
  isPrimary?: boolean;
  lastSeenAt?: string;
  metadata?: Record<string, unknown>;
}

interface RosterSourceSnapshot {
  id?: number;
  teamId: string;
  source: string;
  sourceId?: string;
  rosterHash: string;
  playerIds: string[];
  players: unknown[];
  isCurrent?: boolean;
  updatedAt?: string;
  createdAt?: string;
}

interface TeamSourceResponse {
  links: SourceLink[];
  rosterSnapshots: RosterSourceSnapshot[];
}

interface TableRowsResponse {
  rows: Record<string, unknown>[];
  total: number;
}

const SOURCE_OPTIONS: SourceName[] = ['liquipedia', 'hltv', 'grid', 'polymarket', 'cs_api', 'manual'];
const SOURCE_TABLES = ['team_source_links', 'match_source_links', 'roster_source_snapshots'] as const;

export function MatchSourcePanel({
  matchId,
  teamA,
  teamB,
  lineups,
  onLineupRefresh,
}: {
  matchId: string;
  teamA: TeamBrief;
  teamB: TeamBrief;
  lineups?: MatchLineups;
  onLineupRefresh?: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const { addToast } = useToast();
  const [links, setLinks] = useState<SourceLink[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshingLineup, setIsRefreshingLineup] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: SourceLink[] }>(`/esports/matches/${encodeURIComponent(matchId)}/sources`);
      setLinks(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError((err as Error).message);
      setLinks([]);
    } finally {
      setIsLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const lineupState = getLineupState(lineups);

  const handleRefreshLineup = async () => {
    setIsRefreshingLineup(true);
    try {
      await api.post(`/esports/matches/${encodeURIComponent(matchId)}/refresh-lineup`);
      await onLineupRefresh?.();
      await load();
      addToast('success', t('sourceAlignment.lineupRefreshDone'));
    } catch (err) {
      addToast('error', (err as Error).message);
    } finally {
      setIsRefreshingLineup(false);
    }
  };

  return (
    <Card className="p-4">
      <CardHeader className="mb-4 flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm">{t('sourceAlignment.title')}</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={lineupState.variant} className="text-[10px]">{lineupState.label}</Badge>
          <Button variant="outline" size="sm" onClick={handleRefreshLineup} disabled={isRefreshingLineup}>
            {isRefreshingLineup ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {t('sourceAlignment.refreshLineup')}
          </Button>
        </div>
      </CardHeader>

      {error && <div className="mb-3 rounded-md border border-red/20 bg-red/5 p-3 text-xs text-red">{error}</div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.2fr)]">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-muted-foreground">{t('sourceAlignment.matchSources')}</div>
            <Button variant="ghost" size="sm" onClick={() => load()} disabled={isLoading} className="h-7 px-2">
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
          </div>
          {isLoading ? <SourceSkeleton /> : <SourceLinkList links={links} />}
          <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
            <div className="mb-1 flex items-center gap-2 text-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              <span className="font-medium">{t('sourceAlignment.lineupSource')}</span>
            </div>
            <div>{lineupState.detail}</div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <TeamSourceCard team={teamA} />
          <TeamSourceCard team={teamB} />
        </div>
      </div>
    </Card>
  );

  function getLineupState(current?: MatchLineups): { label: string; detail: string; variant: 'green' | 'yellow' | 'secondary' } {
    const hasPlayers = Boolean((current?.teamA.players.length ?? 0) + (current?.teamB.players.length ?? 0));
    if (!hasPlayers) {
      return {
        label: t('sourceAlignment.lineupMissing'),
        detail: t('sourceAlignment.lineupMissingDetail'),
        variant: 'secondary',
      };
    }
    const bothConfirmed = Boolean(current?.teamA.isConfirmed && current?.teamB.isConfirmed);
    if (bothConfirmed) {
      return {
        label: t('sourceAlignment.lineupConfirmed'),
        detail: t('sourceAlignment.lineupConfirmedDetail'),
        variant: 'green',
      };
    }
    return {
      label: t('sourceAlignment.lineupFallback'),
      detail: t('sourceAlignment.lineupFallbackDetail'),
      variant: 'yellow',
    };
  }
}

function TeamSourceCard({ team }: { team: TeamBrief }) {
  const { t } = useI18n();
  const { addToast } = useToast();
  const [data, setData] = useState<TeamSourceResponse>({ links: [], rosterSnapshots: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<SourceName>('liquipedia');
  const [sourceId, setSourceId] = useState('');
  const [sourceName, setSourceName] = useState(team.name);
  const [sourceUrl, setSourceUrl] = useState('');
  const [confidencePct, setConfidencePct] = useState('95');

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: TeamSourceResponse }>(`/esports/teams/${encodeURIComponent(team.teamId)}/sources`);
      setData(normalizeTeamSources(res.data));
    } catch (err) {
      setError((err as Error).message);
      setData({ links: [], rosterSnapshots: [] });
    } finally {
      setIsLoading(false);
    }
  }, [team.teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  const currentSnapshot = data.rosterSnapshots.find((snapshot) => snapshot.isCurrent) ?? data.rosterSnapshots[0];
  const snapshotIsStale = isOlderThanDays(currentSnapshot?.updatedAt, 7);

  const saveAlias = async () => {
    if (!sourceId.trim()) return;
    setIsSaving(true);
    try {
      const confidenceValue = Math.min(1, Math.max(0, Number(confidencePct) / 100));
      const res = await api.put<{ data: TeamSourceResponse }>(
        `/esports/teams/${encodeURIComponent(team.teamId)}/sources/${source}`,
        {
          sourceId: sourceId.trim(),
          sourceName: sourceName.trim() || team.name,
          sourceUrl: sourceUrl.trim(),
          confidence: Number.isFinite(confidenceValue) ? confidenceValue : 0.95,
          isPrimary: true,
        },
      );
      setData(normalizeTeamSources(res.data));
      addToast('success', t('sourceAlignment.aliasSaved'));
    } catch (err) {
      addToast('error', (err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const syncLiquipedia = async () => {
    setIsSyncing(true);
    try {
      await api.post(`/esports/teams/${encodeURIComponent(team.teamId)}/sync-liquipedia`, {
        name: sourceName.trim() || team.name,
      });
      await load();
      addToast('success', t('sourceAlignment.syncDone'));
    } catch (err) {
      addToast('error', (err as Error).message);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">{team.name}</div>
          <div className="text-[11px] text-muted-foreground">{team.teamId}</div>
        </div>
        {currentSnapshot && (
          <Badge variant={snapshotIsStale ? 'yellow' : 'green'} className="text-[10px]">
            {snapshotIsStale ? t('sourceAlignment.rosterStale') : t('sourceAlignment.rosterCurrent')}
          </Badge>
        )}
      </div>

      {error && <div className="mb-3 rounded-md border border-red/20 bg-red/5 p-2 text-xs text-red">{error}</div>}
      {isLoading ? <SourceSkeleton /> : <SourceLinkList links={data.links} compact />}

      <div className="mt-3 rounded-md bg-muted/40 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          {t('sourceAlignment.rosterSnapshots')}
        </div>
        {currentSnapshot ? (
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <Badge variant="outline" className="text-[10px]">{currentSnapshot.source}</Badge>
            <span>{t('sourceAlignment.snapshotPlayers', { count: currentSnapshot.playerIds.length || currentSnapshot.players.length })}</span>
            <span>{formatTime(currentSnapshot.updatedAt)}</span>
          </div>
        ) : (
          <div className="text-[11px] text-muted-foreground">{t('sourceAlignment.noSnapshots')}</div>
        )}
      </div>

      <div className="mt-3 space-y-2">
        <div className="text-xs font-medium text-muted-foreground">{t('sourceAlignment.confirmAlias')}</div>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={source}
            onChange={(event) => setSource(event.target.value as SourceName)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
            aria-label={t('sourceAlignment.source')}
          >
            {SOURCE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <Input
            value={confidencePct}
            onChange={(event) => setConfidencePct(event.target.value)}
            className="h-8 text-xs"
            inputMode="numeric"
            aria-label={t('sourceAlignment.confidence')}
            placeholder="95"
          />
        </div>
        <Input
          value={sourceId}
          onChange={(event) => setSourceId(event.target.value)}
          className="h-8 text-xs"
          aria-label={t('sourceAlignment.sourceId')}
          placeholder={t('sourceAlignment.sourceId')}
        />
        <Input
          value={sourceName}
          onChange={(event) => setSourceName(event.target.value)}
          className="h-8 text-xs"
          aria-label={t('sourceAlignment.sourceName')}
          placeholder={team.name}
        />
        <Input
          value={sourceUrl}
          onChange={(event) => setSourceUrl(event.target.value)}
          className="h-8 text-xs"
          aria-label={t('sourceAlignment.sourceUrl')}
          placeholder="https://"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={saveAlias} disabled={isSaving || !sourceId.trim()}>
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {t('sourceAlignment.saveAlias')}
          </Button>
          <Button variant="outline" size="sm" onClick={syncLiquipedia} disabled={isSyncing}>
            {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {t('sourceAlignment.syncLiquipedia')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SourceAlignmentSummary() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Record<string, TableRowsResponse>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const results = await Promise.all(
        SOURCE_TABLES.map(async (table) => {
          const res = await api.get<{ data: TableRowsResponse }>(`/backup/tables/${table}?limit=5&offset=0`);
          return [table, res.data] as const;
        }),
      );
      setRows(Object.fromEntries(results));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card className="p-4">
      <CardHeader className="mb-4 flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm">{t('database.sourceAlignmentTitle')}</CardTitle>
        </div>
        <Button variant="outline" size="sm" onClick={() => load()} disabled={isLoading}>
          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {t('common.refresh')}
        </Button>
      </CardHeader>

      {error && <div className="mb-3 rounded-md border border-red/20 bg-red/5 p-3 text-xs text-red">{error}</div>}

      <div className="grid gap-3 md:grid-cols-3">
        {SOURCE_TABLES.map((table) => {
          const data = rows[table];
          const first = data?.rows[0];
          const latest = String(first?.last_seen_at ?? first?.updated_at ?? first?.created_at ?? '');
          return (
            <div key={table} className="rounded-md border border-border p-3">
              <div className="text-xs font-medium">{table}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{data?.total ?? (isLoading ? '--' : 0)}</div>
              <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span className="truncate">{latest ? formatTime(latest) : t('common.noData')}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function SourceLinkList({ links, compact = false }: { links: SourceLink[]; compact?: boolean }) {
  const { t } = useI18n();
  if (links.length === 0) {
    return <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">{t('sourceAlignment.noLinks')}</div>;
  }

  return (
    <div className="space-y-2">
      {links.map((link) => (
        <div key={`${link.source}-${link.sourceId}`} className={cn('rounded-md border border-border p-3', compact && 'p-2')}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={sourceVariant(link.source)} className="text-[10px]">{link.source}</Badge>
                {link.isPrimary && <Badge variant="green" className="text-[10px]">{t('sourceAlignment.primary')}</Badge>}
                <span className="truncate text-xs font-medium">{link.sourceName || link.sourceId}</span>
              </div>
              <div className="mt-1 truncate text-[11px] text-muted-foreground">{link.sourceId}</div>
            </div>
            {link.sourceUrl && (
              <a
                href={link.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground transition-colors hover:text-foreground"
                title={link.sourceUrl}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span>{t('sourceAlignment.confidence')} {formatConfidence(link.confidence)}</span>
            <span>{t('sourceAlignment.lastSeen')} {formatTime(link.lastSeenAt)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function SourceSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

function sourceVariant(source: string): 'blue' | 'cyan' | 'purple' | 'orange' | 'secondary' {
  if (source === 'polymarket') return 'blue';
  if (source === 'hltv') return 'cyan';
  if (source === 'liquipedia') return 'purple';
  if (source === 'grid') return 'orange';
  return 'secondary';
}

function formatConfidence(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return `${Math.round(value * 100)}%`;
}

function formatTime(value?: string): string {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function normalizeTeamSources(value: TeamSourceResponse): TeamSourceResponse {
  return {
    links: Array.isArray(value?.links) ? value.links : [],
    rosterSnapshots: Array.isArray(value?.rosterSnapshots) ? value.rosterSnapshots : [],
  };
}

function isOlderThanDays(value: string | undefined, days: number): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() > days * 24 * 60 * 60 * 1000;
}
