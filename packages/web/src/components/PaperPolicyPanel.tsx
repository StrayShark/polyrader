import { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { useI18n } from '../hooks/use-i18n';
import { Badge, Button, Card, CardHeader, CardTitle, Input } from '@/components/ui';
import type { PaperPolicyProfile } from '@polyrader/core/browser';

interface PolicyRecord {
  id: string;
  name: string;
  policyVersion: string;
  policy: PaperPolicyProfile;
  isActive: boolean;
}

interface DecisionRow {
  id: string;
  runId: string;
  game: string;
  action: string;
  outcomeId: string | null;
  stake: number | null;
  edgeAtEntry: number | null;
  provider: string | null;
  policyVersion: string;
  createdAt: string;
  reasonCodesJson: string;
  betId?: string | null;
}

interface RiskState {
  policyVersion: string;
  exposure: {
    dailyStake: number;
    openExposure: number;
    byGame: Array<{ key: string; exposure: number }>;
    byProvider: Array<{ key: string; exposure: number }>;
    byMarketKind: Array<{ key: string; exposure: number }>;
  };
  limits: {
    maxSingleStake: number;
    maxDailyStake: number;
    maxOpenExposure: number;
    maxGameExposure: number;
    maxProviderExposure: number;
    maxMarketKindExposure: number;
  };
}

export function PaperPolicyPanel() {
  const { t } = useI18n();
  const [policy, setPolicy] = useState<PolicyRecord | null>(null);
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [riskState, setRiskState] = useState<RiskState | null>(null);
  const [performance, setPerformance] = useState<{
    settledCount: number;
    openCount: number;
    wins: number;
    losses: number;
    winRate: number;
    totalPnl: number;
    avgBrier?: number;
    avgClv?: number;
    clvSampleCount: number;
    clvMissingCount: number;
    equity: number;
    byGame: Array<{ key: string; settledCount: number; totalPnl: number; avgBrier?: number }>;
    byProvider: Array<{ key: string; settledCount: number; totalPnl: number; avgBrier?: number }>;
  } | null>(null);
  const [filter, setFilter] = useState<'all' | 'paper_bet' | 'pass' | 'rejected'>('all');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const active = await api.get<{ data: PolicyRecord }>('/paper-policy/active');
      setPolicy(active.data);
      const risk = await api.get<{ data: RiskState }>('/paper-policy/risk-state');
      setRiskState(risk.data);
      const query = filter === 'all' ? '' : `?action=${filter}`;
      const list = await api.get<{ data: DecisionRow[] }>(`/paper-decisions${query}`);
      setDecisions(list.data);
      const summary = await api.get<{ data: NonNullable<typeof performance> }>(
        '/performance/summary',
      );
      setPerformance(summary.data);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    void load();
  }, [filter]);

  const save = async () => {
    if (!policy) return;
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.post<{ data: PolicyRecord }>('/paper-policy', {
        id: policy.id,
        name: policy.name,
        policy: policy.policy,
        isActive: true,
      });
      setPolicy(data);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof PaperPolicyProfile>(
    key: K,
    value: PaperPolicyProfile[K],
  ) => {
    if (!policy) return;
    setPolicy({
      ...policy,
      policy: { ...policy.policy, [key]: value },
    });
  };

  return (
    <div className="space-y-4" data-testid="paper-policy-panel">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">{t('paperPolicy.title')}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{t('paperPolicy.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            {policy && <Badge variant="green">{policy.policy.policyVersion}</Badge>}
            <Button size="sm" onClick={() => void save()} disabled={saving || !policy}>
              {t('common.save')}
            </Button>
          </div>
        </CardHeader>
        {error && <div className="px-4 pb-2 text-sm text-destructive">{error}</div>}
        {policy && (
          <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label={t('paperPolicy.minCompleteness')}>
              <Input
                type="number"
                step="0.01"
                value={policy.policy.minimumCompleteness}
                onChange={(e) => updateField('minimumCompleteness', Number(e.target.value))}
              />
            </Field>
            <Field label={t('paperPolicy.maxFreshnessMinutes')}>
              <Input
                type="number"
                min="1"
                step="15"
                value={Math.round(policy.policy.maximumFreshnessSeconds / 60)}
                onChange={(e) =>
                  updateField('maximumFreshnessSeconds', Math.max(60, Number(e.target.value) * 60))
                }
              />
            </Field>
            <Field label={t('paperPolicy.minConfidence')}>
              <Input
                type="number"
                step="0.01"
                value={policy.policy.minimumConfidence}
                onChange={(e) => updateField('minimumConfidence', Number(e.target.value))}
              />
            </Field>
            <Field label={t('paperPolicy.minEdge')}>
              <Input
                type="number"
                step="0.01"
                value={policy.policy.minimumEdge}
                onChange={(e) => updateField('minimumEdge', Number(e.target.value))}
              />
            </Field>
            <Field label={t('paperPolicy.maxStake')}>
              <Input
                type="number"
                step="1"
                value={policy.policy.maxSingleStake}
                onChange={(e) => updateField('maxSingleStake', Number(e.target.value))}
              />
            </Field>
            <Field label={t('paperPolicy.fixedStake')}>
              <Input
                type="number"
                step="1"
                value={policy.policy.fixedStake}
                onChange={(e) => updateField('fixedStake', Number(e.target.value))}
              />
            </Field>
            <Field label={t('paperPolicy.maxDailyStake')}>
              <Input
                type="number"
                min="0"
                step="10"
                value={policy.policy.maxDailyStake}
                onChange={(e) => updateField('maxDailyStake', Number(e.target.value))}
              />
            </Field>
            <Field label={t('paperPolicy.maxOpenExposure')}>
              <Input
                type="number"
                min="0"
                step="10"
                value={policy.policy.maxOpenExposure}
                onChange={(e) => updateField('maxOpenExposure', Number(e.target.value))}
              />
            </Field>
            <Field label={t('paperPolicy.maxGameExposure')}>
              <Input
                type="number"
                min="0"
                step="10"
                value={policy.policy.maxGameExposure}
                onChange={(e) => updateField('maxGameExposure', Number(e.target.value))}
              />
            </Field>
            <Field label={t('paperPolicy.maxProviderExposure')}>
              <Input
                type="number"
                min="0"
                step="10"
                value={policy.policy.maxProviderExposure}
                onChange={(e) => updateField('maxProviderExposure', Number(e.target.value))}
              />
            </Field>
            <Field label={t('paperPolicy.maxMarketExposure')}>
              <Input
                type="number"
                min="0"
                step="10"
                value={policy.policy.maxMarketKindExposure}
                onChange={(e) => updateField('maxMarketKindExposure', Number(e.target.value))}
              />
            </Field>
            <Field label={t('paperPolicy.lowLiquidity')}>
              <Input
                type="number"
                step="100"
                value={policy.policy.lowLiquidityThresholdUsd}
                onChange={(e) => updateField('lowLiquidityThresholdUsd', Number(e.target.value))}
              />
            </Field>
          </div>
        )}
      </Card>

      {riskState && (
        <Card data-testid="paper-risk-state">
          <CardHeader>
            <CardTitle className="text-base">{t('paperPolicy.riskUsage')}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('paperPolicy.riskUsageSubtitle')}
            </p>
          </CardHeader>
          <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2">
            <Usage
              label={t('paperPolicy.dailyUsage')}
              value={riskState.exposure.dailyStake}
              limit={riskState.limits.maxDailyStake}
            />
            <Usage
              label={t('paperPolicy.openUsage')}
              value={riskState.exposure.openExposure}
              limit={riskState.limits.maxOpenExposure}
            />
          </div>
          <div className="grid gap-3 px-4 pb-4 lg:grid-cols-3">
            <ExposureList
              title={t('paperPolicy.byGame')}
              rows={riskState.exposure.byGame}
              limit={riskState.limits.maxGameExposure}
            />
            <ExposureList
              title={t('paperPolicy.byProvider')}
              rows={riskState.exposure.byProvider}
              limit={riskState.limits.maxProviderExposure}
            />
            <ExposureList
              title={t('paperPolicy.byMarket')}
              rows={riskState.exposure.byMarketKind}
              limit={riskState.limits.maxMarketKindExposure}
            />
          </div>
        </Card>
      )}

      {performance && (
        <Card data-testid="performance-summary">
          <CardHeader>
            <CardTitle className="text-base">{t('paperPolicy.performance')}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('paperPolicy.performanceSubtitle')}
            </p>
          </CardHeader>
          <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 xl:grid-cols-5">
            <Metric label={t('paperPolicy.equity')} value={`$${performance.equity.toFixed(2)}`} />
            <Metric
              label={t('paperPolicy.totalPnl')}
              value={`$${performance.totalPnl.toFixed(2)}`}
            />
            <Metric
              label={t('paperPolicy.winRate')}
              value={`${(performance.winRate * 100).toFixed(1)}% (${performance.wins}/${performance.settledCount})`}
            />
            <Metric
              label={t('paperPolicy.avgBrier')}
              value={performance.avgBrier == null ? '—' : performance.avgBrier.toFixed(3)}
            />
            <Metric
              label="CLV"
              value={
                performance.avgClv == null
                  ? `— (${performance.clvMissingCount})`
                  : `${(performance.avgClv * 100).toFixed(1)}% (n=${performance.clvSampleCount})`
              }
            />
          </div>
          <div className="grid gap-3 px-4 pb-4 lg:grid-cols-2">
            <AttributionList title={t('paperPolicy.byGame')} rows={performance.byGame} />
            <AttributionList title={t('paperPolicy.byProvider')} rows={performance.byProvider} />
          </div>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{t('paperPolicy.decisions')}</CardTitle>
          <div className="flex gap-1">
            {(['all', 'paper_bet', 'pass', 'rejected'] as const).map((item) => (
              <Button
                key={item}
                size="sm"
                variant={filter === item ? 'default' : 'outline'}
                onClick={() => setFilter(item)}
              >
                {item}
              </Button>
            ))}
          </div>
        </CardHeader>
        <div className="space-y-2 px-4 pb-4">
          {decisions.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('paperPolicy.noDecisions')}</p>
          )}
          {decisions.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"
            >
              <Badge
                variant={
                  row.action === 'paper_bet'
                    ? 'green'
                    : row.action === 'rejected'
                      ? 'yellow'
                      : 'secondary'
                }
              >
                {row.action}
              </Badge>
              <span className="font-mono text-xs">{row.runId.slice(0, 28)}</span>
              <span className="text-muted-foreground">{row.game}</span>
              <span className="font-mono">{row.outcomeId ?? '—'}</span>
              <span className="font-mono">${Number(row.stake ?? 0).toFixed(2)}</span>
              <span className="font-mono text-xs text-muted-foreground">
                edge {row.edgeAtEntry == null ? '—' : `${(row.edgeAtEntry * 100).toFixed(1)}pp`}
              </span>
              {row.betId && (
                <span className="font-mono text-xs text-muted-foreground">
                  bet {row.betId.slice(0, 14)}
                </span>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted-foreground">{props.label}</span>
      {props.children}
    </label>
  );
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="text-xs text-muted-foreground">{props.label}</div>
      <div className="mt-1 font-mono text-sm">{props.value}</div>
    </div>
  );
}

function Usage(props: { label: string; value: number; limit: number }) {
  const ratio = props.limit > 0 ? Math.min(1, props.value / props.limit) : 1;
  return (
    <div className="rounded-md border border-border px-3 py-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{props.label}</span>
        <span className="font-mono">
          ${props.value.toFixed(2)} / ${props.limit.toFixed(2)}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-sm bg-muted">
        <div
          className={ratio >= 0.8 ? 'h-full bg-amber-500' : 'h-full bg-foreground'}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}

function ExposureList(props: {
  title: string;
  rows: Array<{ key: string; exposure: number }>;
  limit: number;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm text-muted-foreground">{props.title}</div>
      {props.rows.length === 0 && <p className="text-sm text-muted-foreground">—</p>}
      {props.rows.slice(0, 5).map((row) => (
        <div
          key={row.key}
          className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
        >
          <span>{row.key}</span>
          <span className="font-mono text-xs text-muted-foreground">
            ${row.exposure.toFixed(2)} / ${props.limit.toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}

function AttributionList(props: {
  title: string;
  rows: Array<{ key: string; settledCount: number; totalPnl: number; avgBrier?: number }>;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm text-muted-foreground">{props.title}</div>
      {props.rows.length === 0 && <p className="text-sm text-muted-foreground">—</p>}
      {props.rows.slice(0, 5).map((row) => (
        <div
          key={row.key}
          className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
        >
          <span>{row.key}</span>
          <span className="font-mono text-xs text-muted-foreground">
            n={row.settledCount} · ${row.totalPnl.toFixed(2)}
            {row.avgBrier == null ? '' : ` · Brier ${row.avgBrier.toFixed(3)}`}
          </span>
        </div>
      ))}
    </div>
  );
}
