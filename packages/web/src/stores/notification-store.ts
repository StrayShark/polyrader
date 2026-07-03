import { create } from 'zustand';

export type NotificationKind = 'whale' | 'settlement' | 'copy-signal';
export type NotificationSeverity = 'success' | 'warning' | 'info';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  message: string;
  timestamp: number;
  read: boolean;
  href?: string;
}

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
  add: (input: Pick<AppNotification, 'kind' | 'severity' | 'message'> & { href?: string }) => void;
  markAllRead: () => void;
  clear: () => void;
}

const MAX_NOTIFICATIONS = 50;
let seq = 0;

/**
 * Central notification feed for the bell / notification center.
 * Fed by the global alert hooks (whale, settlement, copy-signal) in addition
 * to the transient toasts, so users have a persistent place to review events.
 */
export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,

  add: ({ kind, severity, message, href }) =>
    set((state) => {
      const entry: AppNotification = {
        id: `${Date.now()}-${seq++}`,
        kind,
        severity,
        message,
        href,
        timestamp: Date.now(),
        read: false,
      };
      return {
        notifications: [entry, ...state.notifications].slice(0, MAX_NOTIFICATIONS),
        unreadCount: state.unreadCount + 1,
      };
    }),

  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),

  clear: () => set({ notifications: [], unreadCount: 0 }),
}));
