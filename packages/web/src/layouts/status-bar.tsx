import { Activity, Fish, Radio } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useWebSocket } from '../hooks/use-websocket';
import { ConnectionStatus } from '../components/connection-status';
import { api } from '../utils/api';
import { useI18n } from '../hooks/use-i18n';

interface HealthSnapshot {
  whaleIngestion?: {
    status: string;
    lastScanAt?: string;
    lastIngestedCount?: number;
  };
  priceStream?: {
    status: string;
    connected?: boolean;
    subscriptionCount?: number;
  };
}

export function StatusBar() {
  const { t } = useI18n();
  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const { wsStatus, latency } = useWebSocket();

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const body = await api.get<{
          dependencies?: {
            whaleIngestion?: HealthSnapshot['whaleIngestion'];
            priceStream?: HealthSnapshot['priceStream'];
          };
        }>('/health');
        if (!cancelled) {
          setHealth({
            whaleIngestion: body.dependencies?.whaleIngestion,
            priceStream: body.dependencies?.priceStream,
          });
        }
      } catch {
        if (!cancelled) setHealth(null);
      }
    };

    void poll();
    const timer = setInterval(() => { void poll(); }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const whaleLabel = health?.whaleIngestion
    ? `${t('statusBar.whaleScan')}: ${health.whaleIngestion.status}${health.whaleIngestion.lastScanAt ? ` · ${formatRelativeTime(health.whaleIngestion.lastScanAt)}` : ''}`
    : null;

  const streamLabel = health?.priceStream && health.priceStream.status !== 'skipped'
    ? `${t('statusBar.priceStream')}: ${health.priceStream.connected ? t('statusBar.connected') : health.priceStream.status}`
    : null;

  return (
    <footer className="flex h-7 items-center border-t border-border bg-status-bar px-2 md:px-4 text-[10px] md:text-[11px] text-status-bar-foreground">
      <div className="flex min-w-0 items-center gap-2 md:gap-4">
        <ConnectionStatus status={wsStatus} />
        {wsStatus === 'connected' && (
          <span className="hidden sm:flex items-center gap-1">
            <Activity className="h-3 w-3" />
            {latency}ms
          </span>
        )}
        {whaleLabel && (
          <span className="hidden md:flex items-center gap-1 truncate" title={whaleLabel}>
            <Fish className="h-3 w-3 shrink-0" />
            {whaleLabel}
          </span>
        )}
        {streamLabel && (
          <span className="hidden lg:flex items-center gap-1 truncate" title={streamLabel}>
            <Radio className="h-3 w-3 shrink-0" />
            {streamLabel}
          </span>
        )}
      </div>
    </footer>
  );
}

function formatRelativeTime(iso: string): string {
  const deltaMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.floor(deltaMs / 60_000));
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}
