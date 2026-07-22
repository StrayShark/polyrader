import { describe, expect, it } from 'vitest';
import { COPY_STRATEGY_PRESETS } from './copy-strategy-presets';

describe('copy strategy presets', () => {
  it('provides common strategies that always remain in paper mode', () => {
    expect(COPY_STRATEGY_PRESETS.map((preset) => preset.id)).toEqual([
      'high_win_rate',
      'large_trade_momentum',
      'conservative',
      'diversified',
    ]);
    for (const preset of COPY_STRATEGY_PRESETS) {
      expect(preset.config.mode).toBe('paper');
      expect(preset.config.maxOrderUsd).toBeGreaterThan(0);
      expect(preset.config.dailyCapUsd).toBeGreaterThanOrEqual(preset.config.maxOrderUsd ?? 0);
    }
  });
});
