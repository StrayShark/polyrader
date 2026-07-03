import { useEffect, useRef, useState } from 'react';
import { Bell, Check, Fish, Flag, TrendingUp, Trash2 } from 'lucide-react';
import { useNotificationStore, type NotificationKind, type NotificationSeverity } from '../stores/notification-store';
import { useI18n } from '../hooks/use-i18n';
import { cn } from '../utils/cn';

const KIND_ICON: Record<NotificationKind, typeof Bell> = {
  whale: Fish,
  settlement: Flag,
  'copy-signal': TrendingUp,
};

const SEVERITY_COLOR: Record<NotificationSeverity, string> = {
  success: 'text-green',
  warning: 'text-yellow',
  info: 'text-primary',
};

function relativeTime(ts: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - ts) / 60_000));
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * NotificationBell — persistent notification center fed by the global alert
 * hooks (whale / settlement / copy-signal). Complements the transient toasts.
 */
export function NotificationBell() {
  const { t } = useI18n();
  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const clear = useNotificationStore((s) => s.clear);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0) markAllRead();
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={toggle}
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label={t('notifications.title')}
        title={t('notifications.title')}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-[60] w-80 overflow-hidden rounded-lg border border-border bg-card shadow-lg animate-in fade-in-0 zoom-in-95">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold">{t('notifications.title')}</span>
            {notifications.length > 0 && (
              <button
                onClick={clear}
                className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <Trash2 className="h-3 w-3" />
                {t('notifications.clear')}
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
                <Check className="h-5 w-5" />
                {t('notifications.empty')}
              </div>
            ) : (
              notifications.map((n) => {
                const Icon = KIND_ICON[n.kind];
                const content = (
                  <>
                    <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', SEVERITY_COLOR[n.severity])} />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-foreground/90">{n.message}</span>
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">{relativeTime(n.timestamp)}</span>
                    </span>
                  </>
                );
                const className = 'flex w-full items-start gap-2 border-b border-border/60 px-3 py-2 text-left text-xs last:border-b-0 transition-colors hover:bg-accent/60';
                return n.href ? (
                  <a key={n.id} href={n.href} onClick={() => setOpen(false)} className={className}>
                    {content}
                  </a>
                ) : (
                  <div key={n.id} className={className}>
                    {content}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
