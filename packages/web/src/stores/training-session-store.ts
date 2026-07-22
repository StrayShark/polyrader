import { create } from 'zustand';
import type {
  TrainingSession,
  CreateTrainingSessionInput,
  UpdateTrainingSessionInput,
} from '@polyrader/core/browser';
import { api } from '../utils/api';

interface TrainingSessionState {
  sessions: TrainingSession[];
  activeSessions: TrainingSession[];
  isLoading: boolean;
  error: string | null;
  fetchSessions: () => Promise<void>;
  createSession: (input: CreateTrainingSessionInput) => Promise<TrainingSession | null>;
  updateSession: (id: string, input: UpdateTrainingSessionInput) => Promise<TrainingSession | null>;
  deleteSession: (id: string) => Promise<void>;
  refreshProgress: (id: string) => Promise<TrainingSession | null>;
}

export const useTrainingSessionStore = create<TrainingSessionState>((set) => ({
  sessions: [],
  activeSessions: [],
  isLoading: false,
  error: null,

  fetchSessions: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.get<{ data: TrainingSession[] }>('/sim/training-sessions');
      const sessions = res.data ?? [];
      set({
        sessions,
        activeSessions: sessions.filter((s) => s.status === 'active'),
        isLoading: false,
      });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  createSession: async (input) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.post<{ data: TrainingSession }>('/sim/training-sessions', input);
      const session = res.data;
      set((state) => ({
        sessions: [session, ...state.sessions],
        activeSessions: session.status === 'active' ? [session, ...state.activeSessions] : state.activeSessions,
        isLoading: false,
      }));
      return session;
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
      return null;
    }
  },

  updateSession: async (id, input) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.patch<{ data: TrainingSession }>(`/sim/training-sessions/${id}`, input);
      const session = res.data;
      set((state) => {
        const sessions = state.sessions.map((s) => (s.id === id ? session : s));
        return {
          sessions,
          activeSessions: sessions.filter((s) => s.status === 'active'),
          isLoading: false,
        };
      });
      return session;
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
      return null;
    }
  },

  deleteSession: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`/sim/training-sessions/${id}`);
      set((state) => {
        const sessions = state.sessions.filter((s) => s.id !== id);
        return { sessions, activeSessions: sessions.filter((s) => s.status === 'active'), isLoading: false };
      });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  refreshProgress: async (id) => {
    try {
      const res = await api.post<{ data: TrainingSession }>(`/sim/training-sessions/${id}/refresh`);
      const session = res.data;
      set((state) => {
        const sessions = state.sessions.map((s) => (s.id === id ? session : s));
        return { sessions, activeSessions: sessions.filter((s) => s.status === 'active') };
      });
      return session;
    } catch (err) {
      set({ error: (err as Error).message });
      return null;
    }
  },
}));
