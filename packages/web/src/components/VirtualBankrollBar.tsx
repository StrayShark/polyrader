import { Wallet, TrendingUp, AlertTriangle } from 'lucide-react';
import { useBankrollStore } from '../stores/bankroll-store';
import { useI18n } from '../hooks/use-i18n';
import { Badge } from '@/components/ui';
import { cn } from '../utils/cn';

export function VirtualBankrollBar() {
  const { summary, isLoading } = useBankrollStore();
  const { t } = useI18n();

  if (isLoading || !summary) {
    return (
      <div className="flex h-10 items-center gap-4 border-b border-border bg-muted/30 px-4 text-sm">
        <span className="text-muted-foreground">{t('bankroll.loading')}</span>
      </div>
    );
  }

  const { account, todayPnl, openExposure } = summary;
  const pnlPositive = todayPnl >= 0;

  return (
    <div className="flex h-10 items-center gap-2 overflow-hidden whitespace-nowrap border-b border-border bg-muted/30 px-2 text-xs sm:gap-4 sm:px-4 sm:text-sm">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="rounded text-[10px]">
          {t('productMode.simulation.badge')}
        </Badge>
        <span className="hidden font-medium sm:inline">{t('bankroll.practiceAccount')}</span>
      </div>

      <div className="flex min-w-0 items-center gap-1.5">
        <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="hidden text-muted-foreground sm:inline">{t('bankroll.total')}:</span>
        <span className="tabular-nums font-medium">
          ${account.currentBankroll.toFixed(2)}
        </span>
      </div>

      <div className="hidden items-center gap-1.5 md:flex">
        <span className="text-muted-foreground">{t('bankroll.available')}:</span>
        <span className="tabular-nums">${account.availableBankroll.toFixed(2)}</span>
      </div>

      <div className="ml-auto flex items-center gap-1 sm:ml-0 sm:gap-1.5">
        <TrendingUp className={cn('h-3.5 w-3.5', pnlPositive ? 'text-green' : 'text-red')} />
        <span className="hidden text-muted-foreground sm:inline">{t('bankroll.todayPnl')}:</span>
        <span className={cn('tabular-nums font-medium', pnlPositive ? 'text-green' : 'text-red')}>
          {pnlPositive ? '+' : ''}${todayPnl.toFixed(2)}
        </span>
      </div>

      {openExposure > 0 && (
        <div className="ml-auto flex items-center gap-1.5 text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>{t('bankroll.openExposure')}:</span>
          <span className="tabular-nums">${openExposure.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}
