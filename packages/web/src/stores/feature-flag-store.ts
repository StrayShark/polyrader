import { create } from 'zustand';
import { api } from '../utils/api';

export interface SystemFeatures {
  marketOrdersEnabled: boolean;
  liveTradingEnabled: boolean;
  polymarketAccountEnabled: boolean;
}

interface FeatureFlagState extends SystemFeatures {
  isLoading: boolean;
  error: string | null;
  fetchFeatures: () => Promise<void>;
}

const DEFAULT_FEATURES: SystemFeatures = {
  marketOrdersEnabled: false,
  liveTradingEnabled: false,
  polymarketAccountEnabled: false,
};

export const useFeatureFlagStore = create<FeatureFlagState>((set) => ({
  ...DEFAULT_FEATURES,
  isLoading: false,
  error: null,

  fetchFeatures: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.get<{ data: SystemFeatures }>('/system/features');
      set({ ...res.data, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },
}));
