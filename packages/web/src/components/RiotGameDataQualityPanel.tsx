import { Clock3, Database, ShieldCheck } from 'lucide-react';
import type {
  AnalysisFact,
  NormalizedMatchFacts,
  RiotGameDataQuality,
  RiotGameFieldQuality,
} from '@polyrader/core/browser';
import { Badge, Card, CardHeader, CardTitle } from '@/components/ui';
import { useI18n } from '../hooks/use-i18n';

export function RiotGameDataQualityPanel({ match }: { match: NormalizedMatchFacts }) {
  const { t } = useI18n();
  if (match.game !== 'lol' && match.game !== 'valorant') return null;
  const quality = qualityFromFacts(match.facts, match.game);
  if (!quality) return null;
  const matchField = quality.match.patch ?? quality.match.mapPool;
  const hasStaleEvidence =
    matchField?.status === 'stale' ||
    quality.sides.some((side) => side.fields.some((field) => field.status === 'stale'));

  return (
    <Card className="overflow-hidden p-0" data-testid={`${match.game}-data-quality-panel`}>
      <CardHeader className="flex-row items-center justify-between border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="truncate text-sm">
            {match.game === 'lol' ? t('riotQuality.lolTitle') : t('riotQuality.valorantTitle')}
          </CardTitle>
        </div>
        <div className="flex items-center gap-1.5">
          {matchField && (
            <Badge variant="outline" title={matchField.reason}>
              {matchField.field === 'patch' ? t('riotQuality.field.patch') : t('riotQuality.field.map_pool')}{' '}
              {match.patchVersion ?? (match.mapPool[0] ? `${match.mapPool.length} maps` : '—')} ·{' '}
              {matchField.source ?? matchField.status}
              {matchField.ageSeconds != null ? ` · ${ageLabel(matchField.ageSeconds)}` : ''}
            </Badge>
          )}
          <Badge variant={quality.bothTeamsComplete ? 'green' : 'yellow'}>
            {quality.bothTeamsComplete ? t('riotQuality.complete') : t('riotQuality.incomplete')}
          </Badge>
          {(quality.bothTeamsFresh || hasStaleEvidence) && (
            <Badge variant={quality.bothTeamsFresh ? 'secondary' : 'yellow'}>
              {quality.bothTeamsFresh ? t('riotQuality.fresh') : t('riotQuality.stale')}
            </Badge>
          )}
        </div>
      </CardHeader>

      <div className="grid divide-y divide-border lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        {quality.sides.map((side) => {
          const roster = match.players.filter(
            (player) => player.participantId === side.participantId,
          );
          return (
            <section
              key={side.side}
              className="min-w-0 px-4 py-4"
              data-testid={`${match.game}-quality-side-${side.side}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold">{side.name}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      {t('riotQuality.roster')}{' '}
                      <b className="font-mono text-foreground">{roster.length}/5</b>
                    </span>
                  </div>
                </div>
                <Badge variant={side.complete ? 'green' : 'yellow'}>
                  {side.complete ? t('riotQuality.complete') : t('riotQuality.incomplete')}
                </Badge>
              </div>
              <div className="mt-3 space-y-2">
                {side.fields.map((field) => (
                  <FieldRow key={field.field} field={field} />
                ))}
              </div>
              {roster.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {roster.map((player) => (
                    <Badge key={player.playerId} variant="secondary">
                      {player.displayName}
                      {player.position ? ` · ${player.position}` : ''}
                    </Badge>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </Card>
  );
}

function FieldRow({ field }: { field: RiotGameFieldQuality }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {field.status === 'available' ? (
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <Clock3 className="h-3.5 w-3.5" />
        )}
        {t(`riotQuality.field.${field.field}`)}
      </span>
      <span className="font-mono text-foreground">
        {field.source ?? field.status}
        {field.reason ? ` · ${field.reason}` : ''}
      </span>
    </div>
  );
}

function qualityFromFacts(
  facts: AnalysisFact[],
  game: 'lol' | 'valorant',
): RiotGameDataQuality | null {
  const factId = game === 'lol' ? 'lol-data-quality' : 'valorant-data-quality';
  const value = facts.find((fact) => fact.factId === factId)?.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const quality = value as RiotGameDataQuality;
  const expected = game === 'lol' ? 'lol-quality.v1' : 'valorant-quality.v1';
  return quality.contractVersion === expected ? quality : null;
}

function ageLabel(ageSeconds: number): string {
  if (ageSeconds < 60) return `${ageSeconds}s`;
  if (ageSeconds < 3600) return `${Math.floor(ageSeconds / 60)}m`;
  return `${(ageSeconds / 3600).toFixed(1)}h`;
}
