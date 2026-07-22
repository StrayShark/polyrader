import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenDotaClient } from './opendota-client';

describe('OpenDotaClient', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('normalizes recent professional matches', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      match_id: 123,
      duration: 2400,
      start_time: 1_784_534_000,
      radiant_team_id: 10,
      radiant_name: 'Radiant Pro',
      dire_team_id: 20,
      dire_name: 'Dire Pro',
      radiant_win: true,
      leagueid: 99,
      league_name: 'The Test International',
    }]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new OpenDotaClient({ baseUrl: 'https://opendota.test/api', timeoutMs: 1000 });
    const matches = await client.getRecentProMatches(1);

    expect(matches[0]).toMatchObject({
      matchId: '123',
      radiantTeamName: 'Radiant Pro',
      direTeamName: 'Dire Pro',
      radiantWin: true,
      leagueId: '99',
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://opendota.test/api/proMatches');
  });

  it('adds an API key only when configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new OpenDotaClient({ baseUrl: 'https://opendota.test/api', apiKey: 'test-key' });

    await client.getRecentProMatches(1);

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('api_key=test-key');
  });

  it('normalizes team rankings and professional player affiliations', async () => {
    const fetchMock = vi.fn(async (input: URL) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/teams')) {
        return new Response(JSON.stringify([{
          team_id: 10, name: 'Team Liquid', tag: 'TL', rating: 1542.5,
          wins: 20, losses: 8, last_match_time: 1_784_534_000, logo_url: 'https://logo.test/tl.png',
        }]), { status: 200 });
      }
      return new Response(JSON.stringify([{
        account_id: 42, steamid: '7656119', personaname: 'miCKe', name: 'Michael Vu',
        country_code: 'SE', team_id: 10, team_name: 'Team Liquid', team_tag: 'TL',
        last_match_time: 1_784_534_000,
      }]), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new OpenDotaClient({ baseUrl: 'https://opendota.test/api' });

    const [teams, players] = await Promise.all([client.getTeams(1), client.getProPlayers(1)]);

    expect(teams[0]).toMatchObject({ teamId: '10', name: 'Team Liquid', rating: 1542.5, wins: 20 });
    expect(players[0]).toMatchObject({ accountId: '42', nickname: 'miCKe', teamId: '10', countryCode: 'SE' });
  });
});
