import { useEffect } from 'react';
import { useWebSocket } from './use-websocket';
import { useToast } from '../components/ToastProvider';
import { useNotificationStore } from '../stores/notification-store';
import { t } from '../utils/i18n';

interface SettlementEvent {
  marketId: string;
  question: string;
  outcome: string;
  pnl?: number;
}

/**
 * useSettlementAlerts — subscribes to settlement WebSocket events and
 * pushes toast notifications when markets are settled.
 */
export function useSettlementAlerts() {
  const { subscribe } = useWebSocket();
  const { addToast } = useToast();
  const addNotification = useNotificationStore((s) => s.add);

  useEffect(() => {
    const unsub = subscribe('settlement', (data: unknown) => {
      const event = data as SettlementEvent;
      if (!event) return;

      const shortQuestion = event.question.length > 50
        ? event.question.slice(0, 50) + '…'
        : event.question;
      const pnlText = event.pnl !== undefined
        ? ` | PnL: ${event.pnl >= 0 ? '+' : ''}$${event.pnl.toFixed(0)}`
        : '';

      const severity = event.pnl !== undefined && event.pnl >= 0 ? 'success' : 'info';
      const message = t('settlement.completed', { question: shortQuestion, outcome: event.outcome, pnl: pnlText });

      addToast(severity, message);
      addNotification({ kind: 'settlement', severity, message });
    });

    return unsub;
  }, [subscribe, addToast, addNotification]);
}
