import { create } from 'zustand';
import type {
  ReviewDetail,
  BetReview,
  SimBet,
  ReviewSummary,
  ReviewListFilters,
  BetResultAnalysisArtifact,
} from '@polyrader/core/browser';
import { calculateBrierScore, calculateClosingLineValue } from '@polyrader/core/browser';
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

function toQuery(filters: ReviewListFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.result && filters.result !== 'all') params.set('result', filters.result);
  if (filters.betType && filters.betType !== 'all') params.set('betType', filters.betType);
  if (filters.format && filters.format !== 'all') params.set('format', filters.format);
  if (filters.tier && filters.tier !== 'all') params.set('tier', filters.tier);
  if (filters.timing && filters.timing !== 'all') params.set('timing', filters.timing);
  if (filters.hasNote && filters.hasNote !== 'all') params.set('hasNote', filters.hasNote);
  if (filters.fromDate) params.set('fromDate', filters.fromDate);
  if (filters.toDate) params.set('toDate', filters.toDate);
  if (filters.tags && filters.tags.length > 0) params.set('tags', filters.tags.join(','));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

interface ReviewState {
  reviews: ReviewDetail[];
  summary: ReviewSummary | null;
  selectedReview: ReviewDetail | null;
  resultAnalysis: BetResultAnalysisArtifact | null;
  isLoading: boolean;
  isAnalyzingResult: boolean;
  error: string | null;
  resultAnalysisError: string | null;
  fetchReviews: (filters?: ReviewListFilters) => Promise<void>;
  fetchSummary: (filters?: ReviewListFilters) => Promise<void>;
  fetchReviewDetail: (betId: string) => Promise<void>;
  fetchResultAnalysis: (betId: string) => Promise<void>;
  analyzeBetResult: (betId: string, input?: { locale?: string; force?: boolean }) => Promise<void>;
  createOrUpdateReview: (betId: string, input: { errorTags?: string[]; note?: string; closingOdds?: number }) => Promise<void>;
}

export const useReviewStore = create<ReviewState>((set) => ({
  reviews: [],
  summary: null,
  selectedReview: null,
  resultAnalysis: null,
  isLoading: false,
  isAnalyzingResult: false,
  error: null,
  resultAnalysisError: null,

  fetchReviews: async (filters = {}) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.get<{ data: ReviewDetail[] }>(`/sim/reviews${toQuery(filters)}`);
      set({ reviews: res.data, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  fetchSummary: async (filters = {}) => {
    try {
      const res = await api.get<{ data: ReviewSummary }>(`/sim/reviews/summary${toQuery(filters)}`);
      set({ summary: res.data });
    } catch (err) {
      set({ error: (err as Error).message });
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

  fetchResultAnalysis: async (betId: string) => {
    set({ resultAnalysis: null, resultAnalysisError: null });
    try {
      const res = await api.get<{ data: BetResultAnalysisArtifact }>(
        `/sim/bets/${betId}/result-analysis`,
      );
      set({ resultAnalysis: res.data });
    } catch (err) {
      const message = (err as Error).message;
      if (!message.includes('not found')) set({ resultAnalysisError: message });
    }
  },

  analyzeBetResult: async (betId, input = {}) => {
    set({ isAnalyzingResult: true, resultAnalysisError: null });
    try {
      const res = await api.post<{ data: BetResultAnalysisArtifact }>(
        `/sim/bets/${betId}/result-analysis`,
        input,
        { timeoutMs: 120000 },
      );
      set({ resultAnalysis: res.data, isAnalyzingResult: false });
    } catch (err) {
      set({ resultAnalysisError: (err as Error).message, isAnalyzingResult: false });
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
          closingOdds,
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
          r.bet.id === betId ? { ...r, review: updatedReview, closingOdds: updatedReview.closingOdds ?? r.closingOdds } : r,
        ),
        selectedReview:
          state.selectedReview?.bet.id === betId
            ? {
                ...state.selectedReview,
                review: updatedReview,
                closingOdds: updatedReview.closingOdds ?? state.selectedReview.closingOdds,
              }
            : state.selectedReview,
        isLoading: false,
      }));
    } catch (err) {
      set({ reviews: previousReviews, selectedReview: previousSelected, error: (err as Error).message, isLoading: false });
    }
  },
}));
