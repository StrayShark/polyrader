import { create } from 'zustand';
import type { ReviewDetail, BetReview, SimBet } from '@polyrader/core';
import { calculateBrierScore, calculateClosingLineValue } from '@polyrader/core';
import { api } from '../utils/api';

function computeReviewMetrics(bet: SimBet, closingOdds?: number) {
  let brierScore: number | undefined;
  if (bet.userProbability !== undefined && bet.result && bet.result !== 'push') {
    const outcome = bet.result === 'won' ? 1 : 0;
    brierScore = calculateBrierScore(bet.userProbability, outcome);
  }
  let closingLineValue: number | undefined;
  if (closingOdds && bet.totalOdds > 0) {
    closingLineValue = calculateClosingLineValue(bet.totalOdds, closingOdds);
  }
  const roi = bet.stake > 0 ? bet.pnl / bet.stake : undefined;
  return { brierScore, closingLineValue, roi };
}

interface ReviewState {
  reviews: ReviewDetail[];
  selectedReview: ReviewDetail | null;
  isLoading: boolean;
  error: string | null;
  fetchReviews: () => Promise<void>;
  fetchReviewDetail: (betId: string) => Promise<void>;
  createOrUpdateReview: (betId: string, input: { errorTags?: string[]; note?: string; closingOdds?: number }) => Promise<void>;
}

export const useReviewStore = create<ReviewState>((set) => ({
  reviews: [],
  selectedReview: null,
  isLoading: false,
  error: null,

  fetchReviews: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.get<{ data: ReviewDetail[] }>('/sim/reviews');
      set({ reviews: res.data, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  fetchReviewDetail: async (betId: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.get<{ data: ReviewDetail }>(`/sim/bets/${betId}/review`);
      set({ selectedReview: res.data, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  createOrUpdateReview: async (betId, input) => {
    let previousReviews: ReviewDetail[] = [];
    let previousSelected: ReviewDetail | null = null;

    set((state) => {
      previousReviews = state.reviews;
      previousSelected = state.selectedReview;

      const updatedReviews = state.reviews.map((r) => {
        if (r.bet.id !== betId) return r;
        const closingOdds = input.closingOdds ?? r.closingOdds;
        const metrics = computeReviewMetrics(r.bet, closingOdds);
        const now = new Date().toISOString();
        const review: BetReview = {
          id: r.review?.id ?? betId,
          betId,
          errorTags: input.errorTags ?? r.review?.errorTags ?? [],
          note: input.note,
          brierScore: metrics.brierScore,
          closingLineValue: metrics.closingLineValue,
          roi: metrics.roi,
          createdAt: r.review?.createdAt ?? now,
          updatedAt: now,
        };
        return { ...r, review, closingOdds, ...metrics };
      });

      const updatedSelected =
        state.selectedReview?.bet.id === betId
          ? updatedReviews.find((r) => r.bet.id === betId) ?? state.selectedReview
          : state.selectedReview;

      return { reviews: updatedReviews, selectedReview: updatedSelected, isLoading: true, error: null };
    });

    try {
      const res = await api.post<{ data: BetReview }>(`/sim/bets/${betId}/review`, input);
      const updatedReview = res.data;
      set((state) => ({
        reviews: state.reviews.map((r) =>
          r.bet.id === betId ? { ...r, review: updatedReview } : r,
        ),
        selectedReview:
          state.selectedReview?.bet.id === betId
            ? { ...state.selectedReview, review: updatedReview }
            : state.selectedReview,
        isLoading: false,
      }));
    } catch (err) {
      set({ reviews: previousReviews, selectedReview: previousSelected, error: (err as Error).message, isLoading: false });
    }
  },
}));
