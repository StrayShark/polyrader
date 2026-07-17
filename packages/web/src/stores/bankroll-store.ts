import { create } from 'zustand';
import type { BankrollSummary, EquityCurveGranularity } from '@polyrader/core';
import { api } from '../utils/api';

interface BankrollState {
  summary: BankrollSummary | null;
  granularity: EquityCurveGranularity;
  isLoading: boolean;
  error: string | null;
  fetchSummary: (granularity?: EquityCurveGranularity) => Promise<void>;
  setGranularity: (granularity: EquityCurveGranularity) => void;
}

export const useBankrollStore = create<BankrollState>((set, get) => ({
  summary: null,
  granularity: 'day',
  isLoading: false,
  error: null,

  fetchSummary: async (granularity) => {
    const g = granularity ?? get().granularity;
    set({ isLoading: true, error: null, granularity: g });
    try {
      const res = await api.get<{ data: BankrollSummary }>(`/sim/bankroll?granularity=${g}`);
      set({ summary: res.data, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  setGranularity: (granularity) => {
    set({ granularity });
    void get().fetchSummary(granularity);
  },
}));
