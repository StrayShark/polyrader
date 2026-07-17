import { create } from 'zustand';
import type { PlaceSimBetInput, PlaceSimBetLegInput } from '@polyrader/core';
import { api } from '../utils/api';

export const MAX_LEGS = 6;
export const MIN_ODDS = 1.01;
export const MAX_ODDS = 100;
export const ROUND_ROBIN_SIZE = 2;

export type SlipBetType = 'single' | 'parlay' | 'round_robin';

export interface SlipLeg extends PlaceSimBetLegInput {
  id: string;
  matchLabel?: string;
  marketLabel?: string;
  matchFormat?: 'BO1' | 'BO3' | 'BO5' | null;
  matchTier?: string | null;
}

interface PracticeSlipState {
  legs: SlipLeg[];
  betType: SlipBetType;
  stake: number;
  userProbability: number | undefined;
  isSubmitting: boolean;
  error: string | null;
  lastPlacedBetId: string | null;
  addLeg: (leg: SlipLeg) => boolean;
  removeLeg: (id: string) => void;
  clearSlip: () => void;
  setStake: (stake: number) => void;
  setBetType: (betType: SlipBetType) => void;
  setUserProbability: (probability: number | undefined) => void;
  submitBet: (reasoning?: string) => Promise<boolean>;
}

function generateLegId(): string {
  return `slip-leg-${Math.random().toString(36).slice(2)}`;
}

function combinations<T>(arr: T[], size: number): T[][] {
  if (size > arr.length) return [];
  if (size === arr.length) return [arr];
  if (size === 1) return arr.map((item) => [item]);
  const result: T[][] = [];
  for (let i = 0; i <= arr.length - size; i++) {
    const head = arr[i];
    const tailCombos = combinations(arr.slice(i + 1), size - 1);
    for (const tail of tailCombos) {
      result.push([head, ...tail]);
    }
  }
  return result;
}

export const usePracticeSlipStore = create<PracticeSlipState>((set, get) => ({
  legs: [],
  betType: 'single',
  stake: 100,
  userProbability: undefined,
  isSubmitting: false,
  error: null,
  lastPlacedBetId: null,

  addLeg: (leg) => {
    const legs = get().legs;
    if (legs.length >= MAX_LEGS) {
      set({ error: 'slip.maxLegs' });
      return false;
    }
    if (!Number.isFinite(leg.odds) || leg.odds < MIN_ODDS || leg.odds > MAX_ODDS) {
      set({ error: 'slip.invalidOdds' });
      return false;
    }
    const exists = legs.some(
      (l) =>
        l.matchId === leg.matchId &&
        l.marketId === leg.marketId &&
        l.selection === leg.selection,
    );
    if (exists) {
      set({ error: 'slip.duplicateLeg' });
      return false;
    }
    set({ legs: [...legs, { ...leg, id: generateLegId() }], error: null });
    return true;
  },

  removeLeg: (id) => {
    set({ legs: get().legs.filter((l) => l.id !== id) });
  },

  clearSlip: () => {
    set({ legs: [], betType: 'single', stake: 100, userProbability: undefined, error: null, lastPlacedBetId: null });
  },

  setBetType: (betType) => set({ betType }),

  setStake: (stake) => set({ stake: Number.isFinite(stake) ? Math.max(1, stake) : 1 }),

  setUserProbability: (probability) => {
    if (probability === undefined || probability === null) {
      set({ userProbability: undefined });
      return;
    }
    const clamped = Math.max(0, Math.min(1, probability));
    set({ userProbability: Number.isFinite(clamped) ? clamped : undefined });
  },

  submitBet: async (reasoning) => {
    const { legs, betType, stake, userProbability } = get();
    if (legs.length === 0) {
      set({ error: 'slip.empty' });
      return false;
    }
    if (legs.length > MAX_LEGS) {
      set({ error: 'slip.maxLegs' });
      return false;
    }
    if (legs.some((l) => !Number.isFinite(l.odds) || l.odds < MIN_ODDS || l.odds > MAX_ODDS)) {
      set({ error: 'slip.invalidOdds' });
      return false;
    }

    set({ isSubmitting: true, error: null });
    try {
      const firstLeg = legs[0];
      const cleanLegs = legs.map(({ id: _id, matchLabel: _matchLabel, marketLabel: _marketLabel, matchFormat: _matchFormat, matchTier: _matchTier, ...rest }) => rest);

      if (betType === 'round_robin' && legs.length >= 3) {
        const combos = combinations(cleanLegs, ROUND_ROBIN_SIZE);
        const perComboStake = Math.max(1, Math.floor(stake / combos.length));
        let lastBetId = '';
        for (const combo of combos) {
          const body: PlaceSimBetInput = {
            betType: 'parlay',
            stake: perComboStake,
            legs: combo,
            userProbability,
            matchFormat: firstLeg?.matchFormat,
            matchTier: firstLeg?.matchTier,
            reasoning: reasoning ? `${reasoning} (Round-robin ${ROUND_ROBIN_SIZE}-leg)` : `Round-robin ${ROUND_ROBIN_SIZE}-leg`,
          };
          const res = await api.post<{ data: { bet: { id: string } } }>('/sim/bets', body);
          lastBetId = res.data.bet.id;
        }
        set({ isSubmitting: false, lastPlacedBetId: lastBetId });
        return true;
      }

      const body: PlaceSimBetInput = {
        betType: betType === 'parlay' || legs.length > 1 ? 'parlay' : 'single',
        stake,
        legs: cleanLegs,
        userProbability,
        matchFormat: firstLeg?.matchFormat,
        matchTier: firstLeg?.matchTier,
        reasoning,
      };
      const res = await api.post<{ data: { bet: { id: string } } }>('/sim/bets', body);
      set({ isSubmitting: false, lastPlacedBetId: res.data.bet.id });
      return true;
    } catch (err) {
      set({ isSubmitting: false, error: (err as Error).message });
      return false;
    }
  },
}));
