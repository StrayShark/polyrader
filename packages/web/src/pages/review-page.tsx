import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BarChart3, Tag, FileText, Filter, X, Lightbulb } from 'lucide-react';
import { useI18n } from '../hooks/use-i18n';
import {
  Card,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Skeleton,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Textarea,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui';
import { useReviewStore } from '../stores/review-store';
import { useDebounce } from '../hooks/use-debounce';
import { cn } from '../utils/cn';
import type { ReviewDetail, ReviewListFilters } from '@polyrader/core/browser';
import { ReviewTimeline } from '../components/ReviewTimeline';
import { BetResultAnalysisPanel } from '../components/BetResultAnalysisPanel';

const ERROR_TAGS = [
  'overrated_favorite',
  'ignored_map_pool',
  'chased_odds',
  'overtrusted_ai',
  'oversized_position',
  'missing_late_info',
];

const RESULT_OPTIONS = ['all', 'won', 'lost'] as const;
const TYPE_OPTIONS = ['all', 'single', 'parlay'] as const;
const FORMAT_OPTIONS = ['all', 'BO1', 'BO3', 'BO5'] as const;
const TIER_OPTIONS = ['all', 'S', 'A', 'B'] as const;
const TIMING_OPTIONS = ['all', 'pre', 'live'] as const;

interface ReviewFilters {
  result: (typeof RESULT_OPTIONS)[number];
  betType: (typeof TYPE_OPTIONS)[number];
  format: (typeof FORMAT_OPTIONS)[number];
  tier: (typeof TIER_OPTIONS)[number];
  timing: (typeof TIMING_OPTIONS)[number];
  fromDate: string;
  toDate: string;
  hasNote: 'all' | 'yes' | 'no';
  selectedTags: string[];
}

const DEFAULT_FILTERS: ReviewFilters = {
  result: 'all',
  betType: 'all',
  format: 'all',
  tier: 'all',
  timing: 'all',
  fromDate: '',
  toDate: '',
  hasNote: 'all',
  selectedTags: [],
};

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function getTagLabel(tag: string, t: (key: string) => string): string {
  return t(`review.errorTag_${tag}`);
}

function toListFilters(filters: ReviewFilters): ReviewListFilters {
  return {
    result: filters.result,
    betType: filters.betType,
    format: filters.format,
    tier: filters.tier,
    timing: filters.timing,
    fromDate: filters.fromDate || undefined,
    toDate: filters.toDate || undefined,
    hasNote: filters.hasNote,
    tags: filters.selectedTags,
  };
}

function ReviewDetailDialog({
  detail,
  open,
  onOpenChange,
}: {
  detail: ReviewDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const { createOrUpdateReview, isLoading } = useReviewStore();
  const [note, setNote] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [closingOdds, setClosingOdds] = useState('');

  useEffect(() => {
    if (detail) {
      setNote(detail.review?.note ?? '');
      setSelectedTags(detail.review?.errorTags ?? []);
      setClosingOdds(detail.closingOdds?.toFixed(2) ?? '');
    }
  }, [detail]);

  if (!detail) return null;

  const { bet, snapshots, brierScore, closingLineValue, placementOdds, matchSnapshot } = detail;

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handleSave = async () => {
    await createOrUpdateReview(bet.id, {
      errorTags: selectedTags,
      note: note || undefined,
      closingOdds: closingOdds ? Number(closingOdds) : undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{t('review.detailTitle')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Bet summary */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-3">
              <div className="text-xs text-muted-foreground">{t('slip.stake')}</div>
              <div className="text-lg font-semibold tabular-nums">{formatCurrency(bet.stake)}</div>
            </Card>
            <Card className="p-3">
              <div className="text-xs text-muted-foreground">{t('slip.totalOdds')}</div>
              <div className="text-lg font-semibold tabular-nums">{bet.totalOdds.toFixed(2)}</div>
            </Card>
            <Card className="p-3">
              <div className="text-xs text-muted-foreground">{t('review.result')}</div>
              <div className={cn('text-lg font-semibold', bet.pnl >= 0 ? 'text-green' : 'text-red')}>
                {bet.result ?? '-'} ({formatCurrency(bet.pnl)})
              </div>
            </Card>
            <Card className="p-3">
              <div className="text-xs text-muted-foreground">{t('review.settledAt')}</div>
              <div className="text-lg font-semibold tabular-nums">
                {bet.settledAt ? new Date(bet.settledAt).toLocaleDateString() : '-'}
              </div>
            </Card>
          </div>

          {/* Match meta */}
          {(bet.matchFormat || bet.matchTier) && (
            <div className="flex flex-wrap gap-2">
              {bet.matchFormat && (
                <Badge variant="outline" className="text-[10px]">{bet.matchFormat}</Badge>
              )}
              {bet.matchTier && (
                <Badge variant="outline" className="text-[10px]">Tier {bet.matchTier}</Badge>
              )}
            </div>
          )}

          {/* Metrics */}
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-md border border-border p-3 text-center">
              <div className="text-xs text-muted-foreground">{t('review.brierScore')}</div>
              <div className="text-lg font-semibold tabular-nums">{brierScore?.toFixed(3) ?? '-'}</div>
            </div>
            <div className="rounded-md border border-border p-3 text-center">
              <div className="text-xs text-muted-foreground">{t('review.clv')}</div>
              <div className={cn('text-lg font-semibold tabular-nums', (closingLineValue ?? 0) >= 0 ? 'text-green' : 'text-red')}>
                {closingLineValue !== undefined ? formatPct(closingLineValue) : '-'}
              </div>
            </div>
            <div className="rounded-md border border-border p-3 text-center">
              <div className="text-xs text-muted-foreground">{t('review.edge')}</div>
              <div className={cn('text-lg font-semibold tabular-nums', (bet.edge ?? 0) >= 0 ? 'text-green' : 'text-red')}>
                {bet.edge !== undefined ? formatPct(bet.edge) : '-'}
              </div>
            </div>
            <div className="rounded-md border border-border p-3 text-center">
              <div className="text-xs text-muted-foreground">{t('review.roi')}</div>
              <div className={cn('text-lg font-semibold tabular-nums', (detail.roi ?? 0) >= 0 ? 'text-green' : 'text-red')}>
                {detail.roi !== undefined ? formatPct(detail.roi) : '-'}
              </div>
            </div>
          </div>

          <ReviewTimeline detail={detail} />

          <BetResultAnalysisPanel betId={bet.id} />

          {/* Placement vs closing odds */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border p-3 text-center">
              <div className="text-xs text-muted-foreground">{t('review.placementOdds')}</div>
              <div className="text-lg font-semibold tabular-nums">
                {placementOdds?.toFixed(2) ?? bet.totalOdds.toFixed(2)}
              </div>
            </div>
            <div className="rounded-md border border-border p-3 text-center">
              <div className="text-xs text-muted-foreground">{t('review.closingOdds')}</div>
              <div className="text-lg font-semibold tabular-nums">
                {detail.closingOdds?.toFixed(2) ?? '-'}
              </div>
            </div>
          </div>

          {/* Match intel snapshot */}
          <div>
            <h4 className="mb-2 text-sm font-medium">{t('review.matchIntel')}</h4>
            {!matchSnapshot ? (
              <p className="text-xs text-muted-foreground">{t('review.noMatchIntel')}</p>
            ) : (
              <div className="space-y-1 rounded-md border border-border p-3 text-xs">
                <div className="flex flex-wrap gap-2">
                  <span className="font-medium">
                    {matchSnapshot.teamAName ?? 'A'} vs {matchSnapshot.teamBName ?? 'B'}
                  </span>
                  {matchSnapshot.format && <Badge variant="outline" className="text-[10px]">{matchSnapshot.format}</Badge>}
                  {matchSnapshot.tier && <Badge variant="outline" className="text-[10px]">Tier {matchSnapshot.tier}</Badge>}
                  {matchSnapshot.status && <Badge variant="outline" className="text-[10px]">{matchSnapshot.status}</Badge>}
                </div>
                <div className="text-muted-foreground">
                  {matchSnapshot.eventName ?? '-'} · ranks {matchSnapshot.teamARank ?? '-'} / {matchSnapshot.teamBRank ?? '-'}
                </div>
                <div className="text-muted-foreground">
                  {new Date(matchSnapshot.capturedAt).toLocaleString()}
                </div>
              </div>
            )}
          </div>

          {/* Probability comparison */}
          <div>
            <h4 className="mb-2 text-sm font-medium">{t('review.probabilityComparison')}</h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md border border-border p-3 text-center">
                <div className="text-xs text-muted-foreground">{t('review.marketProbability')}</div>
                <div className="text-lg font-semibold tabular-nums">
                  {bet.marketProbability !== undefined ? formatPct(bet.marketProbability) : '-'}
                </div>
              </div>
              <div className="rounded-md border border-border p-3 text-center">
                <div className="text-xs text-muted-foreground">{t('review.userProbability')}</div>
                <div className="text-lg font-semibold tabular-nums">
                  {bet.userProbability !== undefined ? formatPct(bet.userProbability) : '-'}
                </div>
              </div>
              <div className="rounded-md border border-border p-3 text-center">
                <div className="text-xs text-muted-foreground">{t('review.modelProbability')}</div>
                <div className="text-lg font-semibold tabular-nums">
                  {bet.modelProbability !== undefined ? formatPct(bet.modelProbability) : '-'}
                </div>
              </div>
            </div>
          </div>

          {/* Snapshots */}
          <div>
            <h4 className="mb-2 text-sm font-medium">{t('review.oddsSnapshots')}</h4>
            {snapshots.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('review.noSnapshots')}</p>
            ) : (
              <div className="max-h-40 space-y-1 overflow-auto rounded-md border border-border p-2">
                {snapshots.map((s) => (
                  <div key={s.id} className="flex justify-between text-xs">
                    <span className="truncate">{s.selection}</span>
                    <span className="tabular-nums">@{s.odds.toFixed(2)}</span>
                    <span className="text-muted-foreground">{new Date(s.capturedAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Closing odds input */}
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t('review.closingOdds')}</label>
            <input
              type="number"
              step="0.01"
              min="1.01"
              value={closingOdds}
              onChange={(e) => setClosingOdds(e.target.value)}
              placeholder={t('review.closingOddsPlaceholder')}
              className="h-8 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          {/* Error tags */}
          <div>
            <h4 className="mb-2 flex items-center gap-1 text-sm font-medium">
              <Tag className="h-3.5 w-3.5" />
              {t('review.errorTags')}
            </h4>
            <div className="flex flex-wrap gap-2">
              {ERROR_TAGS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors',
                    selectedTags.includes(tag)
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:bg-accent/50',
                  )}
                >
                  {getTagLabel(tag, t)}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              {t('review.note')}
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('review.notePlaceholder')}
              className="min-h-[80px] text-xs"
            />
          </div>

          <Button onClick={handleSave} disabled={isLoading} className="w-full">
            {isLoading ? t('common.saving') : t('review.saveReview')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ReviewPage({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const { reviews, summary, isLoading, error, fetchReviews, fetchSummary, fetchReviewDetail } = useReviewStore();
  const [selected, setSelected] = useState<ReviewDetail | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filters, setFilters] = useState<ReviewFilters>(DEFAULT_FILTERS);
  const debouncedFilters = useDebounce(filters, 300);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  useEffect(() => {
    const listFilters = toListFilters(debouncedFilters);
    void fetchReviews(listFilters);
    void fetchSummary(listFilters);
  }, [debouncedFilters, fetchReviews, fetchSummary]);

  useEffect(() => {
    setPage(1);
  }, [debouncedFilters]);

  useEffect(() => {
    const betId = searchParams.get('betId');
    if (!betId) return;
    let cancelled = false;
    void (async () => {
      await fetchReviewDetail(betId);
      if (cancelled) return;
      const detail = useReviewStore.getState().selectedReview;
      if (detail) {
        setSelected(detail);
        setDialogOpen(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, fetchReviewDetail]);

  const pageCount = Math.max(1, Math.ceil(reviews.length / pageSize));
  const paginatedReviews = useMemo(() => {
    return reviews.slice((page - 1) * pageSize, page * pageSize);
  }, [reviews, page]);

  const openDetail = (detail: ReviewDetail) => {
    setSelected(detail);
    setDialogOpen(true);
  };

  const toggleTag = (tag: string) => {
    setFilters((prev) => ({
      ...prev,
      selectedTags: prev.selectedTags.includes(tag)
        ? prev.selectedTags.filter((item) => item !== tag)
        : [...prev.selectedTags, tag],
    }));
  };

  const clearFilters = () => setFilters(DEFAULT_FILTERS);

  const hasActiveFilters =
    filters.result !== 'all' ||
    filters.betType !== 'all' ||
    filters.format !== 'all' ||
    filters.tier !== 'all' ||
    filters.timing !== 'all' ||
    filters.fromDate ||
    filters.toDate ||
    filters.hasNote !== 'all' ||
    filters.selectedTags.length > 0;
  const isInitialLoading = isLoading && reviews.length === 0;

  return (
    <div className="space-y-4">
      {!embedded && (
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{t('review.title')}</h1>
        </div>
      )}

      {isInitialLoading && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red/20 bg-red/5 p-4 text-sm text-red">
          {error}
          <Button variant="outline" size="sm" className="ml-3" onClick={() => {
            const listFilters = toListFilters(filters);
            void fetchReviews(listFilters);
            void fetchSummary(listFilters);
          }}>
            {t('common.retry')}
          </Button>
        </div>
      )}

      {!isInitialLoading && (
        <>
      {summary && (
        <div className="grid gap-3 xl:grid-cols-4">
          <Card className="p-3 space-y-2" data-testid="review-tag-stats">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Tag className="h-4 w-4 text-muted-foreground" />
              {t('review.tagStats')}
            </div>
            {summary.errorTagStats.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('review.tagStatsEmpty')}</p>
            ) : (
              <div className="space-y-1">
                {summary.errorTagStats.slice(0, 6).map((stat) => (
                  <div key={stat.tag} className="flex items-center justify-between text-xs">
                    <span>{getTagLabel(stat.tag, t)}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {stat.count} · {formatCurrency(stat.totalPnl)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-3 space-y-2" data-testid="review-tag-trend">
            <div className="flex items-center gap-2 text-sm font-medium">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              {t('review.tagTrend')}
            </div>
            {summary.errorTagTrend.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('review.tagTrendEmpty')}</p>
            ) : (
              <div className="space-y-1">
                {summary.errorTagTrend.slice(0, 6).map((stat) => (
                  <div
                    key={`${stat.periodStart}-${stat.tag}`}
                    className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-2 text-xs"
                  >
                    <span className="font-mono text-[10px] text-muted-foreground">{stat.periodLabel}</span>
                    <span className="min-w-0 truncate">{getTagLabel(stat.tag, t)}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {stat.count} · {formatCurrency(stat.totalPnl)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-3 space-y-2" data-testid="review-suggestions">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Lightbulb className="h-4 w-4 text-muted-foreground" />
              {t('review.suggestions')}
            </div>
            <div className="space-y-1.5">
              {summary.suggestions.map((item) => (
                <p
                  key={item.id}
                  className={cn(
                    'rounded-md border px-2 py-1.5 text-xs',
                    item.severity === 'critical' && 'border-red/30 bg-red/5 text-red',
                    item.severity === 'warning' && 'border-yellow/30 bg-yellow/5 text-yellow',
                    item.severity === 'info' && 'border-border text-muted-foreground',
                  )}
                >
                  {t(item.messageKey, item.params)}
                </p>
              ))}
            </div>
          </Card>

          <Card className="p-3 space-y-3">
            <div>
              <div className="mb-1 text-[10px] uppercase text-muted-foreground">{t('review.dimensionFormat')}</div>
              <div className="space-y-1">
                {summary.byFormat.slice(0, 4).map((row) => (
                  <div key={row.key} className="flex justify-between text-xs">
                    <span>{row.key}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {row.count} · {formatPct(row.winRate)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase text-muted-foreground">{t('review.dimensionTier')}</div>
              <div className="space-y-1">
                {summary.byTier.slice(0, 4).map((row) => (
                  <div key={row.key} className="flex justify-between text-xs">
                    <span>{row.key}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {row.count} · {formatCurrency(row.totalPnl)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card className="p-3">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Filter className="h-4 w-4 text-muted-foreground" />
              {t('review.filters')}
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={clearFilters}>
                <X className="h-3 w-3" />
                {t('review.clearFilters')}
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">{t('review.filterResult')}</label>
              <div className="flex gap-1">
                {RESULT_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setFilters((p) => ({ ...p, result: opt }))}
                    className={cn(
                      'rounded px-2 py-1 text-xs transition-colors',
                      filters.result === opt
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border bg-background text-muted-foreground hover:bg-accent/50',
                    )}
                  >
                    {t(`review.result_${opt}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">{t('review.filterType')}</label>
              <div className="flex gap-1">
                {TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setFilters((p) => ({ ...p, betType: opt }))}
                    className={cn(
                      'rounded px-2 py-1 text-xs transition-colors',
                      filters.betType === opt
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border bg-background text-muted-foreground hover:bg-accent/50',
                    )}
                  >
                    {t(`review.type_${opt}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">{t('review.filterFormat')}</label>
              <div className="flex gap-1">
                {FORMAT_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setFilters((p) => ({ ...p, format: opt }))}
                    className={cn(
                      'rounded px-2 py-1 text-xs transition-colors',
                      filters.format === opt
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border bg-background text-muted-foreground hover:bg-accent/50',
                    )}
                  >
                    {opt === 'all' ? t('review.format_all') : opt}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">{t('review.filterTier')}</label>
              <div className="flex gap-1">
                {TIER_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setFilters((p) => ({ ...p, tier: opt }))}
                    className={cn(
                      'rounded px-2 py-1 text-xs transition-colors',
                      filters.tier === opt
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border bg-background text-muted-foreground hover:bg-accent/50',
                    )}
                  >
                    {opt === 'all' ? t('review.tier_all') : opt}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">{t('review.filterTiming')}</label>
              <div className="flex gap-1">
                {TIMING_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setFilters((p) => ({ ...p, timing: opt }))}
                    className={cn(
                      'rounded px-2 py-1 text-xs transition-colors',
                      filters.timing === opt
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border bg-background text-muted-foreground hover:bg-accent/50',
                    )}
                  >
                    {t(`review.timing_${opt}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">{t('review.filterNote')}</label>
              <div className="flex gap-1">
                {(['all', 'yes', 'no'] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setFilters((p) => ({ ...p, hasNote: opt }))}
                    className={cn(
                      'rounded px-2 py-1 text-xs transition-colors',
                      filters.hasNote === opt
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border bg-background text-muted-foreground hover:bg-accent/50',
                    )}
                  >
                    {t(`review.note_${opt}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">{t('review.filterFromDate')}</label>
              <input
                type="date"
                value={filters.fromDate}
                onChange={(e) => setFilters((p) => ({ ...p, fromDate: e.target.value }))}
                className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">{t('review.filterToDate')}</label>
              <input
                type="date"
                value={filters.toDate}
                onChange={(e) => setFilters((p) => ({ ...p, toDate: e.target.value }))}
                className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground"
              />
            </div>
          </div>

          {/* Error tag filter */}
          <div className="flex flex-wrap gap-2">
            {ERROR_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[10px] transition-colors',
                  filters.selectedTags.includes(tag)
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground hover:bg-accent/50',
                )}
              >
                {getTagLabel(tag, t)}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">{t('review.settledBets')}</CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const listFilters = toListFilters(filters);
              void fetchReviews(listFilters);
              void fetchSummary(listFilters);
            }}
            disabled={isLoading}
          >
            {t('common.refresh')}
          </Button>
        </CardHeader>
        <div className="p-0">
          {reviews.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              {hasActiveFilters ? t('review.noFilterResults') : t('review.empty')}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4 py-2 text-xs">{t('common.time')}</TableHead>
                  <TableHead className="px-4 py-2 text-xs">{t('common.market')}</TableHead>
                  <TableHead className="px-4 py-2 text-xs">{t('slip.stake')}</TableHead>
                  <TableHead className="px-4 py-2 text-xs">{t('review.result')}</TableHead>
                  <TableHead className="px-4 py-2 text-xs">{t('review.brierScore')}</TableHead>
                  <TableHead className="px-4 py-2 text-xs">{t('review.clv')}</TableHead>
                  <TableHead className="px-4 py-2 text-xs">{t('review.roi')}</TableHead>
                  <TableHead className="px-4 py-2 text-xs">{t('review.note')}</TableHead>
                  <TableHead className="px-4 py-2 text-xs text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedReviews.map((detail) => (
                  <TableRow key={detail.bet.id}>
                    <TableCell className="px-4 py-2 text-xs tabular-nums">
                      {detail.bet.settledAt ? new Date(detail.bet.settledAt).toLocaleDateString() : '-'}
                    </TableCell>
                    <TableCell className="px-4 py-2 text-xs">
                      <div className="max-w-[160px] truncate">
                        {detail.matchName ?? detail.bet.matchId ?? detail.bet.marketId ?? '-'}
                      </div>
                      {detail.bet.matchFormat && (
                        <Badge variant="outline" className="mt-1 text-[9px]">{detail.bet.matchFormat}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-2 text-xs tabular-nums">
                      {formatCurrency(detail.bet.stake)}
                    </TableCell>
                    <TableCell className="px-4 py-2 text-xs">
                      <Badge variant={detail.bet.pnl >= 0 ? 'green' : 'red'} className="text-[10px]">
                        {detail.bet.result ?? '-'}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-2 text-xs tabular-nums">
                      {detail.brierScore?.toFixed(3) ?? '-'}
                    </TableCell>
                    <TableCell className={cn('px-4 py-2 text-xs tabular-nums', (detail.closingLineValue ?? 0) >= 0 ? 'text-green' : 'text-red')}>
                      {detail.closingLineValue !== undefined ? formatPct(detail.closingLineValue) : '-'}
                    </TableCell>
                    <TableCell className={cn('px-4 py-2 text-xs tabular-nums', (detail.roi ?? 0) >= 0 ? 'text-green' : 'text-red')}>
                      {detail.roi !== undefined ? formatPct(detail.roi) : '-'}
                    </TableCell>
                    <TableCell className="px-4 py-2 text-xs">
                      {detail.review?.note ? (
                        <span className="max-w-[120px] truncate">{detail.review.note}</span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-2 text-right">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openDetail(detail)}>
                        {t('review.reviewAction')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {reviews.length > pageSize && (
            <div className="flex items-center justify-between border-t border-border px-4 py-2">
              <div className="text-xs text-muted-foreground">
                {t('common.page')} {page} / {pageCount} · {reviews.length} {t('review.settledBets').toLowerCase()}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
        </>
      )}

      <ReviewDetailDialog detail={selected} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
