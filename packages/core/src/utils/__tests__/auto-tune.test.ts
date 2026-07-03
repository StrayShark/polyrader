import { describe, it, expect } from 'vitest';
import { buildSignalWeightUpdates, applyPromptTrafficShift } from '../auto-tune';
import type { PromptVariant, SignalBacktestMetric } from '../../types/index';

describe('auto-tune utils', () => {
  it('builds signal weight updates with step guardrails', () => {
    const metrics: SignalBacktestMetric[] = [
      {
        source: 'prediction_model',
        label: 'Model',
        sampleSize: 20,
        brierScore: 0.18,
        accuracy: 0.62,
        calibrationError: 0.05,
        avgPredicted: 0.55,
        actualRate: 0.58,
        bets: 10,
        wins: 6,
        losses: 4,
        totalPnl: 120,
        roi: 0.12,
        maxDrawdown: 0.08,
        avgEdge: 0.06,
        currentWeight: 1,
        suggestedWeight: 1.4,
        buckets: [],
      },
    ];

    const updates = buildSignalWeightUpdates(metrics, { minSampleSize: 10, maxStepRatio: 0.5 });
    expect(updates.prediction_model).toBe(1.4);
  });

  it('shifts prompt traffic toward the winning variant', () => {
    const variants: PromptVariant[] = [
      {
        variantId: 'baseline',
        name: 'Baseline',
        systemPrompt: 'A',
        trafficWeight: 0.5,
        isControl: true,
        isEnabled: true,
        notes: '',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
      {
        variantId: 'v2',
        name: 'V2',
        systemPrompt: 'B',
        trafficWeight: 0.5,
        isControl: false,
        isEnabled: true,
        notes: '',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ];

    const result = applyPromptTrafficShift(variants, 'v2', 'baseline', 0.2);
    expect(result).not.toBeNull();
    const winner = result!.variants.find((v) => v.variantId === 'v2');
    const loser = result!.variants.find((v) => v.variantId === 'baseline');
    expect(winner!.trafficWeight).toBeGreaterThan(0.5);
    expect(loser!.trafficWeight).toBeLessThan(0.5);
  });
});
