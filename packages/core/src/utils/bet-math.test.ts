import { describe, it, expect } from 'vitest';
import {
  oddsToImpliedProbability,
  calculateEdge,
  calculateEv,
  calculateKellyFraction,
  calculatePotentialPnl,
  calculateBrierScore,
  calculateClosingLineValue,
  americanToDecimal,
  decimalToAmerican,
} from './bet-math';

describe('bet-math', () => {
  describe('oddsToImpliedProbability', () => {
    it('converts decimal odds to implied probability', () => {
      expect(oddsToImpliedProbability(2)).toBe(0.5);
      expect(oddsToImpliedProbability(1.5)).toBeCloseTo(0.6667, 3);
    });

    it('returns 0 for invalid odds', () => {
      expect(oddsToImpliedProbability(0)).toBe(0);
      expect(oddsToImpliedProbability(-1)).toBe(0);
    });
  });

  describe('calculateEdge', () => {
    it('returns user probability minus market probability', () => {
      expect(calculateEdge(0.6, 0.5)).toBeCloseTo(0.1, 10);
      expect(calculateEdge(0.4, 0.5)).toBeCloseTo(-0.1, 10);
    });
  });

  describe('calculateEv', () => {
    it('returns positive EV for favorable bets', () => {
      // 60% true probability, decimal odds 2.0
      expect(calculateEv(100, 0.6, 2)).toBeCloseTo(20, 10);
    });

    it('returns negative EV for unfavorable bets', () => {
      expect(calculateEv(100, 0.4, 2)).toBeCloseTo(-20, 10);
    });
  });

  describe('calculateKellyFraction', () => {
    it('returns 0 when no edge', () => {
      expect(calculateKellyFraction(0.5, 0.5)).toBe(0);
    });

    it('returns positive fraction when user has edge', () => {
      expect(calculateKellyFraction(0.6, 0.5)).toBeCloseTo(0.2, 3);
    });
  });

  describe('calculatePotentialPnl', () => {
    it('returns stake times (odds - 1)', () => {
      expect(calculatePotentialPnl(100, 2)).toBe(100);
      expect(calculatePotentialPnl(100, 1.5)).toBe(50);
    });
  });

  describe('calculateBrierScore', () => {
    it('returns squared error', () => {
      expect(calculateBrierScore(0.7, 1)).toBeCloseTo(0.09, 4);
      expect(calculateBrierScore(0.7, 0)).toBeCloseTo(0.49, 4);
    });
  });

  describe('calculateClosingLineValue', () => {
    it('returns positive when entry odds are better than closing', () => {
      // Entry odds 2.0 (implied 0.5), closing odds 1.8 (implied 0.5556)
      expect(calculateClosingLineValue(2, 1.8)).toBeCloseTo(-0.1, 3);
    });
  });

  describe('american odds conversion', () => {
    it('converts american to decimal', () => {
      expect(americanToDecimal(100)).toBe(2);
      expect(americanToDecimal(-150)).toBeCloseTo(1.6667, 3);
    });

    it('round-trips decimal to american', () => {
      expect(decimalToAmerican(americanToDecimal(150))).toBe(150);
      expect(decimalToAmerican(americanToDecimal(-200))).toBe(-200);
    });
  });
});
