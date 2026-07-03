import { useEffect } from 'react';
import { useWebSocket } from './use-websocket';
import { useToast } from '../components/ToastProvider';
import { useNotificationStore } from '../stores/notification-store';

interface WhaleTradeEvent {
  address: string;
  marketId: string;
  marketQuestion: string;
  side: 'buy' | 'sell';
  outcome: string;
  size: number;
  price: number;
  timestamp: string;
}

const WHALE_THRESHOLD = 10000; // $10K+ trades are "whale" trades

/**
 * useWhaleAlerts — subscribes to whale trade WebSocket events and
 * pushes toast notifications for large trades.
 */
export function useWhaleAlerts() {
  const { subscribe } = useWebSocket();
  const { addToast } = useToast();
  const addNotification = useNotificationStore((s) => s.add);

  useEffect(() => {
    const unsub = subscribe('whale-trades', (data: unknown) => {
      const trade = data as WhaleTradeEvent;
      if (!trade || trade.size < WHALE_THRESHOLD) return;

      const sizeFormatted = `$${(trade.size / 1000).toFixed(1)}K`;
      const direction = trade.side === 'buy' ? 'bought' : 'sold';
      const outcome = trade.outcome === 'Yes' ? 'YES' : 'NO';
      const shortAddr = `${trade.address.slice(0, 6)}…${trade.address.slice(-4)}`;
      const shortQuestion = trade.marketQuestion.length > 50
        ? trade.marketQuestion.slice(0, 50) + '…'
        : trade.marketQuestion;

      const severity = trade.side === 'buy' ? 'success' : 'warning';
      const message = `🐋 ${sizeFormatted} — ${shortAddr} ${direction} ${outcome}: ${shortQuestion}`;

      addToast(severity, message);
      addNotification({
        kind: 'whale',
        severity,
        message,
        href: `#/whales/${trade.address}`,
      });
    });

    return unsub;
  }, [subscribe, addToast, addNotification]);
}
