import { Activity, CheckCircle2, Map as MapIcon, Shield, Users } from 'lucide-react';
import type { Lineup, MatchLineups, Player, Team } from '@polyrader/core/browser';
import { Badge } from '@/components/ui';
import { useI18n } from '../hooks/use-i18n';
import { cn } from '../utils/cn';

interface TeamIntelligencePanelProps {
  teamA: Team;
  teamB: Team;
  lineups?: MatchLineups;
  isComplete: boolean;
  updatedAt?: string;
}

export function TeamIntelligencePanel({
  teamA,
  teamB,
  lineups,
  isComplete,
  updatedAt,
}: TeamIntelligencePanelProps) {
  const { t } = useI18n();
  const maps = mergeMaps(teamA, teamB);

  return (
    <section
      className="overflow-hidden rounded-lg border border-border bg-background"
      data-testid="team-intelligence"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">{t('match.teamIntelligence')}</h2>
          <Badge variant={isComplete ? 'green' : 'yellow'} className="rounded text-[10px]">
            {isComplete ? t('match.teamDataReady') : t('match.teamDataPartial')}
          </Badge>
        </div>
        {updatedAt && (
          <span className="text-[11px] text-muted-foreground">
            {t('match.dataUpdated')} {formatDateTime(updatedAt)}
          </span>
        )}
      </header>

      <div className="grid lg:grid-cols-2">
        <TeamColumn team={teamA} lineup={lineups?.teamA} side="a" />
        <TeamColumn team={teamB} lineup={lineups?.teamB} side="b" />
      </div>

      {maps.length > 0 && (
        <div className="border-t border-border px-4 py-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
            <MapIcon className="h-3.5 w-3.5" />
            {t('match.mapPoolComparison')}
          </div>
          <div className="grid gap-x-6 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
            {maps.map(({ name, a, b }) => (
              <MapComparison key={name} name={name} teamA={a} teamB={b} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function TeamColumn({ team, lineup, side }: { team: Team; lineup?: Lineup; side: 'a' | 'b' }) {
  const { t } = useI18n();
  const players = mergePlayers(team.players, lineup);
  const recent = team.recentForm.last10Matches.slice(0, 5);

  return (
    <div
      className={cn(
        'min-w-0 p-4',
        side === 'b' && 'border-t border-border lg:border-l lg:border-t-0',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold">{team.name}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className="font-mono tabular-nums">
                {team.rank > 0 && team.rank < 999 ? `#${team.rank}` : t('match.rankUnavailable')}
              </span>
              {team.region && <span>{team.region}</span>}
              <span>
                {Math.round(team.recentForm.winRate * 100)}% {t('match.formWins')}
              </span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground">
          {lineup?.isConfirmed && <CheckCircle2 className="h-3.5 w-3.5 text-green" />}
          <span>{lineup?.isConfirmed ? t('match.lineupConfirmed') : t('match.lineupPending')}</span>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-muted-foreground">
          <span className="flex items-center gap-1.5 uppercase">
            <Users className="h-3.5 w-3.5" />
            {t('match.activeRoster')}
          </span>
          <span>{players.length}/5</span>
        </div>
        <div className="divide-y divide-border border-y border-border">
          {players.slice(0, 5).map((player) => (
            <PlayerRow key={player.playerId || player.nickname} player={player} />
          ))}
          {players.length === 0 && (
            <div className="py-4 text-center text-xs text-muted-foreground">
              {t('match.rosterPending')}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase text-muted-foreground">
          <Activity className="h-3.5 w-3.5" />
          {t('match.recentMatches')}
        </div>
        <div className="space-y-1.5">
          {recent.map((result, index) => (
            <div
              key={`${result.date}-${result.opponent}-${index}`}
              className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2 text-xs"
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold',
                  result.result === 'win'
                    ? 'bg-green/10 text-green'
                    : result.result === 'loss'
                      ? 'bg-red/10 text-red'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                {result.result === 'win' ? 'W' : result.result === 'loss' ? 'L' : 'D'}
              </span>
              <span className="truncate">{result.opponent}</span>
              <span className="font-mono tabular-nums text-muted-foreground">
                {result.score || '-'}
              </span>
            </div>
          ))}
          {recent.length === 0 && (
            <div className="py-2 text-xs text-muted-foreground">{t('match.formPending')}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function PlayerRow({ player }: { player: Player }) {
  const { t } = useI18n();
  return (
    <div className="grid min-h-9 grid-cols-[minmax(0,1fr)_64px_58px] items-center gap-2 py-1.5 text-xs">
      <div className="min-w-0">
        <div className="truncate font-medium">{player.nickname}</div>
        <div className="truncate text-[10px] text-muted-foreground">
          {player.name || player.role || t('match.playerProfile')}
        </div>
      </div>
      <div className="text-right font-mono tabular-nums">
        <span className="text-muted-foreground">{t('match.ratingShort')} </span>
        {player.rating > 0 ? player.rating.toFixed(2) : '-'}
      </div>
      <div className="truncate text-right text-[10px] text-muted-foreground">
        {player.role || '-'}
      </div>
    </div>
  );
}

function MapComparison({ name, teamA, teamB }: { name: string; teamA?: number; teamB?: number }) {
  const a = toPercent(teamA);
  const b = toPercent(teamB);
  return (
    <div className="grid grid-cols-[38px_minmax(0,1fr)_38px] items-center gap-2 text-[11px]">
      <span className="text-right font-mono tabular-nums">{a === null ? '-' : `${a}%`}</span>
      <div className="min-w-0">
        <div className="mb-1 truncate text-center text-xs font-medium">{name}</div>
        <div className="grid h-1.5 grid-cols-2 overflow-hidden rounded bg-muted">
          <div className="flex justify-end border-r border-background">
            <div className="h-full bg-primary" style={{ width: `${a ?? 0}%` }} />
          </div>
          <div>
            <div className="h-full bg-cyan" style={{ width: `${b ?? 0}%` }} />
          </div>
        </div>
      </div>
      <span className="font-mono tabular-nums">{b === null ? '-' : `${b}%`}</span>
    </div>
  );
}

function mergePlayers(players: Player[], lineup?: Lineup): Player[] {
  if (!lineup?.players.length) return players;
  const byId = new Map(players.map((player) => [player.playerId, player]));
  return lineup.players.map((lineupPlayer) => {
    const profile = byId.get(lineupPlayer.playerId);
    return {
      playerId: lineupPlayer.playerId,
      name: profile?.name ?? '',
      nickname: lineupPlayer.nickname || profile?.nickname || lineupPlayer.playerId,
      rating: lineupPlayer.rating || profile?.rating || 0,
      kdRatio: profile?.kdRatio ?? 0,
      headshotPercent: profile?.headshotPercent ?? 0,
      mapsPlayed: lineupPlayer.mapsOnRecord || profile?.mapsPlayed || 0,
      role: lineupPlayer.role || profile?.role || '',
    };
  });
}

function mergeMaps(teamA: Team, teamB: Team): Array<{ name: string; a?: number; b?: number }> {
  const a = new Map(teamA.mapPool.maps.map((map) => [map.map, map.winRate]));
  const b = new Map(teamB.mapPool.maps.map((map) => [map.map, map.winRate]));
  return Array.from(new Set([...a.keys(), ...b.keys()])).map((name) => ({
    name,
    a: a.get(name),
    b: b.get(name),
  }));
}

function toPercent(value: number | undefined): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.round((value ?? 0) <= 1 ? (value ?? 0) * 100 : (value ?? 0));
}

function formatDateTime(value: string): string {
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}
