import type { WalletCopyConfig } from '../types/index';

export type CopyStrategyPresetId = 'high_win_rate' | 'large_trade_momentum' | 'conservative' | 'diversified';

export interface CopyStrategyPreset {
  id: CopyStrategyPresetId;
  config: Partial<WalletCopyConfig>;
}

export const COPY_STRATEGY_PRESETS: CopyStrategyPreset[] = [
  {
    id: 'high_win_rate',
    config: {
      enabled: true,
      mode: 'paper',
      copyRatio: 0.05,
      maxOrderUsd: 100,
      minLeaderTradeUsd: 500,
      minLeaderWinRate: 0.65,
      minLeaderRoi: 0.05,
      minLeaderSamples: 30,
      dailyCapUsd: 500,
      minMarketVolumeShare: 0.005,
      minMarketVolumeUsd: 5000,
      maxSlippage: 0.03,
      requireUserConfirm: true,
    },
  },
  {
    id: 'large_trade_momentum',
    config: {
      enabled: true,
      mode: 'paper',
      copyRatio: 0.05,
      maxOrderUsd: 150,
      minLeaderTradeUsd: 5000,
      minLeaderWinRate: 0.55,
      minLeaderRoi: 0.02,
      minLeaderSamples: 10,
      dailyCapUsd: 750,
      minMarketVolumeShare: 0.02,
      minMarketVolumeUsd: 10000,
      maxSlippage: 0.04,
      requireUserConfirm: true,
    },
  },
  {
    id: 'conservative',
    config: {
      enabled: true,
      mode: 'paper',
      copyRatio: 0.02,
      maxOrderUsd: 50,
      minLeaderTradeUsd: 1000,
      minLeaderWinRate: 0.58,
      minLeaderRoi: 0.03,
      minLeaderSamples: 20,
      dailyCapUsd: 250,
      minMarketVolumeShare: 0.01,
      minMarketVolumeUsd: 10000,
      maxSlippage: 0.02,
      requireUserConfirm: true,
    },
  },
  {
    id: 'diversified',
    config: {
      enabled: true,
      mode: 'paper',
      copyRatio: 0.03,
      maxOrderUsd: 75,
      minLeaderTradeUsd: 500,
      minLeaderWinRate: 0.55,
      minLeaderRoi: 0.01,
      minLeaderSamples: 15,
      dailyCapUsd: 600,
      minMarketVolumeShare: 0.005,
      minMarketVolumeUsd: 5000,
      maxSlippage: 0.04,
      requireUserConfirm: false,
    },
  },
];

export function matchesCopyStrategyPreset(
  config: WalletCopyConfig,
  preset: CopyStrategyPreset,
): boolean {
  return Object.entries(preset.config).every(([key, value]) => (
    config[key as keyof WalletCopyConfig] === value
  ));
}
