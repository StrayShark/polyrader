import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Activity,
  Bot,
  Database,
  DollarSign,
  Hash,
  KeyRound,
  Languages,
  Moon,
  Percent,
  RefreshCw,
  Save,
  Settings,
  Shield,
  Sun,
  Terminal,
  Wallet,
} from 'lucide-react';
import type { SimAccount } from '@polyrader/core/browser';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import type { OddsFormat } from '../utils/bet-math';
import { api } from '../utils/api';
import { useI18n } from '../hooks/use-i18n';
import { useToast } from '../components/ToastProvider';
import { useTheme } from '../components/ThemeProvider';
import { BackgroundTasksPanel } from '../components/background-tasks-panel';
import { EsportsDataSourcesPanel } from '../components/EsportsDataSourcesPanel';
import { LoadingSpinner } from '../components/LoadingState';
import { AiConfigPage } from './ai-config-page';
import { DatabasePage } from './database-page';
import type { SystemFeatures } from '../stores/feature-flag-store';
import { cn } from '../utils/cn';
import {
  readOddsFormatPreference,
  writeOddsFormatPreference,
} from '../utils/odds-format-preference';

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

type SettingsSection = 'general' | 'llm' | 'database' | 'system';

const SETTINGS_SECTIONS = new Set<SettingsSection>(['general', 'llm', 'database', 'system']);

function parseSection(value: string | null): SettingsSection {
  return value && SETTINGS_SECTIONS.has(value as SettingsSection)
    ? value as SettingsSection
    : 'general';
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

function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const { locale, setLocale, t } = useI18n();
  const [oddsFormat, setOddsFormat] = useState<OddsFormat>(() => readOddsFormatPreference());
  const themes = [
    { value: 'dark' as const, label: t('settings.themeDark'), icon: Moon },
    { value: 'light' as const, label: t('settings.themeLight'), icon: Sun },
    { value: 'matrix' as const, label: t('settings.themeMatrix'), icon: Terminal },
  ];
  const oddsFormats = [
    { value: 'decimal' as const, label: t('lobby.oddsFormatDecimal'), icon: Hash },
    { value: 'probability' as const, label: t('lobby.oddsFormatProbability'), icon: Percent },
    { value: 'american' as const, label: t('lobby.oddsFormatAmerican'), icon: DollarSign },
  ];

  const changeOddsFormat = (format: OddsFormat) => {
    setOddsFormat(format);
    writeOddsFormatPreference(format);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2">
        <Sun className="h-4 w-4 text-muted-foreground" />
        <CardTitle className="text-sm">{t('settings.appearance')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">{t('settings.theme')}</div>
          <div className="grid grid-cols-3 gap-1 rounded-md border border-border p-1">
            {themes.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                aria-pressed={theme === value}
                className={cn(
                  'flex h-9 items-center justify-center gap-2 rounded text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  theme === value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Languages className="h-3.5 w-3.5" />
            {t('settings.language')}
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-md border border-border p-1">
            {(['zh', 'en'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setLocale(value)}
                aria-pressed={locale === value}
                className={cn(
                  'h-9 rounded text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  locale === value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {value === 'zh' ? '中文' : 'English'}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">{t('settings.oddsFormat')}</div>
          <div className="grid grid-cols-3 gap-1 rounded-md border border-border p-1">
            {oddsFormats.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => changeOddsFormat(value)}
                aria-pressed={oddsFormat === value}
                className={cn(
                  'flex h-9 items-center justify-center gap-2 rounded text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  oddsFormat === value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  const { t } = useI18n();
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const section = parseSection(searchParams.get('section'));
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

  const changeSection = (value: string) => {
    const next = parseSection(value);
    setSearchParams(next === 'general' ? {} : { section: next }, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('settings.title')}</h1>
        </div>
        {(section === 'general' || section === 'system') && (
          <Button variant="outline" size="sm" onClick={fetchSettings} disabled={isLoading}>
            {isLoading ? <LoadingSpinner className="h-3.5 w-3.5" size={14} /> : <RefreshCw className="h-3.5 w-3.5" />}
            {t('common.refresh')}
          </Button>
        )}
      </div>

      {error && <div className="rounded-md border border-red/20 bg-red/5 p-3 text-sm text-red">{error}</div>}

      <Tabs value={section} onValueChange={changeSection} className="space-y-4">
        <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-md border border-border bg-transparent p-1">
          <TabsTrigger value="general" className="gap-2">
            <Settings className="h-3.5 w-3.5" />
            {t('settings.sectionGeneral')}
          </TabsTrigger>
          <TabsTrigger value="llm" className="gap-2">
            <Bot className="h-3.5 w-3.5" />
            {t('settings.sectionLlm')}
          </TabsTrigger>
          <TabsTrigger value="database" className="gap-2">
            <Database className="h-3.5 w-3.5" />
            {t('settings.sectionDatabase')}
          </TabsTrigger>
          <TabsTrigger value="system" className="gap-2">
            <Activity className="h-3.5 w-3.5" />
            {t('settings.sectionSystem')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-0">
          <div className="grid gap-4 xl:grid-cols-2">
            <AppearanceSettings />

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

            <Card className="xl:col-span-2">
              <CardHeader className="flex-row items-center gap-2">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm">{t('settings.advancedAccess')}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-x-6 gap-y-2 lg:grid-cols-3">
                <DependencyRow label={t('settings.polymarketAccount')} status={features?.polymarketAccountEnabled ? t('settings.enabled') : t('settings.disabled')} detail={t('settings.polymarketAccountHint')} />
                <DependencyRow label={t('settings.marketOrders')} status={features?.marketOrdersEnabled ? t('settings.enabled') : t('settings.disabled')} detail={t('settings.marketOrdersHint')} />
                <DependencyRow label={t('settings.liveTrading')} status={features?.liveTradingEnabled ? t('settings.enabled') : t('settings.disabled')} detail={t('settings.liveTradingHint')} />
                {features?.polymarketAccountEnabled ? (
                  <Link to="/polymarket/account" className="mt-2 inline-flex items-center gap-2 text-sm text-primary hover:underline">
                    <Wallet className="h-4 w-4" />
                    {t('nav.polymarketAccount')}
                  </Link>
                ) : (
                  <div className="mt-2 text-xs text-muted-foreground lg:col-span-3">{t('settings.enablePolymarketAccount')}</div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="llm" className="mt-0">
          <AiConfigPage embedded />
        </TabsContent>

        <TabsContent value="database" className="mt-0">
          <DatabasePage embedded />
        </TabsContent>

        <TabsContent value="system" className="mt-0 space-y-4">
          <EsportsDataSourcesPanel />
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
                  <div className="grid gap-x-6 lg:grid-cols-2">
                    {dependencyRows.map((row) => (
                      <DependencyRow key={`${row.label}-${row.status}`} {...row} />
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          <BackgroundTasksPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
