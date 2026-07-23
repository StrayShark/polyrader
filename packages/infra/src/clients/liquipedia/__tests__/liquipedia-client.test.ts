import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LiquipediaClient,
  parseExpandedRosterTable,
  parseRosterFromWikitext,
  parseRecentMatchesHtml,
  parseUpcomingMatchesHtml,
} from '../liquipedia-client';
import { clearPoliteFetchState } from '../../../crawlers/polite-fetch';

describe('LiquipediaClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearPoliteFetchState();
  });

  it('searches team pages through the MediaWiki API with a User-Agent', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        query: {
          search: [
            { pageid: 10, title: 'Natus Vincere', snippet: '<span>NAVI</span>' },
          ],
        },
      }), { status: 200 }));
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
      expect.stringContaining('action=query'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': 'PolyraderTest/1.0' }),
      }),
    );
  });

  it('loads current roster snapshots from API wikitext', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
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
      }), { status: 200 })));

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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      query: { search: [{ pageid: 2, title: 'Team Liquid' }] },
    }), { status: 200 })));
    const client = new LiquipediaClient({
      game: 'valorant',
      apiUrl: 'https://liquipedia.test/api.php',
      minIntervalMs: 0,
    });

    const [team] = await client.searchTeams('Team Liquid');

    expect(team.sourceUrl).toBe('https://liquipedia.net/valorant/Team_Liquid');
  });

  it('loads licensed Dota 2 schedules from the Liquipedia DB API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: [
          {
            match2id: 'lp-match-1',
            wiki: 'dota2',
            dateexact: '2026-07-22T12:00:00Z',
            match2opponents: [
              { id: 'liquid', name: 'Team Liquid' },
              { id: 'falcons', name: 'Team Falcons' },
            ],
            tournament: { id: 'riyadh', name: 'Riyadh Masters' },
            bestof: 3,
            liquipediapage: 'Riyadh_Masters/2026',
          },
          {
            match2id: 'old-match',
            dateexact: '2026-07-20T12:00:00Z',
            match2opponents: ['Old A', 'Old B'],
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new LiquipediaClient({
      game: 'dota2',
      dbApiUrl: 'https://api.liquipedia.test/api/v3',
      dbApiKey: 'test-key',
      userAgent: 'PolyraderTest/1.0',
      minIntervalMs: 0,
    });

    const matches = await client.getUpcomingMatches(10, new Date('2026-07-21T00:00:00Z'));

    expect(client.isMatchScheduleConfigured()).toBe(true);
    expect(matches).toEqual([
      expect.objectContaining({
        matchId: 'lp-match-1',
        teamAName: 'Team Liquid',
        teamBName: 'Team Falcons',
        eventName: 'Riyadh Masters',
        format: 'BO3',
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ href: expect.stringContaining('/api/v3/match?') }),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Apikey test-key' }),
      }),
    );
  });

  it('does not claim schedule support without a Liquipedia DB key', async () => {
    const client = new LiquipediaClient({ dbApiKey: '', minIntervalMs: 0 });

    expect(client.isMatchScheduleConfigured()).toBe(false);
    await expect(client.getUpcomingMatches()).rejects.toThrow(/LIQUIPEDIA_DB_API_KEY/);
  });

  it('loads public upcoming schedules from the rendered matches page', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      parse: { text: upcomingMatchesHtml },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new LiquipediaClient({
      game: 'dota2',
      apiUrl: 'https://liquipedia.test/dota2/api.php',
      minIntervalMs: 0,
    });

    const matches = await client.getPublicUpcomingMatches(10, new Date('2026-07-23T06:00:00Z'));

    expect(matches).toEqual([
      expect.objectContaining({
        matchId: 'NnV02jmwdD_0001',
        teamAId: 'Dandelions',
        teamAName: 'Dandelions',
        teamBId: 'Zero Tenacity',
        eventName: 'EPL Masters I: Play-In - July 23',
        format: 'BO3',
        date: '2026-07-23T07:00:00.000Z',
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('action=parse'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Accept-Encoding': 'gzip, deflate, br' }),
      }),
    );
  });

  it('expands ActiveSquadAuto for LoL and VALORANT roster pages', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        query: { pages: [{ revisions: [{ slots: { main: { content: '==Player Roster==\n===Active Roster===\n{{ActiveSquadAuto}}\n===Timeline===' } } }] }] },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
          expandtemplates: {
            wikitext: '<table><tr class="table2__row--body"><td>[[File:kr_hd.png|South Korea]] [[Faker|Faker]]</td><td>Lee Sang-hyeok</td><td>Mid</td><td>2013-02-13</td></tr></table>',
          },
      }), { status: 200 }));
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

describe('parseUpcomingMatchesHtml', () => {
  it('filters completed rows and preserves even best-of formats', () => {
    const html = `${upcomingMatchesHtml}<div class="match-info">
      <span class="timer-object" data-timestamp="1784793600" data-finished="finished"></span>
      <div class="match-info-header-opponent"><span class="name"><a title="Old A">A</a></span></div>
      <div class="match-info-header-opponent"><span class="name"><a title="Old B">B</a></span></div>
    </div>`;

    const rows = parseUpcomingMatchesHtml(html, 'dota2', new Date('2026-07-23T06:00:00Z'));

    expect(rows).toHaveLength(1);
    expect(rows[0].format).toBe('BO3');
  });

  it('parses recent finished rows with their series score', () => {
    const finished = `<div class="match-info">
      <span class="timer-object" data-timestamp="1784700000" data-finished="finished"></span>
      <div class="match-info-header-opponent"><span class="name"><a href="/valorant/Alpha" title="Alpha">Alpha</a></span></div>
      <div class="match-info-header-scoreholder">
        <span class="match-info-header-scoreholder-score">2</span>
        <span class="match-info-header-scoreholder-score">1</span>
        <span class="match-info-header-scoreholder-lower">(Bo3)</span>
      </div>
      <div class="match-info-header-opponent"><span class="name"><a href="/valorant/Beta" title="Beta">Beta</a></span></div>
      <div class="match-info-tournament-name"><a href="/valorant/Event"><span>Event</span></a></div>
      <div class="match-info-links"><a href="/valorant/Match:ID_result-1" title="Match:ID result-1">details</a></div>
    </div>`;

    expect(parseRecentMatchesHtml(finished, 'valorant', new Date('2026-07-23T00:00:00Z'))[0]).toMatchObject({
      matchId: 'result-1',
      status: 'finished',
      scoreA: 2,
      scoreB: 1,
    });
  });
});

const upcomingMatchesHtml = `
<div class="match-info">
  <span class="match-info-countdown"><span class="timer-object" data-timestamp="1784790000"></span></span>
  <div class="match-info-header">
    <div class="match-info-header-opponent match-info-header-opponent-left"><span class="name"><a href="/dota2/Dandelions" title="Dandelions">Dd</a></span></div>
    <div class="match-info-header-scoreholder"><span class="match-info-header-scoreholder-lower">(Bo3)</span></div>
    <div class="match-info-header-opponent"><span class="name"><a href="/dota2/Zero_Tenacity" title="Zero Tenacity">Z10</a></span></div>
  </div>
  <div class="match-info-tournament"><span class="match-info-tournament-name"><a href="/dota2/EPL/Masters/1/Play-In#July_23" title="EPL/Masters/1/Play-In"><span>EPL Masters I: Play-In - July 23</span></a></span></div>
  <div class="match-info-links"><a href="/dota2/index.php?title=Match:ID_NnV02jmwdD_0001&amp;action=edit" title="Match:ID NnV02jmwdD 0001">details</a></div>
</div>`;
