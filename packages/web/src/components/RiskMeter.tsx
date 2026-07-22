import { AlertTriangle, TrendingDown, Shield } from 'lucide-react';
import { useI18n } from '../hooks/use-i18n';
import { cn } from '../utils/cn';

export interface RiskMeterProps {
  stake: number;
  bankroll: number;
  openExposure: number;
  /** Today's total open + settled stake at risk, in currency units. */
  dailyRisk?: number;
  /** 0–1 estimate of portfolio correlation across slip legs. */
  correlationRisk?: number;
  /** Stake fraction minus suggested Kelly fraction (positive = oversized). */
  kellyDeviation?: number;
  className?: string;
  showLabels?: boolean;
}

function riskLevelColor(fraction: number): string {
  if (fraction <= 0.02) return 'text-green';
  if (fraction <= 0.05) return 'text-yellow';
  return 'text-red';
}

function riskLevelLabel(fraction: number, t: (key: string) => string): string {
  if (fraction <= 0.02) return t('risk.disciplined');
  if (fraction <= 0.05) return t('risk.watchPosition');
  return t('risk.exceedsLimit');
}

export function RiskMeter({
  stake,
  bankroll,
  openExposure,
  dailyRisk,
  correlationRisk,
  kellyDeviation,
  className,
  showLabels = true,
}: RiskMeterProps) {
  const { t } = useI18n();

  const stakeFraction = bankroll > 0 ? stake / bankroll : 0;
  const exposureFraction = bankroll > 0 ? openExposure / bankroll : 0;
  const dailyFraction = bankroll > 0 && dailyRisk !== undefined ? dailyRisk / bankroll : 0;
  const correlation = correlationRisk ?? 0;
  const kellyDelta = kellyDeviation ?? 0;

  const stakeColor = riskLevelColor(stakeFraction);
  const stakeLabel = riskLevelLabel(stakeFraction, t);

  return (
    <div className={cn('space-y-2 rounded-md border border-border p-3 text-xs', className)}>
      {showLabels && (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Shield className="h-3.5 w-3.5" />
          <span>{t('risk.title')}</span>
        </div>
      )}

      <div className="space-y-2">
        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('risk.singleStake')}</span>
            <span className={cn('tabular-nums font-medium', stakeColor)}>
              {(stakeFraction * 100).toFixed(1)}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full transition-all duration-300', stakeFraction > 0.05 ? 'bg-red' : stakeFraction > 0.02 ? 'bg-yellow' : 'bg-green')}
              style={{ width: `${Math.min(stakeFraction * 100 * 5, 100)}%` }}
            />
          </div>
          <div className={cn('text-[10px]', stakeColor)}>{stakeLabel}</div>
        </div>

        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('risk.openExposure')}</span>
          <span className="tabular-nums font-medium">{(exposureFraction * 100).toFixed(1)}%</span>
        </div>

        {dailyRisk !== undefined && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('risk.dailyRisk')}</span>
            <span className={cn('tabular-nums font-medium', riskLevelColor(dailyFraction))}>
              {(dailyFraction * 100).toFixed(1)}%
            </span>
          </div>
        )}

        {correlationRisk !== undefined && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('risk.correlation')}</span>
            <span className={cn('tabular-nums font-medium', correlation >= 0.6 ? 'text-yellow' : 'text-foreground')}>
              {(correlation * 100).toFixed(0)}%
            </span>
          </div>
        )}

        {kellyDeviation !== undefined && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('risk.kellyDeviation')}</span>
            <span className={cn(
              'tabular-nums font-medium',
              Math.abs(kellyDelta) >= 0.02 ? 'text-yellow' : 'text-foreground',
            )}>
              {kellyDelta >= 0 ? '+' : ''}{(kellyDelta * 100).toFixed(1)}pp
            </span>
          </div>
        )}

        {stakeFraction > 0.05 && (
          <div className="flex items-start gap-1.5 rounded-md bg-red/5 p-2 text-[10px] text-red">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{t('risk.exceedsSingleRisk')}</span>
          </div>
        )}

        {exposureFraction > 0.2 && (
          <div className="flex items-start gap-1.5 rounded-md bg-yellow/5 p-2 text-[10px] text-yellow">
            <TrendingDown className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{t('risk.highExposure')}</span>
          </div>
        )}

        {correlation >= 0.6 && (
          <div className="flex items-start gap-1.5 rounded-md bg-yellow/5 p-2 text-[10px] text-yellow">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{t('risk.highCorrelation')}</span>
          </div>
        )}

        {kellyDelta >= 0.02 && (
          <div className="flex items-start gap-1.5 rounded-md bg-yellow/5 p-2 text-[10px] text-yellow">
            <TrendingDown className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{t('risk.overKelly')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
