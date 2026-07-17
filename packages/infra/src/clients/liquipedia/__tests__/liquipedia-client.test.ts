import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiquipediaClient, parseRosterFromWikitext } from '../liquipedia-client';

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
