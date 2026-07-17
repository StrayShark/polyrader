import { describe, it, expect } from 'vitest';
import {
  buildMatchInfo,
  buildFallbackMatchInfo,
  buildFallbackTeam,
  parseJsonField,
} from '../services/match-helpers';

describe('match-helpers', () => {
  describe('buildMatchInfo', () => {
    it('builds MatchInfo from a complete DB row', () => {
      const dbMatch = {
        match_id: 'match-123',
        team_a_id: 'team-1',
        team_a_name: 'Navi',
        team_b_id: 'team-2',
        team_b_name: 'Vitality',
        event_name: 'IEM Katowice',
        event_type: 'LAN',
        format: 'BO3',
        scheduled_at: '2024-01-15T10:00:00Z',
        status: 'upcoming',
      };

      const result = buildMatchInfo(dbMatch);

      expect(result.matchId).toBe('match-123');
      expect(result.teamA.teamId).toBe('team-1');
      expect(result.teamA.name).toBe('Navi');
      expect(result.teamB.name).toBe('Vitality');
      expect(result.eventName).toBe('IEM Katowice');
      expect(result.eventType).toBe('LAN');
      expect(result.format).toBe('BO3');
      expect(result.status).toBe('scheduled');
    });

    it('uses defaults for missing fields', () => {
      const result = buildMatchInfo({});

      expect(result.matchId).toBe('');
      expect(result.teamA.name).toBe('');
      expect(result.eventType).toBe('Online');
      expect(result.format).toBe('BO3');
      expect(result.status).toBe('scheduled');
    });

    it('handles null values in DB row', () => {
      const result = buildMatchInfo({
        match_id: null,
        team_a_id: null,
        team_a_name: null,
      });

      expect(result.matchId).toBe('');
      expect(result.teamA.teamId).toBe('');
      expect(result.teamA.name).toBe('');
    });

    it('hydrates team profiles, form, roster, and map pool from DB rows', () => {
      const player = { playerId: 'p1', name: 'Player One', nickname: 'one', rating: 1.12, kdRatio: 1.1, headshotPercent: 0.5, mapsPlayed: 30, role: 'Rifler' };
      const teamRow = (teamId: string, name: string, rank: number) => ({
        team_id: teamId,
        name,
        logo: `https://img.example/${teamId}.png`,
        rank,
        region: 'EU',
        players: JSON.stringify(Array.from({ length: 5 }, (_, index) => ({ ...player, playerId: `${teamId}-${index}` }))),
        recent_form: JSON.stringify({ last10Matches: [{ opponent: 'Other', result: 'win', score: '2-0', date: '2026-07-10', event: 'Cup' }], winRate: 1, streak: 1, averageRating: 1.12 }),
        map_pool: JSON.stringify({ maps: [{ map: 'Nuke', winRate: 0.6, matchesPlayed: 5, roundsWon: 0, roundsLost: 0 }] }),
        updated_at: '2026-07-14 10:00:00',
      });
      const result = buildMatchInfo({
        match_id: 'local-hltv-1', team_a_id: '1', team_b_id: '2', team_a_name: 'Alpha', team_b_name: 'Beta',
        scheduled_at: '2026-07-15T10:00:00.000Z', status: 'scheduled', maps: '["Nuke"]',
      }, teamRow('1', 'Alpha', 10), teamRow('2', 'Beta', 20));

      expect(result.teamA).toMatchObject({ rank: 10, region: 'EU', logo: 'https://img.example/1.png' });
      expect(result.teamDetails?.isComplete).toBe(true);
      expect(result.teamDetails?.teamB.players).toHaveLength(5);
      expect(result.teamDetails?.teamA.recentForm.last10Matches).toHaveLength(1);
      expect(result.teamDetails?.teamA.mapPool.maps[0].map).toBe('Nuke');
    });
  });

  describe('buildFallbackMatchInfo', () => {
    it('creates a valid fallback with the given matchId', () => {
      const result = buildFallbackMatchInfo('fallback-123');

      expect(result.matchId).toBe('fallback-123');
      expect(result.teamA.name).toBe('Team A');
      expect(result.teamB.name).toBe('Team B');
      expect(result.teamA.rank).toBe(10);
      expect(result.teamB.rank).toBe(20);
      expect(result.eventType).toBe('Online');
      expect(result.format).toBe('BO3');
      expect(result.status).toBe('scheduled');
    });
  });

  describe('buildFallbackTeam', () => {
    it('creates a team with the specified parameters', () => {
      const result = buildFallbackTeam('t1', 'FaZe', 5, 0.65);

      expect(result.teamId).toBe('t1');
      expect(result.name).toBe('FaZe');
      expect(result.rank).toBe(5);
      expect(result.recentForm.winRate).toBe(0.65);
      expect(result.players).toEqual([]);
      expect(result.mapPool.maps).toEqual([]);
      expect(result.headToHead).toEqual([]);
    });

    it('defaults streak to 0', () => {
      const result = buildFallbackTeam('t2', 'G2', 1, 0.8);
      expect(result.recentForm.streak).toBe(0);
    });
  });

  describe('parseJsonField', () => {
    it('parses a valid JSON string', () => {
      expect(parseJsonField('{"key":"value"}')).toEqual({ key: 'value' });
    });

    it('returns null for invalid JSON string', () => {
      expect(parseJsonField('not-json')).toBeNull();
    });

    it('returns the object directly for object input', () => {
      const obj = { a: 1 };
      expect(parseJsonField(obj)).toBe(obj);
    });

    it('returns null for null input', () => {
      expect(parseJsonField(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(parseJsonField(undefined)).toBeNull();
    });

    it('returns null for number input', () => {
      expect(parseJsonField(42)).toBeNull();
    });
  });
});
