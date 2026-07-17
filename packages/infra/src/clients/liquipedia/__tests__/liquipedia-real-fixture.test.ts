import { describe, expect, it } from 'vitest';
import { LiquipediaClient } from '../liquipedia-client';

const RUN_REAL_FIXTURE = process.env.LIQUIPEDIA_REAL_FIXTURE === '1';
const realIt = RUN_REAL_FIXTURE ? it : it.skip;

const REAL_TEAMS = [
  'Natus Vincere',
  'Team Vitality',
  'FaZe Clan',
  'MOUZ',
];

describe('Liquipedia real roster fixtures', () => {
  realIt(
    'parses current rosters for major CS2 teams from live MediaWiki pages',
    async () => {
      const client = new LiquipediaClient({
        userAgent: process.env.LIQUIPEDIA_USER_AGENT ?? 'PolyraderCS2/0.3 real-fixture-test (local validation)',
        minIntervalMs: 2100,
        timeoutMs: 15000,
      });

      for (const teamName of REAL_TEAMS) {
        const searchResults = await client.searchTeams(teamName, 3);
        expect(searchResults.length, `${teamName} should be discoverable`).toBeGreaterThan(0);

        const best = searchResults[0];
        expect(best.confidence, `${teamName} should have a confident search match`).toBeGreaterThanOrEqual(0.5);

        const roster = await client.getCurrentRoster(best.sourceId);
        expect(roster.rawLength, `${teamName} wikitext should be non-empty`).toBeGreaterThan(500);
        expect(roster.players.length, `${teamName} should expose an active roster`).toBeGreaterThanOrEqual(3);
        expect(roster.players.every((player) => player.playerId && player.nickname)).toBe(true);
      }
    },
    90_000,
  );
});
