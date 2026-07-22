import { useState } from 'react';
import { X, Trash2, TrendingDown, DollarSign } from 'lucide-react';
import { usePracticeSlipStore, MAX_LEGS, MIN_ODDS, MAX_ODDS, type SlipBetType } from '../stores/practice-slip-store';
import { useBankrollStore } from '../stores/bankroll-store';
import { useI18n } from '../hooks/use-i18n';
import { Card, CardHeader, CardTitle, Button, Input } from '@/components/ui';
import { cn } from '../utils/cn';
import { oddsToImpliedProbability, calculateEv, calculateEdge } from '../utils/bet-math';
import { RiskMeter } from './RiskMeter';

export function PracticeBetSlip() {
  const {
    legs,
    betType,
    stake,
    userProbability,
    isSubmitting,
    error,
    removeLeg,
    clearSlip,
    setStake,
    setBetType,
    setUserProbability,
    submitBet,
  } = usePracticeSlipStore();
  const { summary } = useBankrollStore();
  const { t } = useI18n();
  const [reasoning, setReasoning] = useState('');

  // Derived values
  const totalOdds = legs.reduce((product, leg) => product * Math.max(1.01, leg.odds), 1);
  const impliedProbability = oddsToImpliedProbability(totalOdds);
  const effectiveUserProbability = userProbability ?? impliedProbability;
  const edge = calculateEdge(effectiveUserProbability, impliedProbability);
  const potentialReturn = stake * totalOdds;
  const potentialProfit = potentialReturn - stake;
  const ev = calculateEv(stake, effectiveUserProbability, totalOdds);

  const bankroll = summary?.account.currentBankroll ?? 0;
  const availableBankroll = summary?.account.availableBankroll ?? 0;
  const riskFraction = bankroll > 0 ? stake / bankroll : 0;
  const exceedsSingleRisk = riskFraction > (summary?.account.maxSingleRiskPct ?? 0.02);
  const exceedsBankroll = stake > availableBankroll;
  const invalidOdds = legs.some((l) => !Number.isFinite(l.odds) || l.odds < MIN_ODDS || l.odds > MAX_ODDS);
  const canSubmit =
    !isSubmitting &&
    !exceedsBankroll &&
    !exceedsSingleRisk &&
    stake >= 1 &&
    !invalidOdds &&
    legs.length > 0 &&
    legs.length <= MAX_LEGS;
  const disabledReason = (() => {
    if (isSubmitting || canSubmit) return null;
    if (legs.length === 0) return t('slip.disabledNoSelection');
    if (legs.length > MAX_LEGS) return t('slip.disabledTooManyLegs', { max: MAX_LEGS });
    if (invalidOdds) return t('slip.disabledInvalidOdds');
    if (stake < 1) return t('slip.disabledStake');
    if (exceedsBankroll) return t('slip.exceedsBankroll');
    if (exceedsSingleRisk) return t('slip.exceedsSingleRisk');
    return t('slip.disabledGeneric');
  })();

  const formatError = (err: string | null) => {
    if (!err) return '';
    if (err === 'slip.maxLegs') return t(err, { max: MAX_LEGS });
    if (err === 'slip.invalidOdds') return t(err, { min: MIN_ODDS, max: MAX_ODDS });
    return t(err);
  };

  const comboCount = betType === 'round_robin' && legs.length >= 3
    ? (legs.length * (legs.length - 1)) / 2
    : 1;
  const perComboStake = betType === 'round_robin' && comboCount > 1 ? Math.max(1, stake / comboCount) : stake;
  const displayTotalStake = betType === 'round_robin' && comboCount > 1 ? perComboStake * comboCount : stake;
  const dailyRisk = (summary?.openExposure ?? 0) + displayTotalStake;
  const matchIds = new Set(legs.map((leg) => leg.matchId).filter(Boolean));
  const correlationRisk = legs.length <= 1
    ? 0
    : Math.min(1, 1 - (matchIds.size / legs.length));
  const kellyFraction = Math.max(0, edge) / Math.max(totalOdds - 1, 0.01);
  const kellyDeviation = bankroll > 0
    ? (displayTotalStake / bankroll) - Math.min(kellyFraction, 0.05)
    : 0;

  const handleSubmit = async () => {
    const ok = await submitBet(reasoning || undefined);
    if (ok) {
      setReasoning('');
      clearSlip();
      void useBankrollStore.getState().fetchSummary();
    }
  };

  if (legs.length === 0) {
    return (
      <Card className="flex h-full flex-col">
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="text-sm">{t('slip.title')}</CardTitle>
        </CardHeader>
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-sm text-muted-foreground">
          <DollarSign className="mb-2 h-8 w-8 opacity-20" />
          <p>{t('slip.empty')}</p>
          <p className="mt-1 text-xs">{t('slip.emptyHint')}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center justify-between border-b border-border pb-3">
        <CardTitle className="text-sm">{t('slip.title')}</CardTitle>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearSlip}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardHeader>

      <div className="flex-1 overflow-auto p-3">
        <div className="space-y-2">
          {legs.map((leg) => (
            <div
              key={leg.id}
              className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-2"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{leg.selection}</div>
                {leg.matchLabel && (
                  <div className="truncate text-[10px] text-muted-foreground">{leg.matchLabel}</div>
                )}
                <div className="text-[10px] tabular-nums text-muted-foreground">
                  @{leg.odds.toFixed(2)} ({(oddsToImpliedProbability(leg.odds) * 100).toFixed(1)}%)
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => removeLeg(leg.id)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {legs.length > 1 && (
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t('slip.betType')}</label>
              <div className="flex rounded-md border border-border p-0.5">
                {(['single', 'parlay', 'round_robin'] as SlipBetType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => setBetType(type)}
                    disabled={type === 'single' && legs.length > 1}
                    className={cn(
                      'flex-1 rounded px-2 py-1 text-xs transition-colors',
                      betType === type
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                      type === 'single' && legs.length > 1 && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    {t(`slip.betType_${type}`)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t('slip.stake')}</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">$</span>
              <Input
                type="number"
                min={1}
                max={availableBankroll}
                value={stake}
                onChange={(e) => setStake(Number(e.target.value))}
                className="h-8 text-sm"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="self-center text-[10px] text-muted-foreground">{t('slip.quickStake')}:</span>
              {[10, 25, 50, 100, 250, 500].map((p) => (
                <Button
                  key={p}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={p > availableBankroll}
                  onClick={() => setStake(p)}
                >
                  ${p}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t('slip.userProbability')}</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={100}
                value={userProbability === undefined ? '' : Math.round(userProbability * 100)}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '') {
                    setUserProbability(undefined);
                    return;
                  }
                  const num = Number(value);
                  if (Number.isFinite(num)) {
                    setUserProbability(num / 100);
                  }
                }}
                placeholder={t('slip.userProbabilityPlaceholder')}
                className="h-8 text-sm"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {t('slip.marketProbability')}: {(impliedProbability * 100).toFixed(1)}%
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t('slip.reasoning')}</label>
            <textarea
              value={reasoning}
              onChange={(e) => setReasoning(e.target.value)}
              placeholder={t('slip.reasoningPlaceholder')}
              className="min-h-[60px] w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          <div className="space-y-1.5 rounded-md border border-border p-3 text-xs">
            {betType === 'round_robin' && comboCount > 1 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('slip.roundRobinCombos')}</span>
                <span className="tabular-nums font-medium">{comboCount}</span>
              </div>
            )}
            {betType === 'round_robin' && comboCount > 1 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('slip.perComboStake')}</span>
                <span className="tabular-nums font-medium">${perComboStake.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('slip.totalOdds')}</span>
              <span className="tabular-nums font-medium">{totalOdds.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('slip.impliedProbability')}</span>
              <span className="tabular-nums">{(impliedProbability * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('slip.edge')}</span>
              <span className={cn('tabular-nums', edge > 0 ? 'text-green' : edge < 0 ? 'text-red' : 'text-muted-foreground')}>
                {edge >= 0 ? '+' : ''}{(edge * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('slip.maxLoss')}</span>
              <span className="tabular-nums text-red">-${displayTotalStake.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('slip.potentialReturn')}</span>
              <span className="tabular-nums text-green">+${(potentialProfit * (betType === 'round_robin' && comboCount > 1 ? comboCount : 1)).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('slip.ev')}</span>
              <span className={cn('tabular-nums', ev >= 0 ? 'text-green' : 'text-red')}>
                {ev >= 0 ? '+' : ''}${ev.toFixed(2)}
              </span>
            </div>
          </div>

          <RiskMeter
            stake={displayTotalStake}
            bankroll={bankroll}
            openExposure={summary?.openExposure ?? summary?.account.openExposure ?? 0}
            dailyRisk={dailyRisk}
            correlationRisk={correlationRisk}
            kellyDeviation={kellyDeviation}
          />

          {(exceedsSingleRisk || exceedsBankroll) && (
            <div className="flex items-start gap-2 rounded-md border border-red/20 bg-red/5 p-2 text-xs text-red">
              <TrendingDown className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {exceedsBankroll
                  ? t('slip.exceedsBankroll')
                  : t('slip.exceedsSingleRisk')}
              </span>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red/20 bg-red/5 p-2 text-xs text-red">{formatError(error)}</div>
          )}
        </div>
      </div>

      <div className="border-t border-border p-3">
        <Button
          className="w-full"
          disabled={!canSubmit}
          title={disabledReason ?? undefined}
          onClick={handleSubmit}
        >
          {isSubmitting ? t('common.saving') : t('slip.submit')}
        </Button>
        {disabledReason && (
          <p className="mt-2 rounded-md border border-yellow/20 bg-yellow/5 px-2 py-1 text-center text-[10px] text-yellow">
            {disabledReason}
          </p>
        )}
        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          {t('slip.simulationDisclaimer')}
        </p>
      </div>
    </Card>
  );
}
