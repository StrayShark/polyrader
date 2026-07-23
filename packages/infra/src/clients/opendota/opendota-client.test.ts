import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenDotaClient } from './opendota-client';

describe('OpenDotaClient', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('normalizes recent professional matches', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
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
          },
        ]),
        { status: 200 },
      ),
    );
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
        return new Response(
          JSON.stringify([
            {
              team_id: 10,
              name: 'Team Liquid',
              tag: 'TL',
              rating: 1542.5,
              wins: 20,
              losses: 8,
              last_match_time: 1_784_534_000,
              logo_url: 'https://logo.test/tl.png',
            },
          ]),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify([
          {
            account_id: 42,
            steamid: '7656119',
            personaname: 'miCKe',
            name: 'Michael Vu',
            country_code: 'SE',
            team_id: 10,
            team_name: 'Team Liquid',
            team_tag: 'TL',
            last_match_time: 1_784_534_000,
          },
        ]),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new OpenDotaClient({ baseUrl: 'https://opendota.test/api' });

    const [teams, players] = await Promise.all([client.getTeams(1), client.getProPlayers(1)]);

    expect(teams[0]).toMatchObject({ teamId: '10', name: 'Team Liquid', rating: 1542.5, wins: 20 });
    expect(players[0]).toMatchObject({
      accountId: '42',
      nickname: 'miCKe',
      teamId: '10',
      countryCode: 'SE',
    });
  });

  it('normalizes targeted team roster and match history', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              account_id: 42,
              name: 'miCKe',
              games_played: 30,
              wins: 18,
              is_current_team_member: true,
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              match_id: 8907510684,
              duration: 1598,
              start_time: 1784665827,
              radiant: false,
              radiant_win: false,
              leagueid: 99,
              league_name: 'The Test International',
              opposing_team_id: 20,
              opposing_team_name: 'Team Falcons',
            },
          ]),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const client = new OpenDotaClient({ baseUrl: 'https://opendota.test/api' });

    const players = await client.getTeamPlayers('2163', 5);
    const matches = await client.getTeamMatches('2163', 5);

    expect(players[0]).toEqual({
      accountId: '42',
      name: 'miCKe',
      gamesPlayed: 30,
      wins: 18,
      isCurrentTeamMember: true,
    });
    expect(matches[0]).toMatchObject({
      matchId: '8907510684',
      radiant: false,
      radiantWin: false,
      opposingTeamId: '20',
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/teams/2163/players');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/teams/2163/matches');
  });

  it('normalizes authoritative match details, draft, players, and current patch', async () => {
    const fetchMock = vi.fn(async (input: URL) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/constants/patch')) {
        return new Response(
          JSON.stringify([
            { id: 59, name: '7.40', date: '2025-12-16T00:50:40.281Z' },
            { id: 60, name: '7.41', date: '2026-03-24T00:50:59.580Z' },
          ]),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          match_id: 8907510684,
          duration: 1598,
          start_time: 1784665827,
          radiant_team_id: 10182412,
          radiant_name: 'Aion',
          dire_team_id: 9600141,
          dire_name: 'Zero Tenacity',
          radiant_win: false,
          patch: 60,
          picks_bans: [{ is_pick: true, hero_id: 74, team: 1, order: 0 }],
          players: [
            {
              account_id: 72393079,
              player_slot: 129,
              personaname: 'Worick',
              name: 'Worick',
              hero_id: 74,
              kills: 10,
              deaths: 0,
              assists: 12,
              gold_per_min: 596,
              xp_per_min: 773,
            },
            {
              account_id: null,
              player_slot: 0,
              personaname: 'Hidden Carry',
              hero_id: 1,
            },
          ],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new OpenDotaClient({ baseUrl: 'https://opendota.test/api' });

    const [details, patch] = await Promise.all([
      client.getMatchDetails('8907510684'),
      client.getCurrentPatch(),
    ]);

    expect(details).toMatchObject({
      matchId: '8907510684',
      radiantTeamName: 'Aion',
      direTeamName: 'Zero Tenacity',
      radiantWin: false,
      patchId: 60,
    });
    expect(details.picksBans).toEqual([{ isPick: true, heroId: 74, team: 1, order: 0 }]);
    expect(details.players[0]).toMatchObject({ accountId: '72393079', kills: 10, playerSlot: 129 });
    expect(details.players[1]).toMatchObject({
      accountId: '8907510684-slot-0',
      nickname: 'Hidden Carry',
      playerSlot: 0,
    });
    expect(patch).toMatchObject({ id: 60, name: '7.41' });
  });
});
