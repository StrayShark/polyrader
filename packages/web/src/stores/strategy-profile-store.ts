import { create } from 'zustand';
import type {
  StrategyProfile,
  CreateStrategyProfileInput,
  UpdateStrategyProfileInput,
  SignalTuningConfig,
  SignalBacktestSummary,
} from '@polyrader/core/browser';
import { api } from '../utils/api';

interface StrategyProfileState {
  profiles: StrategyProfile[];
  activeProfile: StrategyProfile | null;
  isLoading: boolean;
  error: string | null;
  fetchProfiles: () => Promise<void>;
  createProfile: (input: CreateStrategyProfileInput) => Promise<StrategyProfile | null>;
  updateProfile: (id: string, input: UpdateStrategyProfileInput) => Promise<StrategyProfile | null>;
  deleteProfile: (id: string) => Promise<void>;
  activateProfile: (id: string) => Promise<StrategyProfile | null>;
  saveFromTuningConfig: (
    name: string,
    description: string | undefined,
    config: SignalTuningConfig,
    backtest?: SignalBacktestSummary,
  ) => Promise<StrategyProfile | null>;
}

export const useStrategyProfileStore = create<StrategyProfileState>((set, get) => ({
  profiles: [],
  activeProfile: null,
  isLoading: false,
  error: null,

  fetchProfiles: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.get<{ data: StrategyProfile[] }>('/sim/profiles');
      const profiles = res.data ?? [];
      set({ profiles, activeProfile: profiles.find((p) => p.isActive) ?? null, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  createProfile: async (input) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.post<{ data: StrategyProfile }>('/sim/profiles', input);
      const profile = res.data;
      set((state) => ({ profiles: [profile, ...state.profiles], isLoading: false }));
      return profile;
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
      return null;
    }
  },

  updateProfile: async (id, input) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.patch<{ data: StrategyProfile }>(`/sim/profiles/${id}`, input);
      const profile = res.data;
      set((state) => ({
        profiles: state.profiles.map((p) => (p.id === id ? profile : p)),
        activeProfile: state.activeProfile?.id === id ? profile : state.activeProfile,
        isLoading: false,
      }));
      return profile;
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
      return null;
    }
  },

  deleteProfile: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`/sim/profiles/${id}`);
      set((state) => ({
        profiles: state.profiles.filter((p) => p.id !== id),
        activeProfile: state.activeProfile?.id === id ? null : state.activeProfile,
        isLoading: false,
      }));
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  activateProfile: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.post<{ data: StrategyProfile }>(`/sim/profiles/${id}/activate`);
      const profile = res.data;
      set((state) => ({
        profiles: state.profiles.map((p) => ({ ...p, isActive: p.id === id })),
        activeProfile: profile,
        isLoading: false,
      }));
      return profile;
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
      return null;
    }
  },

  saveFromTuningConfig: async (name, description, config, backtest) => {
    const input: CreateStrategyProfileInput = {
      name,
      description,
      sourceWeights: config.sourceWeights,
      behaviorWeights: config.behaviorWeights,
      recommendation: config.recommendation,
      lastBacktest: backtest,
    };
    return get().createProfile(input);
  },
}));
