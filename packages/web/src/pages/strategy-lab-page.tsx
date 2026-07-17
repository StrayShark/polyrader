import { useEffect, useState } from 'react';
import { FlaskConical, Activity, TrendingUp, BarChart3, Settings2, Save, RefreshCw, GitCompare } from 'lucide-react';
import { useI18n } from '../hooks/use-i18n';
import { useMarketStore } from '../stores/market-store';
import { useStrategyProfileStore } from '../stores/strategy-profile-store';
import { api } from '../utils/api';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Badge,
  Button,
  Input,
} from '@/components/ui';
import type { SignalBacktestSummary, SignalComparison, SignalTuningConfig, SignalSourceKind } from '@polyrader/core';

interface SignalStats {
  accuracy: number;
  brierScore: number;
  totalPredictions: number;
}

const SOURCE_WEIGHT_KEYS: SignalSourceKind[] = [
  'prediction_model',
  'market_behavior',
  'ai_debate',
  'capital_flow',
  'whale_flow',
  'smart_wallet',
  'mean_reversion',
  'community',
  'hltv_odds',
  'polymarket',
];

const BEHAVIOR_WEIGHT_KEYS = [
  'capitalWithOrderBook',
  'capitalWithoutOrderBook',
  'reversionWithHistory',
  'reversionWithoutHistory',
  'whaleWithFlow',
  'whaleWithoutFlow',
  'market',
] as const;

const RECOMMENDATION_KEYS = ['minEdge', 'bubbleMinEdge', 'minConfidence', 'bubbleRiskPenalty'] as const;

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatSignedPct(value: number): string {
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
}

function formatSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    polymarket: 'Polymarket',
    prediction_model: 'Model',
    hltv_odds: 'HLTV Odds',
    community: 'Community',
    capital_flow: 'Capital Flow',
    whale_flow: 'Whale Flow',
    smart_wallet: 'Smart Wallet',
    mean_reversion: 'Mean Reversion',
    market_behavior: 'Behavior Finance',
    ai_debate: 'AI Debate',
    final: 'Final',
  };
  return labels[source] ?? source.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function ProbabilityBar({ label, value, color }: { label: string; value: number; color?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums font-medium">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted/60 overflow-hidden">
        <div
          className={`h-full rounded-full ${color ?? 'bg-primary'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ProbabilityLab() {
  const { t } = useI18n();
  const { markets, fetchMarkets, isLoading: marketsLoading } = useMarketStore();
  const [selectedMarketId, setSelectedMarketId] = useState<string>('');
  const [signal, setSignal] = useState<SignalComparison | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchMarkets(50, 0);
  }, [fetchMarkets]);

  useEffect(() => {
    if (!selectedMarketId) {
      setSignal(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    api.get<{ data: SignalComparison | null }>(`/signals/${encodeURIComponent(selectedMarketId)}`)
      .then((res) => setSignal(res.data))
      .catch((err) => setError((err as Error).message))
      .finally(() => setIsLoading(false));
  }, [selectedMarketId]);

  const selectedMarket = markets.find((m) => m.conditionId === selectedMarketId);

  const behaviorProb = signal?.marketBehavior?.probability
    ?? signal?.signals.find((s) => s.source === 'market_behavior')?.probability;
  const aiDebateProb = signal?.aiDebate?.calibratedProbability
    ?? signal?.signals.find((s) => s.source === 'ai_debate')?.probability;
  const communityProb = signal?.signals.find((s) => s.source === 'community')?.probability;
  const hltvProb = signal?.signals.find((s) => s.source === 'hltv_odds')?.probability;
  const smartWalletProb = signal?.signals.find((s) => s.source === 'smart_wallet')?.probability;
  const finalProb = signal?.finalProb ?? signal?.predictedProb;
  const edge = signal?.edge ?? (finalProb !== undefined ? finalProb - (signal?.polymarketProb ?? 0) : 0);
  const recommendation = signal?.recommendation ?? (edge > 0.05 ? 'buy_yes' : edge < -0.05 ? 'buy_no' : 'skip');

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <label className="mb-2 block text-sm font-medium">{t('strategy.selectMarket')}</label>
        <select
          value={selectedMarketId}
          onChange={(e) => setSelectedMarketId(e.target.value)}
          disabled={marketsLoading}
          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary md:w-96"
        >
          <option value="">{t('strategy.selectMarketPlaceholder')}</option>
          {markets.map((m) => (
            <option key={m.conditionId} value={m.conditionId}>
              {m.question || m.slug || m.conditionId}
            </option>
          ))}
        </select>
      </Card>

      {isLoading && (
        <div className="py-10 text-center text-sm text-muted-foreground">{t('common.loading')}</div>
      )}
      {error && (
        <div className="rounded-lg border border-red/20 bg-red/5 p-4 text-sm text-red">{error}</div>
      )}

      {!isLoading && !selectedMarketId && (
        <div className="py-10 text-center text-sm text-muted-foreground">{t('strategy.labEmpty')}</div>
      )}

      {!isLoading && signal && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="p-4 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm font-medium">{selectedMarket?.question || signal.marketId}</div>
              <div className="flex items-center gap-2">
                <Badge variant={recommendation === 'buy_yes' ? 'green' : recommendation === 'buy_no' ? 'red' : 'secondary'}>
                  {recommendation === 'buy_yes' ? t('signals.buyYes') : recommendation === 'buy_no' ? t('signals.buyNo') : t('signals.skip')}
                </Badge>
                <span className={`text-xs tabular-nums ${edge > 0 ? 'text-green' : edge < 0 ? 'text-red' : ''}`}>
                  {formatSignedPct(edge)}
                </span>
              </div>
            </div>
            <div className="space-y-4">
              <ProbabilityBar label={t('signals.communityPrediction')} value={communityProb ?? 0} color="bg-purple" />
              <ProbabilityBar label={t('signals.aiDebate')} value={aiDebateProb ?? 0} color="bg-cyan" />
              <ProbabilityBar label={t('signals.behaviorPrediction')} value={behaviorProb ?? 0} color="bg-orange" />
              <ProbabilityBar label={formatSourceLabel('smart_wallet')} value={smartWalletProb ?? 0} color="bg-blue" />
              <ProbabilityBar label={formatSourceLabel('hltv_odds')} value={hltvProb ?? 0} color="bg-yellow" />
              <ProbabilityBar label={t('common.modelPrediction')} value={signal.predictedProb} color="bg-green" />
              <ProbabilityBar label="Polymarket" value={signal.polymarketProb} color="bg-primary" />
              {finalProb !== undefined && (
                <div className="border-t pt-3">
                  <ProbabilityBar label={t('signals.finalProbability')} value={finalProb} color="bg-pink" />
                </div>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <div className="mb-3 text-sm font-medium">{t('strategy.signalSources')}</div>
            <div className="space-y-2">
              {signal.signals.map((s) => (
                <div key={s.source} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{formatSourceLabel(s.source)}</span>
                  <span className="tabular-nums">{formatPct(s.probability)} · conf {formatPct(s.confidence)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function SignalWeights() {
  const { t } = useI18n();
  const [stats, setStats] = useState<SignalStats>({ accuracy: 0, brierScore: 0, totalPredictions: 0 });
  const [backtest, setBacktest] = useState<SignalBacktestSummary | null>(null);
  const [tuningConfig, setTuningConfig] = useState<SignalTuningConfig | null>(null);
  const [configDraft, setConfigDraft] = useState<SignalTuningConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileName, setProfileName] = useState('');
  const [profileDescription, setProfileDescription] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState('');

  const {
    profiles,
    activeProfile,
    fetchProfiles,
    saveFromTuningConfig,
    activateProfile,
    isLoading: profilesLoading,
  } = useStrategyProfileStore();

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [statsRes, backtestRes, configRes] = await Promise.all([
        api.get<{ data: SignalStats }>('/signals/stats'),
        api.get<{ data: SignalBacktestSummary }>('/signals/backtest?limit=1000'),
        api.get<{ data: SignalTuningConfig }>('/signals/config'),
      ]);
      setStats(statsRes.data ?? { accuracy: 0, brierScore: 0, totalPredictions: 0 });
      setBacktest(backtestRes.data ?? null);
      setTuningConfig(configRes.data ?? null);
      setConfigDraft(configRes.data ?? null);
    } catch (err) {
      setError((err as Error).message);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    void fetchData();
    void fetchProfiles();
  }, [fetchProfiles]);

  const saveConfig = async () => {
    if (!configDraft) return;
    setIsSaving(true);
    try {
      const res = await api.put<{ data: SignalTuningConfig }>('/signals/config', configDraft);
      setTuningConfig(res.data);
      setConfigDraft(res.data);
      const backtestRes = await api.get<{ data: SignalBacktestSummary }>('/signals/backtest?limit=1000');
      setBacktest(backtestRes.data ?? null);
    } catch (err) {
      setError((err as Error).message);
    }
    setIsSaving(false);
  };

  const applySuggestions = async () => {
    setIsApplying(true);
    try {
      const res = await api.post<{ data: { config: SignalTuningConfig } }>('/signals/config/apply-suggestions', {
        minSampleSize: 10,
        maxStepRatio: 0.5,
      });
      setTuningConfig(res.data.config);
      setConfigDraft(res.data.config);
      const backtestRes = await api.get<{ data: SignalBacktestSummary }>('/signals/backtest?limit=1000');
      setBacktest(backtestRes.data ?? null);
    } catch (err) {
      setError((err as Error).message);
    }
    setIsApplying(false);
  };

  const updateSourceWeight = (key: SignalSourceKind, value: string) => {
    const numeric = Number(value);
    setConfigDraft((current) =>
      current
        ? {
            ...current,
            sourceWeights: { ...current.sourceWeights, [key]: Number.isFinite(numeric) ? numeric : 0 },
          }
        : current,
    );
  };

  const updateBehaviorWeight = (key: typeof BEHAVIOR_WEIGHT_KEYS[number], value: string) => {
    const numeric = Number(value);
    setConfigDraft((current) =>
      current
        ? {
            ...current,
            behaviorWeights: { ...current.behaviorWeights, [key]: Number.isFinite(numeric) ? numeric : 0 },
          }
        : current,
    );
  };

  const updateRecommendation = (key: typeof RECOMMENDATION_KEYS[number], value: string) => {
    const numeric = Number(value);
    setConfigDraft((current) =>
      current
        ? {
            ...current,
            recommendation: { ...current.recommendation, [key]: Number.isFinite(numeric) ? numeric : 0 },
          }
        : current,
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3">
        <div className="text-sm font-medium">{t('strategy.profilesTitle')}</div>
        <div className="text-xs text-muted-foreground">{t('strategy.activeProfileHint')}</div>
        <div className="flex flex-wrap items-end gap-2">
          <select
            value={selectedProfileId}
            onChange={(e) => {
              const id = e.target.value;
              setSelectedProfileId(id);
              const profile = profiles.find((p) => p.id === id);
              if (profile) {
                setConfigDraft({
                  sourceWeights: profile.sourceWeights,
                  behaviorWeights: profile.behaviorWeights,
                  recommendation: profile.recommendation,
                });
              }
            }}
            disabled={profilesLoading}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="">{t('strategy.selectProfile')}</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.isActive ? `(${t('strategy.active')})` : ''}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            disabled={!selectedProfileId || profilesLoading}
            onClick={async () => {
              if (!selectedProfileId) return;
              const activated = await activateProfile(selectedProfileId);
              if (activated) {
                await fetchData();
              }
            }}
          >
            {t('strategy.activateProfile')}
          </Button>
          {activeProfile && (
            <Badge variant="secondary" className="text-[10px]">
              {t('strategy.active')}: {activeProfile.name}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <input
            type="text"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder={t('strategy.profileNamePlaceholder')}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <input
            type="text"
            value={profileDescription}
            onChange={(e) => setProfileDescription(e.target.value)}
            placeholder={t('strategy.profileDescPlaceholder')}
            className="h-9 flex-1 min-w-[160px] rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <Button
            size="sm"
            disabled={!profileName || !configDraft || isSaving}
            onClick={async () => {
              if (!configDraft) return;
              const saved = await saveFromTuningConfig(profileName, profileDescription || undefined, configDraft, backtest ?? undefined);
              if (saved) {
                setProfileName('');
                setProfileDescription('');
                setSelectedProfileId(saved.id);
              }
            }}
          >
            <Save className="mr-1 h-3.5 w-3.5" />
            {t('strategy.saveProfile')}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{t('strategy.weightsSubtitle')}</div>
        <Button variant="outline" size="sm" onClick={() => fetchData()} disabled={isLoading}>
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red/20 bg-red/5 p-4 text-sm text-red">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            <span className="text-xs">{t('signals.modelAccuracy')}</span>
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{formatPct(stats.accuracy)}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Activity className="h-4 w-4" />
            <span className="text-xs">Brier Score</span>
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{stats.brierScore.toFixed(3)}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <GitCompare className="h-4 w-4" />
            <span className="text-xs">{t('signals.totalPredictions')}</span>
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{stats.totalPredictions}</div>
        </Card>
      </div>

      {backtest && (
        <Card>
          <CardHeader className="border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-sm">{t('signals.backtestTitle')}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-4 py-2 text-xs">{t('signals.source')}</TableHead>
                    <TableHead className="px-4 py-2 text-right text-xs">{t('signals.accuracy')}</TableHead>
                    <TableHead className="px-4 py-2 text-right text-xs">Brier</TableHead>
                    <TableHead className="px-4 py-2 text-right text-xs">ROI</TableHead>
                    <TableHead className="px-4 py-2 text-right text-xs">{t('signals.weight')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backtest.metrics.map((metric) => (
                    <TableRow key={metric.source}>
                      <TableCell className="px-4 py-2 text-xs font-medium">{metric.label}</TableCell>
                      <TableCell className="px-4 py-2 text-right text-xs tabular-nums">
                        {metric.sampleSize > 0 ? formatPct(metric.accuracy) : '--'}
                      </TableCell>
                      <TableCell className="px-4 py-2 text-right text-xs tabular-nums">
                        {metric.sampleSize > 0 ? metric.brierScore.toFixed(3) : '--'}
                      </TableCell>
                      <TableCell className={`px-4 py-2 text-right text-xs tabular-nums ${metric.roi > 0 ? 'text-green' : metric.roi < 0 ? 'text-red' : ''}`}>
                        {metric.bets > 0 ? formatSignedPct(metric.roi) : '--'}
                      </TableCell>
                      <TableCell className="px-4 py-2 text-right text-xs tabular-nums">
                        {metric.currentWeight !== undefined ? `${metric.currentWeight.toFixed(2)} → ${(metric.suggestedWeight ?? metric.currentWeight).toFixed(2)}` : '--'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {configDraft && (
        <Card className="p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <div className="text-sm font-medium">{t('signals.tuningConfig')}</div>
              {tuningConfig?.updatedAt && (
                <span className="text-xs text-muted-foreground">{new Date(tuningConfig.updatedAt).toLocaleString()}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={applySuggestions} disabled={isApplying}>
                <TrendingUp className="mr-1 h-3.5 w-3.5" />
                {t('signals.applySuggestedWeights')}
              </Button>
              <Button size="sm" onClick={saveConfig} disabled={isSaving}>
                <Save className="mr-1 h-3.5 w-3.5" />
                {t('common.save')}
              </Button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div>
              <div className="mb-2 text-xs font-medium text-muted-foreground">{t('signals.aggregationWeights')}</div>
              <div className="grid grid-cols-2 gap-2">
                {SOURCE_WEIGHT_KEYS.map((key) => (
                  <label key={key} className="grid gap-1 text-xs">
                    <span className="truncate text-muted-foreground">{formatSourceLabel(key)}</span>
                    <Input
                      type="number"
                      min="0"
                      max="5"
                      step="0.05"
                      value={configDraft.sourceWeights[key]}
                      onChange={(e) => updateSourceWeight(key, e.target.value)}
                      className="h-8 text-xs"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-medium text-muted-foreground">{t('signals.behaviorWeights')}</div>
              <div className="grid grid-cols-2 gap-2">
                {BEHAVIOR_WEIGHT_KEYS.map((key) => (
                  <label key={key} className="grid gap-1 text-xs">
                    <span className="truncate text-muted-foreground">{formatSourceLabel(key)}</span>
                    <Input
                      type="number"
                      min="0"
                      max="5"
                      step="0.05"
                      value={configDraft.behaviorWeights[key]}
                      onChange={(e) => updateBehaviorWeight(key, e.target.value)}
                      className="h-8 text-xs"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-medium text-muted-foreground">{t('signals.recommendationRules')}</div>
              <div className="grid grid-cols-2 gap-2">
                {RECOMMENDATION_KEYS.map((key) => (
                  <label key={key} className="grid gap-1 text-xs">
                    <span className="truncate text-muted-foreground">{formatSourceLabel(key)}</span>
                    <Input
                      type="number"
                      min="0"
                      max={key === 'bubbleRiskPenalty' ? '5' : '1'}
                      step="0.01"
                      value={configDraft.recommendation[key]}
                      onChange={(e) => updateRecommendation(key, e.target.value)}
                      className="h-8 text-xs"
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

export function StrategyLabPage() {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('strategy.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('strategy.subtitle')}</p>
        </div>
      </div>

      <Tabs defaultValue="lab">
        <TabsList>
          <TabsTrigger value="lab">{t('strategy.probabilityLab')}</TabsTrigger>
          <TabsTrigger value="weights">{t('strategy.signalWeights')}</TabsTrigger>
        </TabsList>
        <TabsContent value="lab" className="mt-4">
          <ProbabilityLab />
        </TabsContent>
        <TabsContent value="weights" className="mt-4">
          <SignalWeights />
        </TabsContent>
      </Tabs>
    </div>
  );
}
