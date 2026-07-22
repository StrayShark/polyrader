import { BookOpen, CheckCircle2, Clock3, FileText, LineChart, NotebookText } from 'lucide-react';
import type { ReviewDetail } from '@polyrader/core/browser';
import { useI18n } from '../hooks/use-i18n';
import { cn } from '../utils/cn';

interface TimelineItem {
  id: string;
  at?: string;
  icon: typeof Clock3;
  title: string;
  body: string;
  tone?: 'default' | 'green' | 'red' | 'primary';
}

interface ReviewTimelineProps {
  detail: ReviewDetail;
}

function formatDateTime(value: string | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatSignedCurrency(value: number): string {
  return `${value >= 0 ? '+' : '-'}$${Math.abs(value).toFixed(2)}`;
}

export function ReviewTimeline({ detail }: ReviewTimelineProps) {
  const { t } = useI18n();
  const { bet, review, snapshots, closingOdds } = detail;
  const latestSnapshot = [...snapshots].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)).at(-1);

  const items: TimelineItem[] = [
    {
      id: 'placed',
      at: bet.placedAt,
      icon: Clock3,
      title: t('review.timelinePlaced'),
      body: bet.reasoning || t('review.timelineNoReasoning'),
      tone: 'primary',
    },
  ];

  if (snapshots.length > 0) {
    items.push({
      id: 'snapshot',
      at: latestSnapshot?.capturedAt,
      icon: LineChart,
      title: t('review.timelineSnapshot'),
      body: `${snapshots.length} ${t('review.timelineSnapshotCount')} · ${latestSnapshot?.selection ?? '-'} @${latestSnapshot?.odds.toFixed(2) ?? '-'}`,
    });
  }

  if (closingOdds) {
    items.push({
      id: 'closing',
      at: bet.settledAt,
      icon: BookOpen,
      title: t('review.timelineClosing'),
      body: `${t('review.closingOdds')} @${closingOdds.toFixed(2)} · ${t('review.clv')} ${detail.closingLineValue !== undefined ? `${(detail.closingLineValue * 100).toFixed(1)}%` : '-'}`,
    });
  }

  if (bet.status === 'settled') {
    items.push({
      id: 'settled',
      at: bet.settledAt,
      icon: CheckCircle2,
      title: t('review.timelineSettled'),
      body: `${bet.result ?? '-'} · ${formatSignedCurrency(bet.pnl)}`,
      tone: bet.pnl >= 0 ? 'green' : 'red',
    });
  }

  items.push({
    id: 'review',
    at: review?.updatedAt,
    icon: review?.note ? NotebookText : FileText,
    title: t('review.timelineReview'),
    body: review?.note || t('review.timelineNoNote'),
  });

  return (
    <div className="rounded-md border border-border bg-background/60 p-3">
      <div className="mb-3 text-sm font-medium">{t('review.timeline')}</div>
      <div className="space-y-3">
        {items.map((item, index) => {
          const Icon = item.icon;
          return (
            <div key={item.id} className="grid grid-cols-[20px_1fr] gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full border bg-background',
                    item.tone === 'primary' && 'border-primary text-primary',
                    item.tone === 'green' && 'border-green text-green',
                    item.tone === 'red' && 'border-red text-red',
                    !item.tone && 'border-border text-muted-foreground',
                  )}
                >
                  <Icon className="h-3 w-3" />
                </div>
                {index < items.length - 1 && <div className="mt-1 h-full min-h-6 w-px bg-border" />}
              </div>
              <div className="min-w-0 pb-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-medium">{item.title}</div>
                  <div className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                    {formatDateTime(item.at)}
                  </div>
                </div>
                <div className="mt-1 break-words text-xs text-muted-foreground">{item.body}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
