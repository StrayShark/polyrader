import { Clock3, Database, ShieldCheck } from 'lucide-react';
import type {
  AnalysisFact,
  DotaDataQuality,
  DotaFieldQuality,
  NormalizedMatchFacts,
} from '@polyrader/core/browser';
import { Badge, Card, CardHeader, CardTitle } from '@/components/ui';
import { useI18n } from '../hooks/use-i18n';

export function DotaDataQualityPanel({ match }: { match: NormalizedMatchFacts }) {
  const { t } = useI18n();
  if (match.game !== 'dota2') return null;
  const quality = qualityFromFacts(match.facts);
  if (!quality) return null;
  const hasStaleEvidence =
    quality.match.patch.status === 'stale' ||
    quality.sides.some((side) => side.fields.some((field) => field.status === 'stale'));

  return (
    <Card className="overflow-hidden p-0" data-testid="dota-data-quality-panel">
      <CardHeader className="flex-row items-center justify-between border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="truncate text-sm">{t('dotaQuality.title')}</CardTitle>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" title={quality.match.patch.reason}>
            {t('dotaQuality.field.patch')} {match.patchVersion ?? '—'} ·{' '}
            {quality.match.patch.source ?? quality.match.patch.status}
            {quality.match.patch.ageSeconds != null
              ? ` · ${ageLabel(quality.match.patch.ageSeconds)}`
              : ''}
          </Badge>
          <Badge variant={quality.bothTeamsComplete ? 'green' : 'yellow'}>
            {quality.bothTeamsComplete ? t('dotaQuality.complete') : t('dotaQuality.incomplete')}
          </Badge>
          {(quality.bothTeamsFresh || hasStaleEvidence) && (
            <Badge variant={quality.bothTeamsFresh ? 'secondary' : 'yellow'}>
              {quality.bothTeamsFresh ? t('dotaQuality.fresh') : t('dotaQuality.stale')}
            </Badge>
          )}
        </div>
      </CardHeader>

      <div className="grid divide-y divide-border lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        {quality.sides.map((side) => {
          const participant = match.participants.find((item) => item.side === side.side);
          const roster = match.players.filter(
            (player) => player.participantId === side.participantId,
          );
          const form = factValue(match.facts, `team-${side.side}-recent-form`);
          const metrics = factArray(match.facts, `team-${side.side}-player-stats`);
          const heroes = factArray(match.facts, `team-${side.side}-hero-pool`);
          const recentMatches = recordArray(form?.recentMatches).slice(0, 5);
          return (
            <section
              key={side.side}
              className="min-w-0 px-4 py-4"
              data-testid={`dota-quality-side-${side.side}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold">{side.name}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      {t('dotaQuality.rating')}{' '}
                      <b className="font-mono text-foreground">
                        {participant?.rating?.toFixed(0) ?? '—'}
                      </b>
                    </span>
                    <span>
                      {t('dotaQuality.form')}{' '}
                      <b className="font-mono text-foreground">{percent(form?.winRate)}</b>
                    </span>
                    <span>
                      {t('dotaQuality.roster')}{' '}
                      <b className="font-mono text-foreground">{roster.length}/5</b>
                    </span>
                  </div>
                </div>
                <Badge
                  variant={
                    side.complete && side.fresh ? 'green' : side.complete ? 'secondary' : 'yellow'
                  }
                >
                  {side.complete ? t('dotaQuality.ready') : t('dotaQuality.needsData')}
                </Badge>
              </div>

              <div className="mt-4 divide-y divide-border border-y border-border">
                {side.fields.map((field) => (
                  <QualityRow key={field.field} field={field} />
                ))}
              </div>

              {side.targetEnrichment && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">OpenDota target</Badge>
                  <span>roster {side.targetEnrichment.rosterFetched}</span>
                  <span>matches {side.targetEnrichment.matchesFetched}</span>
                  <span>details {side.targetEnrichment.detailSampleSize}</span>
                  {side.targetEnrichment.errors.map((error) => (
                    <Badge key={error} variant="yellow" title={error}>
                      {error.split(':')[0]}
                    </Badge>
                  ))}
                </div>
              )}

              <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="min-w-0">
                  <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                    {t('dotaQuality.recentMatches')}
                  </div>
                  {recentMatches.length > 0 ? (
                    <div className="divide-y divide-border border-y border-border text-xs">
                      {recentMatches.map((row, index) => (
                        <div
                          key={String(row.matchId ?? index)}
                          className="flex items-center gap-2 py-1.5"
                        >
                          <span
                            className={
                              row.result === 'win'
                                ? 'font-medium text-foreground'
                                : 'text-muted-foreground'
                            }
                          >
                            {String(row.result ?? '—').toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {String(row.opponentName ?? row.opponent ?? '—')}
                          </span>
                          <span className="font-mono text-muted-foreground">
                            {shortDate(row.startTime)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyValue />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                    {t('dotaQuality.rosterMetrics')}
                  </div>
                  {roster.length > 0 ? (
                    <div className="divide-y divide-border border-y border-border text-xs">
                      {roster.map((player) => {
                        const metric = findPlayerMetric(
                          metrics,
                          player.playerId,
                          player.displayName,
                        );
                        return (
                          <div
                            key={player.playerId}
                            className="grid grid-cols-[minmax(0,1fr)_32px_48px_48px] items-center gap-2 py-1.5"
                          >
                            <span className="truncate font-medium">{player.displayName}</span>
                            <span className="text-center text-muted-foreground">
                              {player.position ?? '—'}
                            </span>
                            <span className="text-right font-mono" title="K/D/A">
                              {kda(metric)}
                            </span>
                            <span
                              className="text-right font-mono text-muted-foreground"
                              title="GPM"
                            >
                              {integer(metric?.goldPerMinute)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyValue />
                  )}
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                  {t('dotaQuality.heroPool')}
                </div>
                {heroes.length > 0 ? (
                  <div className="grid grid-cols-2 gap-x-4 border-y border-border sm:grid-cols-3">
                    {heroes.slice(0, 6).map((hero, index) => (
                      <div
                        key={String(hero.heroId ?? index)}
                        className="flex items-center justify-between border-b border-border py-1.5 text-xs last:border-b-0"
                      >
                        <span>Hero #{String(hero.heroId ?? '—')}</span>
                        <span className="font-mono text-muted-foreground">
                          {String(hero.matches ?? 0)} · {percent(hero.winRate)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyValue />
                )}
              </div>
            </section>
          );
        })}
      </div>
    </Card>
  );
}

function QualityRow({ field }: { field: DotaFieldQuality }) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-[104px_minmax(0,1fr)_auto] items-center gap-2 py-1.5 text-xs">
      <span className="font-medium">{t(`dotaQuality.field.${field.field}`)}</span>
      <span className="min-w-0 truncate text-muted-foreground" title={field.reason}>
        {field.source ?? field.reason ?? '—'}
        {field.reason ? ` · ${field.reason}` : ''}
      </span>
      <span className="flex items-center gap-1 font-mono text-muted-foreground">
        {field.status === 'available' ? (
          <ShieldCheck className="h-3 w-3" />
        ) : (
          <Clock3 className="h-3 w-3" />
        )}
        {field.ageSeconds == null ? field.status : ageLabel(field.ageSeconds)}
      </span>
    </div>
  );
}

function qualityFromFacts(facts: AnalysisFact[]): DotaDataQuality | null {
  const value = facts.find((fact) => fact.factId === 'dota-data-quality')?.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const quality = value as DotaDataQuality;
  return quality.contractVersion === 'dota-quality.v1' ? quality : null;
}

function factValue(facts: AnalysisFact[], factId: string): Record<string, unknown> | undefined {
  const value = facts.find((fact) => fact.factId === factId)?.value;
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function factArray(facts: AnalysisFact[], factId: string): Array<Record<string, unknown>> {
  return recordArray(facts.find((fact) => fact.factId === factId)?.value);
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      )
    : [];
}

function findPlayerMetric(metrics: Array<Record<string, unknown>>, id: string, name: string) {
  const normalizedName = name.toLowerCase();
  return metrics.find(
    (metric) =>
      String(metric.accountId ?? metric.playerId ?? '') === id ||
      String(metric.nickname ?? metric.name ?? '').toLowerCase() === normalizedName,
  );
}

function kda(metric: Record<string, unknown> | undefined): string {
  if (!metric) return '—';
  const kills = Number(metric.kills);
  const deaths = Number(metric.deaths);
  if (!Number.isFinite(kills) || !Number.isFinite(deaths)) return '—';
  return `${kills.toFixed(1)}/${deaths.toFixed(1)}`;
}

function integer(value: unknown): string {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.round(number)) : '—';
}

function percent(value: unknown): string {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number * 100)}%` : '—';
}

function shortDate(value: unknown): string {
  const timestamp = Date.parse(String(value ?? ''));
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' })
    : '—';
}

function ageLabel(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

function EmptyValue() {
  const { t } = useI18n();
  return (
    <div className="border-y border-border py-3 text-xs text-muted-foreground">
      {t('dotaQuality.noData')}
    </div>
  );
}
