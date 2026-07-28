import type { ReviewDetail } from '@polyrader/core/browser';
import { useI18n } from '../hooks/use-i18n';
import { cn } from '../utils/cn';

interface TimelineItem {
  id: string;
  at?: string;
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
      title: t('review.timelinePlaced'),
      body: bet.reasoning || t('review.timelineNoReasoning'),
      tone: 'primary',
    },
  ];

  if (snapshots.length > 0) {
    items.push({
      id: 'snapshot',
      at: latestSnapshot?.capturedAt,
      title: t('review.timelineSnapshot'),
      body: `${snapshots.length} ${t('review.timelineSnapshotCount')} · ${latestSnapshot?.selection ?? '-'} @${latestSnapshot?.odds.toFixed(2) ?? '-'}`,
    });
  }

  if (closingOdds) {
    items.push({
      id: 'closing',
      at: bet.settledAt,
      title: t('review.timelineClosing'),
      body: `${t('review.closingOdds')} @${closingOdds.toFixed(2)} · ${t('review.clv')} ${detail.closingLineValue !== undefined ? `${(detail.closingLineValue * 100).toFixed(1)}%` : '-'}`,
    });
  }

  if (bet.status === 'settled') {
    items.push({
      id: 'settled',
      at: bet.settledAt,
      title: t('review.timelineSettled'),
      body: `${bet.result ?? '-'} · ${formatSignedCurrency(bet.pnl)}`,
      tone: bet.pnl >= 0 ? 'green' : 'red',
    });
  }

  items.push({
    id: 'review',
    at: review?.updatedAt,
    title: t('review.timelineReview'),
    body: review?.note || t('review.timelineNoNote'),
    tone: review?.note ? 'primary' : 'default',
  });

  return (
    <section
      className="rounded-md border border-border bg-background/60 p-4"
      data-testid="review-timeline"
      aria-labelledby="review-timeline-title"
    >
      <h4 id="review-timeline-title" className="mb-4 text-sm font-medium leading-[22px]">
        {t('review.timeline')}
      </h4>
      <ol className="m-0 list-none p-0">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li
              key={item.id}
              className={cn('relative grid grid-cols-[10px_minmax(0,1fr)] gap-4', !isLast && 'pb-5')}
              data-testid="review-timeline-item"
              data-tone={item.tone ?? 'default'}
            >
              <div className="relative flex justify-center" aria-hidden="true">
                {!isLast && (
                  <span
                    className="absolute bottom-[-26px] left-1/2 top-4 w-0.5 -translate-x-1/2 bg-border"
                    data-testid="review-timeline-rail"
                  />
                )}
                <span
                  className={cn(
                    'relative z-10 mt-1.5 h-2.5 w-2.5 rounded-full border-2 bg-background',
                    item.tone === 'primary' && 'border-foreground',
                    item.tone === 'green' && 'border-green',
                    item.tone === 'red' && 'border-red',
                    (!item.tone || item.tone === 'default') && 'border-muted-foreground',
                  )}
                  data-testid="review-timeline-dot"
                />
              </div>
              <div className="min-w-0">
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <div className="text-sm font-medium leading-[22px] text-foreground">{item.title}</div>
                  <time
                    className="shrink-0 text-[11px] leading-5 tabular-nums text-muted-foreground"
                    dateTime={item.at}
                  >
                    {formatDateTime(item.at)}
                  </time>
                </div>
                <p className="mt-0.5 break-words text-xs leading-5 text-muted-foreground">{item.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
