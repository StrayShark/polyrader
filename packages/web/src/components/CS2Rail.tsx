import { Radio, Clock, Calendar, Trophy, Layers, Shield, MapPin } from 'lucide-react';
import type { EsportsGame } from '@polyrader/core/browser';
import { useI18n } from '../hooks/use-i18n';
import { cn } from '../utils/cn';

export type GameFilter = 'all' | EsportsGame;
export type TimeFilter = 'all' | 'live' | 'starting_soon' | 'today' | 'tomorrow' | 'upcoming';
export type FormatFilter = 'all' | 'BO1' | 'BO3' | 'BO5';
export type TierFilter = 'all' | 'S' | 'A' | 'B';

export interface CS2RailFilters {
  game: GameFilter;
  time: TimeFilter;
  format: FormatFilter;
  tier: TierFilter;
  tournament?: string;
  mapComplete?: boolean;
}

export interface CS2RailProps {
  filters: CS2RailFilters;
  onChange: (filters: CS2RailFilters) => void;
  tournaments?: string[];
  className?: string;
  onClear?: () => void;
}

const DEFAULT_FILTERS: CS2RailFilters = {
  game: 'all',
  time: 'all',
  format: 'all',
  tier: 'all',
};

function hasActiveFilters(filters: CS2RailFilters): boolean {
  return (
    filters.game !== 'all' ||
    filters.time !== 'all' ||
    filters.format !== 'all' ||
    filters.tier !== 'all' ||
    Boolean(filters.tournament) ||
    Boolean(filters.mapComplete)
  );
}

export function CS2Rail({ filters, onChange, tournaments = [], className, onClear }: CS2RailProps) {
  const { t } = useI18n();
  const active = hasActiveFilters(filters);

  const timeItems: { key: TimeFilter; label: string; icon: React.ReactNode }[] = [
    { key: 'all', label: t('rail.time_all'), icon: <Layers className="h-3.5 w-3.5" /> },
    { key: 'live', label: t('rail.time_live'), icon: <Radio className="h-3.5 w-3.5" /> },
    {
      key: 'starting_soon',
      label: t('rail.time_starting_soon'),
      icon: <Clock className="h-3.5 w-3.5" />,
    },
    { key: 'today', label: t('rail.time_today'), icon: <Calendar className="h-3.5 w-3.5" /> },
    { key: 'tomorrow', label: t('rail.time_tomorrow'), icon: <Calendar className="h-3.5 w-3.5" /> },
    { key: 'upcoming', label: t('rail.time_upcoming'), icon: <Calendar className="h-3.5 w-3.5" /> },
  ];

  const formatItems: FormatFilter[] = ['all', 'BO1', 'BO3', 'BO5'];
  const tierItems: TierFilter[] = ['all', 'S', 'A', 'B'];
  const gameItems: GameFilter[] = ['all', 'cs2', 'lol', 'dota2', 'valorant'];

  return (
    <div
      className={cn(
        'flex flex-wrap items-end gap-3 rounded-lg border border-border bg-background p-3',
        className,
      )}
    >
      <div className="space-y-1.5">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {t('rail.section_game')}
        </div>
        <div className="flex flex-wrap gap-1">
          {gameItems.map((game) => (
            <button
              key={game}
              onClick={() => onChange({ ...filters, game })}
              className={cn(
                'rounded px-2 py-1 text-xs transition-colors',
                filters.game === game
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-background text-muted-foreground hover:bg-accent/50',
              )}
            >
              {game === 'all' ? t('rail.game_all') : t(`settings.game.${game}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Time filters */}
      <div className="min-w-[280px] flex-1 space-y-1.5">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {t('rail.section_time')}
        </div>
        <div className="flex flex-wrap gap-1">
          {timeItems.map((item) => (
            <button
              key={item.key}
              onClick={() => onChange({ ...filters, time: item.key })}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] transition-colors',
                filters.time === item.key
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent/50',
              )}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Format filters */}
      <div className="space-y-1.5">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {t('rail.section_format')}
        </div>
        <div className="flex flex-wrap gap-1">
          {formatItems.map((fmt) => (
            <button
              key={fmt}
              onClick={() => onChange({ ...filters, format: fmt })}
              className={cn(
                'rounded px-2 py-1 text-xs transition-colors',
                filters.format === fmt
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-background text-muted-foreground hover:bg-accent/50',
              )}
            >
              {fmt === 'all' ? t('rail.format_all') : fmt}
            </button>
          ))}
        </div>
      </div>

      {/* Tier filters */}
      <div className="space-y-1.5">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {t('rail.section_tier')}
        </div>
        <div className="flex flex-wrap gap-1">
          {tierItems.map((tier) => (
            <button
              key={tier}
              onClick={() => onChange({ ...filters, tier })}
              className={cn(
                'flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors',
                filters.tier === tier
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-background text-muted-foreground hover:bg-accent/50',
              )}
            >
              {tier !== 'all' && <Shield className="h-3 w-3" />}
              {tier === 'all' ? t('rail.tier_all') : `Tier ${tier}`}
            </button>
          ))}
        </div>
      </div>

      {/* Tournament filters */}
      {tournaments.length > 0 && (
        <div className="min-w-[180px] max-w-[260px] flex-1 space-y-1.5">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {t('rail.section_tournament')}
          </div>
          <div className="relative">
            <Trophy className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <select
              value={filters.tournament ?? ''}
              onChange={(event) =>
                onChange({ ...filters, tournament: event.target.value || undefined })
              }
              className="h-8 w-full rounded-md border border-border bg-background pl-7 pr-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="">{t('rail.tournament_all')}</option>
              {tournaments.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Map completeness toggle */}
      <div className="space-y-1.5">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {t('rail.section_data')}
        </div>
        <button
          onClick={() => onChange({ ...filters, mapComplete: !filters.mapComplete })}
          className={cn(
            'flex h-8 items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
            filters.mapComplete
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-accent/50',
          )}
        >
          <MapPin className="h-3.5 w-3.5" />
          {t('rail.map_complete')}
        </button>
      </div>

      {active && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-medium uppercase tracking-wider text-transparent">-</div>
          <button
            type="button"
            onClick={() => {
              onChange({ ...DEFAULT_FILTERS });
              onClear?.();
            }}
            className="h-8 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          >
            {t('rail.clearFilters')}
          </button>
        </div>
      )}
    </div>
  );
}
