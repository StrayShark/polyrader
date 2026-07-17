import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Bot, Database, ExternalLink, KeyRound, RefreshCw, Save, Settings, Shield, Wallet, type LucideIcon } from 'lucide-react';
import type { SimAccount } from '@polyrader/core';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Skeleton } from '@/components/ui';
import { api } from '../utils/api';
import { useI18n } from '../hooks/use-i18n';
import { useToast } from '../components/ToastProvider';
import type { SystemFeatures } from '../stores/feature-flag-store';
import { cn } from '../utils/cn';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  dependencies: {
    database: { status: string; latency?: number };
    cache: { status: string; size: number; maxSize: number };
    websocket: { status: string; connections: number };
    whaleIngestion: { status: string; consecutiveFailures: number; lastIngestedCount: number; lastError?: string };
    priceStream: { status: string; connected: boolean; subscriptionCount: number; lastError?: string };
    grid: { status: string; configured: boolean };
    externalApis: { status: string; checks: Array<{ name: string; status: string }> };
  };
}

interface SettingsForm {
  name: string;
  initialBankroll: string;
  maxSingleRiskPct: string;
  maxDailyRiskPct: string;
}

function statusVariant(status: string): 'green' | 'yellow' | 'red' | 'secondary' {
  if (['ok', 'healthy', 'connected', 'Enabled', '已启用'].includes(status)) return 'green';
  if (['degraded', 'idle', 'skipped', 'unknown', 'Disabled', '已关闭'].includes(status)) return 'yellow';
  if (['error', 'unhealthy', 'failed'].includes(status)) return 'red';
  return 'secondary';
}

function formatUptime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function toForm(account: SimAccount): SettingsForm {
  return {
    name: account.name,
    initialBankroll: account.initialBankroll.toFixed(2),
    maxSingleRiskPct: (account.maxSingleRiskPct * 100).toFixed(1),
    maxDailyRiskPct: (account.maxDailyRiskPct * 100).toFixed(1),
  };
}

function DependencyRow({ label, status, detail }: { label: string; status: string; detail?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2 last:border-b-0">
      <div className="min-w-0">
        <div className="truncate text-sm">{label}</div>
        {detail && <div className="truncate text-xs text-muted-foreground">{detail}</div>}
      </div>
      <Badge variant={statusVariant(status)} className="shrink-0">{status}</Badge>
    </div>
  );
}

function SettingsLink({ to, label, icon: Icon }: { to: string; label: string; icon: LucideIcon }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-accent/50"
    >
      <span className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {label}
      </span>
      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
    </Link>
  );
}

export function SettingsPage() {
  const { t } = useI18n();
  const { addToast } = useToast();
  const [account, setAccount] = useState<SimAccount | null>(null);
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [features, setFeatures] = useState<SystemFeatures | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchSettings() {
    setIsLoading(true);
    setError(null);
    try {
      const [accountRes, featuresRes, healthRes] = await Promise.all([
        api.get<{ data: SimAccount }>('/sim/account'),
        api.get<{ data: SystemFeatures }>('/system/features'),
        api.get<{ data: HealthStatus }>('/system/health'),
      ]);
      setAccount(accountRes.data);
      setForm(toForm(accountRes.data));
      setFeatures(featuresRes.data);
      setHealth(healthRes.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void fetchSettings();
  }, []);

  async function saveAccount() {
    if (!account || !form) return;
    setIsSaving(true);
    setError(null);
    try {
      const res = await api.put<{ data: SimAccount }>(`/sim/account/${encodeURIComponent(account.id)}`, {
        name: form.name.trim() || account.name,
        initialBankroll: Number(form.initialBankroll) || account.initialBankroll,
        maxSingleRiskPct: Math.max(0.001, (Number(form.maxSingleRiskPct) || 0) / 100),
        maxDailyRiskPct: Math.max(0.001, (Number(form.maxDailyRiskPct) || 0) / 100),
      });
      setAccount(res.data);
      setForm(toForm(res.data));
      addToast('success', t('common.saved'));
    } catch (err) {
      setError((err as Error).message);
      addToast('error', (err as Error).message);
    } finally {
      setIsSaving(false);
    }
  }

  const dependencyRows = useMemo(() => {
    if (!health) return [];
    return [
      { label: t('settings.database'), status: health.dependencies.database.status, detail: `${health.dependencies.database.latency ?? 0}ms` },
      { label: t('settings.websocket'), status: health.dependencies.websocket.status, detail: `${health.dependencies.websocket.connections} connections` },
      { label: t('settings.cache'), status: health.dependencies.cache.status, detail: `${health.dependencies.cache.size}/${health.dependencies.cache.maxSize}` },
      { label: t('settings.priceStream'), status: health.dependencies.priceStream.status, detail: health.dependencies.priceStream.lastError },
      { label: t('settings.whaleIngestion'), status: health.dependencies.whaleIngestion.status, detail: health.dependencies.whaleIngestion.lastError },
      { label: 'GRID', status: health.dependencies.grid.status, detail: health.dependencies.grid.configured ? t('settings.configured') : t('settings.notConfigured') },
      ...health.dependencies.externalApis.checks.map((check) => ({ label: check.name, status: check.status, detail: t('settings.externalApi') })),
    ];
  }, [health, t]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t('settings.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('settings.subtitle')}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchSettings} disabled={isLoading}>
          <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          {t('common.refresh')}
        </Button>
      </div>

      {error && <div className="rounded-md border border-red/20 bg-red/5 p-3 text-sm text-red">{error}</div>}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">{t('settings.practiceRisk')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!form ? (
              <div className="space-y-2">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            ) : (
              <>
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">{t('settings.accountName')}</span>
                  <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                </label>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block space-y-1">
                    <span className="text-xs text-muted-foreground">{t('settings.initialBankroll')}</span>
                    <Input type="number" min="1" value={form.initialBankroll} onChange={(event) => setForm({ ...form, initialBankroll: event.target.value })} />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-muted-foreground">{t('settings.maxSingleRisk')}</span>
                    <Input type="number" min="0.1" max="100" step="0.1" value={form.maxSingleRiskPct} onChange={(event) => setForm({ ...form, maxSingleRiskPct: event.target.value })} />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-muted-foreground">{t('settings.maxDailyRisk')}</span>
                    <Input type="number" min="0.1" max="100" step="0.1" value={form.maxDailyRiskPct} onChange={(event) => setForm({ ...form, maxDailyRiskPct: event.target.value })} />
                  </label>
                </div>
                <div className="flex items-center justify-between gap-3 pt-1">
                  <p className="text-xs text-muted-foreground">{t('settings.riskHint')}</p>
                  <Button size="sm" onClick={saveAccount} disabled={isSaving}>
                    <Save className="h-3.5 w-3.5" />
                    {isSaving ? t('common.saving') : t('common.save')}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm">{t('settings.dataHealth')}</CardTitle>
            </div>
            {health && <Badge variant={statusVariant(health.status)}>{health.status}</Badge>}
          </CardHeader>
          <CardContent>
            {!health ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (
              <>
                <div className="mb-2 text-xs text-muted-foreground">
                  {t('settings.lastChecked')} {new Date(health.timestamp).toLocaleString()} · {t('settings.uptime')} {formatUptime(health.uptime)}
                </div>
                <div>
                  {dependencyRows.map((row) => (
                    <DependencyRow key={`${row.label}-${row.status}`} {...row} />
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">{t('settings.advancedAccess')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <DependencyRow label={t('settings.polymarketAccount')} status={features?.polymarketAccountEnabled ? t('settings.enabled') : t('settings.disabled')} detail={t('settings.polymarketAccountHint')} />
            <DependencyRow label={t('settings.marketOrders')} status={features?.marketOrdersEnabled ? t('settings.enabled') : t('settings.disabled')} detail={t('settings.marketOrdersHint')} />
            <DependencyRow label={t('settings.liveTrading')} status={features?.liveTradingEnabled ? t('settings.enabled') : t('settings.disabled')} detail={t('settings.liveTradingHint')} />
            <div className="grid gap-2 pt-1 sm:grid-cols-2">
              {features?.polymarketAccountEnabled ? (
                <SettingsLink to="/polymarket/account" label={t('nav.polymarketAccount')} icon={Wallet} />
              ) : (
                <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
                  {t('settings.enablePolymarketAccount')}
                </div>
              )}
              <SettingsLink to="/ai/config" label={t('nav.aiConfig')} icon={Bot} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">{t('settings.localData')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <SettingsLink to="/database" label={t('nav.database')} icon={Database} />
            <SettingsLink to="/strategy" label={t('nav.strategy')} icon={Activity} />
            <SettingsLink to="/review" label={t('nav.review')} icon={Shield} />
            <SettingsLink to="/bankroll" label={t('nav.bankroll')} icon={Wallet} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
