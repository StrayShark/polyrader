import type { SimBetRecord } from '@polyrader/core/browser';
import { useI18n } from '../hooks/use-i18n';

function readableMarketKind(kind: string | undefined, t: (key: string) => string): string {
  switch (kind) {
    case 'match_winner':
      return t('match.marketKind.match_winner');
    case 'map_winner':
      return t('match.marketKind.map_winner');
    case 'handicap':
      return t('match.marketKind.handicap');
    case 'total_maps':
      return t('match.marketKind.total_maps');
    case 'correct_score':
      return t('match.marketKind.correct_score');
    default:
      return kind ? kind.replaceAll('_', ' ') : '—';
  }
}

export function SimBetMarketContext({ bet }: { bet: SimBetRecord }) {
  const { t } = useI18n();
  return (
    <div className="text-xs text-muted-foreground">
      <span className="uppercase">{bet.game ?? '—'}</span>
      <span> · {readableMarketKind(bet.marketKind, t)}</span>
    </div>
  );
}

export function SimBetMarketSummary({
  bet,
  showContext = true,
}: {
  bet: SimBetRecord;
  showContext?: boolean;
}) {
  const legs = bet.legs ?? [];
  const matchLabel = bet.matchName ?? bet.matchId ?? legs[0]?.matchId ?? '—';
  const marketId = bet.marketId ?? legs[0]?.marketId;

  return (
    <div className="min-w-0" data-testid={`bet-market-summary-${bet.id}`}>
      <div className="truncate font-medium" title={matchLabel}>{matchLabel}</div>
      {showContext && <SimBetMarketContext bet={bet} />}
      {legs.length > 0 && (
        <div className="mt-0.5 space-y-0.5 text-xs">
          {legs.map((leg) => (
            <div key={leg.id} className="truncate" title={`${leg.selection} @ ${leg.odds.toFixed(2)}`}>
              {leg.selection} <span className="text-muted-foreground">@ {leg.odds.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
      {marketId && (
        <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground" title={marketId}>
          ID {marketId}
        </div>
      )}
    </div>
  );
}
