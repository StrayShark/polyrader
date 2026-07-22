import { Wallet, TrendingUp, Activity, Target, AlertTriangle, Trophy, TrendingDown, Shield, Plus, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useI18n } from '../hooks/use-i18n';
import { Card, CardHeader, CardTitle, Tabs, TabsList, TabsTrigger, Badge, Button, Input, Skeleton, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui';
import { useBankrollStore } from '../stores/bankroll-store';
import { useTrainingSessionStore } from '../stores/training-session-store';
import { RiskMeter } from '../components/RiskMeter';
import { cn } from '../utils/cn';
import type { EquityCurveGranularity, SimBet, TrainingSession, TrainingGoalType, TrainingSessionStatus } from '@polyrader/core/browser';

const GRANULARITIES: EquityCurveGranularity[] = ['day', 'week', 'month', 'all'];

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function BetStatusBadge({ status }: { status: SimBet['status'] }) {
  const variant = status === 'open' ? 'yellow' : status === 'settled' ? 'green' : 'secondary';
  return <Badge variant={variant as never}>{status}</Badge>;
}

export function BankrollPage({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const { summary, granularity, isLoading, error, fetchSummary, setGranularity } = useBankrollStore();
  const { activeSessions, fetchSessions, createSession, updateSession, deleteSession, refreshProgress } = useTrainingSessionStore();
  const [activeTab, setActiveTab] = useState<'open' | 'settled' | 'voided'>('open');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<TrainingSession | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState<TrainingGoalType>('consecutive_reasoning');
  const [formCount, setFormCount] = useState('');
  const [formMaxRiskPct, setFormMaxRiskPct] = useState('');
  const [formMinEdge, setFormMinEdge] = useState('');
  const [formMinConfidence, setFormMinConfidence] = useState('');
  const [formConsecutive, setFormConsecutive] = useState(false);
  const [formStatus, setFormStatus] = useState<TrainingSessionStatus>('active');

  useEffect(() => {
    void fetchSummary();
    void fetchSessions();
  }, [fetchSummary, fetchSessions]);

  if (error && !summary) {
    return (
      <div className="space-y-4">
        {!embedded && (
          <div className="flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">{t('bankroll.title')}</h1>
          </div>
        )}
        <div className="rounded-lg border border-red/20 bg-red/5 p-4 text-sm text-red">
          {error}
          <Button variant="outline" size="sm" className="ml-3" onClick={() => fetchSummary()}>
            {t('common.retry')}
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading || !summary) {
    return (
      <div className="space-y-4">
        {!embedded && (
          <div className="flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">{t('bankroll.title')}</h1>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-52 w-full" />
      </div>
    );
  }

  const { account, todayPnl, openExposure, equityCurve, openBets, settledBets, voidedBets, riskMetrics } = summary;
  const betsToShow = activeTab === 'open' ? openBets : activeTab === 'settled' ? settledBets : (voidedBets ?? []);

  function resetForm() {
    setFormTitle('');
    setFormType('consecutive_reasoning');
    setFormCount('');
    setFormMaxRiskPct('');
    setFormMinEdge('');
    setFormMinConfidence('');
    setFormConsecutive(false);
    setFormStatus('active');
    setEditingSession(null);
  }

  function openCreate() {
    resetForm();
    setDialogOpen(true);
  }

  function openEdit(session: TrainingSession) {
    setEditingSession(session);
    setFormTitle(session.title);
    setFormType(session.type);
    setFormCount(session.target.count?.toString() ?? '');
    setFormMaxRiskPct(session.target.maxRiskPct?.toString() ?? '');
    setFormMinEdge(session.target.minEdge?.toString() ?? '');
    setFormMinConfidence(session.target.minConfidence?.toString() ?? '');
    setFormConsecutive(session.target.consecutive ?? false);
    setFormStatus(session.status);
    setDialogOpen(true);
  }

  function buildTarget(): { type: TrainingGoalType; target: { count?: number; maxRiskPct?: number; minEdge?: number; minConfidence?: number; consecutive?: boolean } } {
    const target: { count?: number; maxRiskPct?: number; minEdge?: number; minConfidence?: number; consecutive?: boolean } = {};
    switch (formType) {
      case 'consecutive_reasoning':
        target.count = Number(formCount) || 0;
        target.consecutive = formConsecutive;
        break;
      case 'single_risk_limit':
        target.maxRiskPct = Number(formMaxRiskPct) || 0;
        break;
      case 'high_confidence_bets':
        target.count = Number(formCount) || 0;
        target.minEdge = Number(formMinEdge) || 0;
        target.minConfidence = Number(formMinConfidence) || 0;
        break;
    }
    return { type: formType, target };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { type, target } = buildTarget();
    if (editingSession) {
      await updateSession(editingSession.id, { title: formTitle, target, status: formStatus });
    } else {
      await createSession({ title: formTitle, type, target });
    }
    await fetchSessions();
    setDialogOpen(false);
    resetForm();
  }

  async function handleDelete(session: TrainingSession) {
    if (!window.confirm(t('bankroll.confirmDeleteTrainingGoal'))) return;
    await deleteSession(session.id);
    await fetchSessions();
  }

  const isFormValid = formTitle.trim().length > 0;

  return (
    <div className="space-y-4">
      {!embedded && (
        <div className="flex items-center gap-2">
          <Wallet className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">{t('bankroll.title')}</h1>
        </div>
      )}

      {/* Balance cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-normal text-muted-foreground">{t('bankroll.initial')}</CardTitle>
            <div className="text-2xl font-semibold tabular-nums">{formatCurrency(account.initialBankroll)}</div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-normal text-muted-foreground">{t('bankroll.total')}</CardTitle>
            <div className="text-2xl font-semibold tabular-nums">{formatCurrency(account.currentBankroll)}</div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-normal text-muted-foreground">{t('bankroll.available')}</CardTitle>
            <div className="text-2xl font-semibold tabular-nums">{formatCurrency(account.availableBankroll)}</div>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-normal text-muted-foreground">{t('bankroll.todayPnl')}</CardTitle>
            <div className={cn('text-2xl font-semibold tabular-nums', todayPnl >= 0 ? 'text-green' : 'text-red')}>
              {todayPnl >= 0 ? '+' : ''}{formatCurrency(todayPnl)}
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* Risk metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex-row items-center gap-2 pb-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-xs font-normal text-muted-foreground">{t('bankroll.openExposure')}</CardTitle>
          </CardHeader>
          <div className="px-6 pb-4">
            <div className="text-2xl font-semibold tabular-nums">{formatCurrency(openExposure)}</div>
          </div>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center gap-2 pb-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-xs font-normal text-muted-foreground">{t('risk.title')}</CardTitle>
          </CardHeader>
          <div className="px-6 pb-4">
            <RiskMeter
              stake={openBets.length > 0 ? Math.max(...openBets.map((b) => b.stake)) : 0}
              bankroll={account.currentBankroll}
              openExposure={openExposure}
              showLabels={false}
            />
          </div>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center gap-2 pb-2">
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-xs font-normal text-muted-foreground">{t('bankroll.maxDrawdown')}</CardTitle>
          </CardHeader>
          <div className="px-6 pb-4">
            <div className="text-2xl font-semibold tabular-nums text-red">
              -{formatCurrency(riskMetrics.maxDrawdown)} ({formatPct(riskMetrics.maxDrawdownPct)})
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center gap-2 pb-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-xs font-normal text-muted-foreground">{t('bankroll.consecutiveLosses')}</CardTitle>
          </CardHeader>
          <div className="px-6 pb-4">
            <div className="text-2xl font-semibold tabular-nums">{riskMetrics.consecutiveLosses}</div>
          </div>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center gap-2 pb-2">
            <Target className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-xs font-normal text-muted-foreground">{t('bankroll.winRate')}</CardTitle>
          </CardHeader>
          <div className="px-6 pb-4">
            <div className="text-2xl font-semibold tabular-nums">{formatPct(riskMetrics.winRate)}</div>
            <div className="text-xs text-muted-foreground">{t('bankroll.totalBets', { count: riskMetrics.totalBets })}</div>
          </div>
        </Card>
      </div>

      {/* Equity curve */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">{t('bankroll.equityCurve')}</CardTitle>
          </div>
          <Tabs value={granularity} onValueChange={(v) => setGranularity(v as EquityCurveGranularity)}>
            <TabsList>
              {GRANULARITIES.map((g) => (
                <TabsTrigger key={g} value={g} className="text-xs">
                  {t(`bankroll.granularity_${g}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardHeader>
        <div className="p-6 text-sm text-muted-foreground">
          {equityCurve.length === 0 ? (
            t('bankroll.noEquity')
          ) : (
            <div className="space-y-2">
              <div className="flex items-end justify-between gap-2">
                {equityCurve.map((p) => (
                  <div key={p.timestamp} className="flex flex-col items-center gap-1">
                    <div
                      className={cn(
                        'w-2 rounded-sm',
                        p.cumulativePnl >= 0 ? 'bg-green' : 'bg-red',
                      )}
                      style={{ height: `${Math.min(120, Math.max(4, Math.abs(p.cumulativePnl) / 2))}px` }}
                    />
                    <span className="text-[10px] tabular-nums">{p.timestamp.slice(5)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-xs">
                <span>{t('bankroll.dataPoints', { count: equityCurve.length })}</span>
                <span className={cn(equityCurve.at(-1)?.cumulativePnl ?? 0 >= 0 ? 'text-green' : 'text-red')}>
                  {formatCurrency(equityCurve.at(-1)?.cumulativePnl ?? 0)}
                </span>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Training sessions */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium">{t('bankroll.trainingGoals')}</h3>
          </div>
          <Button size="sm" variant="outline" onClick={openCreate}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t('bankroll.newTrainingGoal')}
          </Button>
        </div>
        {activeSessions.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">{t('bankroll.noTrainingGoals')}</div>
        ) : (
          <div className="space-y-3">
            {activeSessions.map((session) => (
              <div key={session.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{session.title}</span>
                  <div className="flex items-center gap-1">
                    <span className="tabular-nums text-muted-foreground">{(session.progress * 100).toFixed(0)}%</span>
                    <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => openEdit(session)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => handleDelete(session)}>
                      <Trash2 className="h-3 w-3 text-red-500" />
                    </Button>
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.min(session.progress * 100, 100)}%` }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => refreshProgress(session.id)}>
                    {t('bankroll.refreshProgress')}
                  </Button>
                  {session.progress >= 1 && (
                    <Badge variant="green" className="text-[10px]">{t('bankroll.completed')}</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSession ? t('bankroll.editTrainingGoal') : t('bankroll.newTrainingGoal')}</DialogTitle>
            <DialogDescription>{t('bankroll.trainingGoalDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium">{t('trainingGoal.title')}</label>
              <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder={t('trainingGoal.title')} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t('trainingGoal.type')}</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as TrainingGoalType)}
                disabled={!!editingSession}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
              >
                <option value="consecutive_reasoning">{t('trainingGoal.type_consecutive_reasoning')}</option>
                <option value="single_risk_limit">{t('trainingGoal.type_single_risk_limit')}</option>
                <option value="high_confidence_bets">{t('trainingGoal.type_high_confidence_bets')}</option>
              </select>
            </div>
            {formType === 'consecutive_reasoning' && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-medium">{t('trainingGoal.count')}</label>
                  <Input type="number" min={1} value={formCount} onChange={(e) => setFormCount(e.target.value)} />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="consecutive"
                    type="checkbox"
                    checked={formConsecutive}
                    onChange={(e) => setFormConsecutive(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  <label htmlFor="consecutive" className="text-xs">{t('trainingGoal.consecutive')}</label>
                </div>
              </>
            )}
            {formType === 'single_risk_limit' && (
              <div className="space-y-1">
                <label className="text-xs font-medium">{t('trainingGoal.maxRiskPct')}</label>
                <Input type="number" min={0} step={0.001} value={formMaxRiskPct} onChange={(e) => setFormMaxRiskPct(e.target.value)} />
              </div>
            )}
            {formType === 'high_confidence_bets' && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-medium">{t('trainingGoal.count')}</label>
                  <Input type="number" min={1} value={formCount} onChange={(e) => setFormCount(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">{t('trainingGoal.minEdge')}</label>
                  <Input type="number" min={0} step={0.001} value={formMinEdge} onChange={(e) => setFormMinEdge(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">{t('trainingGoal.minConfidence')}</label>
                  <Input type="number" min={0} step={0.001} value={formMinConfidence} onChange={(e) => setFormMinConfidence(e.target.value)} />
                </div>
              </>
            )}
            {editingSession && (
              <div className="space-y-1">
                <label className="text-xs font-medium">{t('trainingGoal.status')}</label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as TrainingSessionStatus)}
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <option value="active">{t('trainingGoal.status_active')}</option>
                  <option value="completed">{t('trainingGoal.status_completed')}</option>
                  <option value="abandoned">{t('trainingGoal.status_abandoned')}</option>
                </select>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={!isFormValid}>
                {editingSession ? t('common.save') : t('common.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bets tables */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">{t('bankroll.bets')}</CardTitle>
          </div>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'open' | 'settled' | 'voided')}>
            <TabsList>
              <TabsTrigger value="open" className="text-xs">
                {t('bankroll.openBets')} ({openBets.length})
              </TabsTrigger>
              <TabsTrigger value="settled" className="text-xs">
                {t('bankroll.settledBets')} ({settledBets.length})
              </TabsTrigger>
              <TabsTrigger value="voided" className="text-xs">
                {t('bankroll.voidedBets')} ({(voidedBets ?? []).length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <div className="p-0">
          {betsToShow.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">{t('bankroll.noBets')}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4 py-2 text-xs">{t('common.time')}</TableHead>
                  <TableHead className="px-4 py-2 text-xs">{t('common.market')}</TableHead>
                  <TableHead className="px-4 py-2 text-xs">{t('slip.stake')}</TableHead>
                  <TableHead className="px-4 py-2 text-xs">{t('slip.totalOdds')}</TableHead>
                  <TableHead className="px-4 py-2 text-xs">{t('common.status')}</TableHead>
                  <TableHead className="px-4 py-2 text-xs text-right">PnL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {betsToShow.map((bet) => (
                  <TableRow key={bet.id}>
                    <TableCell className="px-4 py-2 text-xs tabular-nums">
                      {new Date(bet.placedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="px-4 py-2 text-xs">
                      <div className="max-w-[200px] truncate">{bet.matchId ?? bet.marketId ?? '-'}</div>
                    </TableCell>
                    <TableCell className="px-4 py-2 text-xs tabular-nums">{formatCurrency(bet.stake)}</TableCell>
                    <TableCell className="px-4 py-2 text-xs tabular-nums">{bet.totalOdds.toFixed(2)}</TableCell>
                    <TableCell className="px-4 py-2 text-xs">
                      <BetStatusBadge status={bet.status} />
                    </TableCell>
                    <TableCell className={cn('px-4 py-2 text-xs tabular-nums text-right', bet.pnl >= 0 ? 'text-green' : 'text-red')}>
                      {bet.pnl >= 0 ? '+' : ''}{formatCurrency(bet.pnl)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}
