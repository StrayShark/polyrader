import { AlertTriangle, CheckCircle2, Database, Users } from 'lucide-react';
import type { AnalysisDataMissingField, AnalysisDataSnapshot, Lineup, Player, Team } from '@polyrader/core/browser';
import { Badge } from '@/components/ui';
import { useI18n } from '../hooks/use-i18n';
import { cn } from '../utils/cn';

interface AnalysisDataSnapshotPanelProps {
  snapshot: AnalysisDataSnapshot;
}

export function AnalysisDataSnapshotPanel({ snapshot }: AnalysisDataSnapshotPanelProps) {
  const { t } = useI18n();
  const quality = Math.round(snapshot.completeness * 100);

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-background" data-testid="analysis-data-snapshot">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">{t('match.analysisDataSnapshot')}</h2>
          <Badge variant={snapshot.isComplete ? 'green' : 'yellow'} className="rounded text-[10px]">
            {t('match.analysisDataCoverage', { quality })}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{sourceLabel(snapshot.source, t)}</span>
          <span>·</span>
          <span>{formatDateTime(snapshot.sourceUpdatedAt ?? snapshot.capturedAt)}</span>
        </div>
      </header>

      {!snapshot.isComplete && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-yellow/20 bg-yellow/5 px-4 py-2.5">
          <AlertTriangle className="mr-1 h-3.5 w-3.5 text-yellow" />
          <span className="mr-1 text-[11px] text-yellow">{t('match.analysisDataMissing')}</span>
          {snapshot.missingFields.map((field) => (
            <Badge key={field} variant="outline" className="rounded text-[9px]">
              {missingFieldLabel(field, t)}
            </Badge>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-2">
        <SnapshotTeamColumn team={snapshot.teamA} lineup={snapshot.lineups?.teamA} side="a" />
        <SnapshotTeamColumn team={snapshot.teamB} lineup={snapshot.lineups?.teamB} side="b" />
      </div>
    </section>
  );
}

function SnapshotTeamColumn({ team, lineup, side }: { team: Team; lineup?: Lineup; side: 'a' | 'b' }) {
  const { t } = useI18n();
  const players = mergePlayers(team.players, lineup).slice(0, 5);
  const recent = team.recentForm.last10Matches.slice(0, 5);

  return (
    <div className={cn('min-w-0 p-4', side === 'b' && 'border-t border-border lg:border-l lg:border-t-0')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{team.name}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="font-mono tabular-nums">
              {team.rank > 0 && team.rank < 999 ? `#${team.rank}` : t('match.rankUnavailable')}
            </span>
            <span>{t('match.analysisRecentCount', { count: team.recentForm.last10Matches.length })}</span>
            <span>{Math.round(team.recentForm.winRate * 100)}% {t('match.formWins')}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
          {lineup?.isConfirmed ? <CheckCircle2 className="h-3.5 w-3.5 text-green" /> : <Users className="h-3.5 w-3.5" />}
          <span>{lineup?.isConfirmed ? t('match.lineupConfirmed') : t('match.lineupPending')}</span>
        </div>
      </div>

      <div className="mt-4 overflow-hidden border-y border-border">
        <div className="grid grid-cols-[minmax(88px,1fr)_42px_42px_42px_42px] gap-1 bg-muted/30 px-2 py-1.5 text-right text-[9px] uppercase text-muted-foreground">
          <span className="text-left">{t('match.analysisPlayer')}</span>
          <span>RTG</span>
          <span>K/D</span>
          <span>HS%</span>
          <span>MAP</span>
        </div>
        {players.map((player) => (
          <div key={player.playerId || player.nickname} className="grid min-h-10 grid-cols-[minmax(88px,1fr)_42px_42px_42px_42px] items-center gap-1 border-t border-border px-2 py-1.5 text-right text-[10px] tabular-nums">
            <div className="min-w-0 text-left">
              <div className="truncate text-xs font-medium">{player.nickname}</div>
              <div className="truncate text-[9px] text-muted-foreground">{player.role || '-'}</div>
            </div>
            <span>{metric(player.rating, 2)}</span>
            <span>{metric(player.kdRatio, 2)}</span>
            <span>{player.headshotPercent > 0 ? Math.round(player.headshotPercent) : '-'}</span>
            <span>{player.mapsPlayed > 0 ? player.mapsPlayed : '-'}</span>
          </div>
        ))}
        {players.length === 0 && (
          <div className="py-4 text-center text-xs text-muted-foreground">{t('match.rosterPending')}</div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5" aria-label={t('match.recentMatches')}>
        {recent.map((result, index) => (
          <span
            key={`${result.date}-${result.opponent}-${index}`}
            className={cn(
              'inline-flex min-w-0 items-center gap-1 rounded border px-1.5 py-1 text-[10px]',
              result.result === 'win' ? 'border-green/20 bg-green/5 text-green' : result.result === 'loss' ? 'border-red/20 bg-red/5 text-red' : 'border-border text-muted-foreground',
            )}
            title={`${result.opponent} ${result.score}`}
          >
            <strong>{result.result === 'win' ? 'W' : result.result === 'loss' ? 'L' : 'D'}</strong>
            <span className="max-w-24 truncate">{result.opponent}</span>
            <span className="font-mono">{result.score || '-'}</span>
          </span>
        ))}
        {recent.length === 0 && <span className="text-[11px] text-muted-foreground">{t('match.formPending')}</span>}
      </div>
    </div>
  );
}

function mergePlayers(players: Player[], lineup?: Lineup): Player[] {
  if (!lineup?.players.length) return players;
  const profiles = new Map(players.map((player) => [player.playerId, player]));
  return lineup.players.map((starter) => {
    const profile = profiles.get(starter.playerId);
    return {
      playerId: starter.playerId,
      name: profile?.name ?? '',
      nickname: starter.nickname || profile?.nickname || starter.playerId,
      rating: starter.rating || profile?.rating || 0,
      kdRatio: profile?.kdRatio ?? 0,
      headshotPercent: profile?.headshotPercent ?? 0,
      mapsPlayed: starter.mapsOnRecord || profile?.mapsPlayed || 0,
      role: starter.role || profile?.role || '',
    };
  });
}

function metric(value: number, digits: number): string {
  return Number.isFinite(value) && value > 0 ? value.toFixed(digits) : '-';
}

function sourceLabel(source: AnalysisDataSnapshot['source'], t: (key: string, params?: Record<string, string | number>) => string): string {
  if (source === 'hltv') return t('match.analysisDataSourceHltv');
  if (source === 'fallback') return t('match.analysisDataSourceFallback');
  return t('match.analysisDataSourceDatabase');
}

function missingFieldLabel(field: AnalysisDataMissingField, t: (key: string, params?: Record<string, string | number>) => string): string {
  const side = field.startsWith('team_a_') ? 'A' : 'B';
  const name = field.replace(/^team_[ab]_/, '');
  return t(`match.analysisMissing.${name}`, { side });
}

function formatDateTime(value: string): string {
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
