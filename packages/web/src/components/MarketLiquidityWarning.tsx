import { AlertTriangle } from 'lucide-react';
import { assessMarketLiquidity, LOW_LIQUIDITY_THRESHOLD_USD } from '@polyrader/core/browser';
import { useI18n } from '../hooks/use-i18n';
import { cn } from '../utils/cn';

interface MarketLiquidityWarningProps {
  liquidity: number;
  tags?: string[];
  compact?: boolean;
  className?: string;
}

export function MarketLiquidityWarning({
  liquidity,
  tags = [],
  compact = false,
  className,
}: MarketLiquidityWarningProps) {
  const { t, locale } = useI18n();
  const status = assessMarketLiquidity({ liquidity, tags });
  if (status !== 'low') return null;

  const amount = formatUsd(liquidity, locale);
  const threshold = formatUsd(LOW_LIQUIDITY_THRESHOLD_USD, locale);

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded border border-yellow/30 bg-yellow/10 text-yellow',
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1.5 text-xs',
        className,
      )}
      data-testid="low-liquidity-warning"
      title={t('match.lowLiquidityWarning', { amount, threshold })}
    >
      <AlertTriangle className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      <span>{compact ? t('match.lowLiquidityCompact', { amount }) : t('match.lowLiquidityWarning', { amount, threshold })}</span>
    </div>
  );
}

function formatUsd(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}
