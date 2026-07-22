import { AlertTriangle, BarChart3, Info } from 'lucide-react';
import type { MarketAnalysisSignal, MarketScenarioAnalysis } from '@polyrader/core/browser';
import { Badge, Card, CardHeader, CardTitle } from '@/components/ui';
import { useI18n } from '../hooks/use-i18n';
import { cn } from '../utils/cn';

interface MultiMarketAnalysisPanelProps {
  analyses: MarketScenarioAnalysis[];
}

export function MultiMarketAnalysisPanel({ analyses }: MultiMarketAnalysisPanelProps) {
  const { t, locale } = useI18n();

  return (
    <Card className="p-4" data-testid="multi-market-analysis">
      <CardHeader className="mb-4 flex-row items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">{t('match.multiMarketAnalysis')}</CardTitle>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{t('match.multiMarketAnalysisHint')}</p>
        </div>
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          {t('match.marketCount', { count: analyses.length })}
        </Badge>
      </CardHeader>

      <div className="mb-4 flex items-start gap-2 border-y border-border py-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{t('match.derivedMarketWarning')}</span>
      </div>

      <div className="divide-y divide-border">
        {analyses.map((analysis) => (
          <section key={analysis.conditionId} className="py-4 first:pt-0 last:pb-0" data-testid="market-analysis-row">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="rounded text-[10px]">
                    {t(`match.marketKind.${analysis.kind}`)}
                  </Badge>
                  <SignalBadge signal={analysis.signal} />
                  {analysis.liquidityStatus === 'low' && (
                    <div
                      className="inline-flex items-center gap-1 rounded border border-yellow/30 bg-yellow/10 px-1.5 py-0.5 text-[10px] text-yellow"
                      data-testid="low-liquidity-warning"
                    >
                      <AlertTriangle className="h-3 w-3" />
                      {t('match.lowLiquidityCompact', { amount: formatUsd(analysis.liquidity, locale) })}
                    </div>
                  )}
                </div>
                <p className="mt-2 break-words text-xs text-foreground">{analysis.question}</p>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[10px] text-muted-foreground">{t('match.analysisConfidence')}</div>
                <div className="font-mono text-sm tabular-nums">{formatPercent(analysis.confidence)}</div>
              </div>
            </div>

            <div className="mt-3 overflow-hidden rounded border border-border">
              <div className="grid grid-cols-[minmax(90px,1.4fr)_repeat(3,minmax(64px,1fr))] gap-2 border-b border-border bg-muted/20 px-3 py-2 text-[10px] text-muted-foreground">
                <span>{t('match.outcome')}</span>
                <span className="text-right">{t('match.marketProbabilityShort')}</span>
                <span className="text-right">{t('match.modelProbabilityShort')}</span>
                <span className="text-right">{t('match.edgeShort')}</span>
              </div>
              {analysis.outcomes.map((outcome) => (
                <div
                  key={outcome.selection}
                  className={cn(
                    'grid grid-cols-[minmax(90px,1.4fr)_repeat(3,minmax(64px,1fr))] gap-2 border-b border-border/70 px-3 py-2.5 text-xs last:border-0',
                    analysis.focusOutcome === outcome.selection && 'bg-foreground/[0.035]',
                  )}
                >
                  <span className="truncate font-medium" title={outcome.selection}>{outcome.selection}</span>
                  <span className="text-right font-mono tabular-nums text-muted-foreground">{formatNullablePercent(outcome.marketProbability)}</span>
                  <span className="text-right font-mono tabular-nums">{formatNullablePercent(outcome.modelProbability)}</span>
                  <span className={cn(
                    'text-right font-mono tabular-nums',
                    outcome.edge !== null && outcome.edge >= 0.05 && 'text-green',
                    outcome.edge !== null && outcome.edge <= -0.05 && 'text-red',
                  )}>
                    {formatEdge(outcome.edge)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Card>
  );
}

function SignalBadge({ signal }: { signal: MarketAnalysisSignal }) {
  const { t } = useI18n();
  const variant = signal === 'model_edge'
    ? 'green'
    : signal === 'observe_only'
      ? 'yellow'
      : signal === 'model_limited'
        ? 'outline'
        : 'secondary';
  return <Badge variant={variant} className="text-[10px]">{t(`match.marketSignal.${signal}`)}</Badge>;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

function formatNullablePercent(value: number | null): string {
  return value === null ? '--' : `${(value * 100).toFixed(1)}%`;
}

function formatEdge(value: number | null): string {
  if (value === null) return '--';
  const points = value * 100;
  return `${points > 0 ? '+' : ''}${points.toFixed(1)}pp`;
}

function formatUsd(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}
