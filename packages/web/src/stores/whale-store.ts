import { create } from 'zustand';
import type { Whale } from '@polyrader/core/browser';
import { api } from '../utils/api';

export type WhaleListMode = 'volume' | 'win_rate';

interface WhaleFetchOptions {
  limit?: number;
  sort?: WhaleListMode;
  minSamples?: number;
  minWinRate?: number;
  minRoi?: number;
}

export interface WhaleRefreshResult {
  ingestedTrades: number;
  discovered: number;
  qualified: number;
  failedProfiles: number;
  performanceUpdated: number;
  discoveryError?: string | null;
  ingestion: {
    source: 'data-api' | 'polygon' | null;
    lastScanAt: string | null;
    lastIngestedCount: number;
    lastError: string | null;
  };
}

interface WhaleState {
  whales: Whale[];
  listMode: WhaleListMode;
  isLoading: boolean;
  error: string | null;
  lastRefresh: WhaleRefreshResult | null;
  fetchWhales: (options?: WhaleFetchOptions) => Promise<void>;
  refreshWhales: (options?: WhaleFetchOptions) => Promise<WhaleRefreshResult | null>;
  setListMode: (mode: WhaleListMode) => void;
}

export const useWhaleStore = create<WhaleState>((set, get) => ({
  whales: [],
  listMode: 'volume',
  isLoading: false,
  error: null,
  lastRefresh: null,

  setListMode: (mode) => {
    set({ listMode: mode });
  },

  fetchWhales: async (options) => {
    const state = get();
    const limit = options?.limit ?? 50;
    const sort = options?.sort ?? state.listMode;
    const minSamples = options?.minSamples ?? (sort === 'win_rate' ? 5 : 0);
    const minWinRate = options?.minWinRate ?? (sort === 'win_rate' ? 0.6 : 0);
    const minRoi = options?.minRoi ?? (sort === 'win_rate' ? -1 : 0);

    set({ isLoading: true, error: null, listMode: sort });
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        sort,
      });
      if (sort === 'win_rate') {
        params.set('minSamples', String(minSamples));
        params.set('minWinRate', String(minWinRate));
        params.set('minRoi', String(minRoi));
      }

      const { data } = await api.get<{ data: Whale[] }>(`/whales?${params.toString()}`);
      set({ whales: data, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  refreshWhales: async (options) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post<{ data: WhaleRefreshResult }>('/whales/refresh', undefined, { timeoutMs: 90_000 });
      set({ lastRefresh: data });
      await get().fetchWhales(options);
      return data;
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
      return null;
    }
  },
}));
