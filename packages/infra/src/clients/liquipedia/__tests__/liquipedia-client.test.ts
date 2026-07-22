import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiquipediaClient, parseExpandedRosterTable, parseRosterFromWikitext } from '../liquipedia-client';

describe('LiquipediaClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('searches team pages through the MediaWiki API with a User-Agent', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        query: {
          search: [
            { pageid: 10, title: 'Natus Vincere', snippet: '<span>NAVI</span>' },
          ],
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new LiquipediaClient({
      apiUrl: 'https://liquipedia.test/api.php',
      userAgent: 'PolyraderTest/1.0',
      minIntervalMs: 0,
    });

    const results = await client.searchTeams('Natus Vincere');
    expect(results[0]).toMatchObject({
      title: 'Natus Vincere',
      canonicalName: 'Natus Vincere',
      sourceId: 'Natus Vincere',
      confidence: 1,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: expect.stringContaining('action=query') }),
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': 'PolyraderTest/1.0' }),
      }),
    );
  });

  it('loads current roster snapshots from API wikitext', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        query: {
          pages: {
            10: {
              revisions: [
                {
                  slots: {
                    main: {
                      '*': `
== Current roster ==
{{Player|s1mple|name=Oleksandr Kostyliev|role=AWPer|country=Ukraine}}
{{Player|b1t|name=Valerii Vakhovskyi|role=Rifler}}
`,
                    },
                  },
                },
              ],
            },
          },
        },
      }),
    }));

    const client = new LiquipediaClient({
      apiUrl: 'https://liquipedia.test/api.php',
      userAgent: 'PolyraderTest/1.0',
      minIntervalMs: 0,
    });

    const roster = await client.getCurrentRoster('Natus Vincere');
    expect(roster.sourceId).toBe('Natus Vincere');
    expect(roster.players.map((p) => p.nickname)).toEqual(['s1mple', 'b1t']);
    expect(roster.players[0].role).toBe('AWPer');
  });

  it('uses the selected game wiki for source links', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ query: { search: [{ pageid: 2, title: 'Team Liquid' }] } }),
    }));
    const client = new LiquipediaClient({
      game: 'valorant',
      apiUrl: 'https://liquipedia.test/api.php',
      minIntervalMs: 0,
    });

    const [team] = await client.searchTeams('Team Liquid');

    expect(team.sourceUrl).toBe('https://liquipedia.net/valorant/Team_Liquid');
  });

  it('expands ActiveSquadAuto for LoL and VALORANT roster pages', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ query: { pages: [{ revisions: [{ slots: { main: { content: '==Player Roster==\n===Active Roster===\n{{ActiveSquadAuto}}\n===Timeline===' } } }] }] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          expandtemplates: {
            wikitext: '<table><tr class="table2__row--body"><td>[[File:kr_hd.png|South Korea]] [[Faker|Faker]]</td><td>Lee Sang-hyeok</td><td>Mid</td><td>2013-02-13</td></tr></table>',
          },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const client = new LiquipediaClient({ game: 'lol', apiUrl: 'https://liquipedia.test/api.php', minIntervalMs: 0 });

    const roster = await client.getCurrentRoster('T1');

    expect(roster.players[0]).toMatchObject({ nickname: 'Faker', position: 'Mid', nationality: 'kr' });
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('action=expandtemplates');
  });
});

describe('parseRosterFromWikitext', () => {
  it('deduplicates player templates and stops before former players', () => {
    const players = parseRosterFromWikitext(`
== Current roster ==
{{Player|ZywOo|name=Mathieu Herbaut|role=AWPer|country=France}}
{{Player|flameZ|role=Entry}}
{{Player|ZywOo|role=AWPer}}
== Former players ==
{{Player|dupreeh}}
`);

    expect(players.map((p) => p.nickname)).toEqual(['ZywOo', 'flameZ']);
    expect(players[0].playerId).toBe('zywoo');
    expect(players[1].role).toBe('Entry');
  });
});

describe('parseExpandedRosterTable', () => {
  it('ignores flag links and keeps the player identity', () => {
    const players = parseExpandedRosterTable(
      '<tr class="table2__row--body"><td>[[File:ma_hd.png|Morocco]] [[Johnqt|johnqt]]</td><td>Mohamed Ouarid</td><td>IGL</td><td>2023-09-13</td></tr>',
    );

    expect(players[0]).toMatchObject({ nickname: 'johnqt', role: 'IGL', position: 'IGL', nationality: 'ma' });
  });
});
