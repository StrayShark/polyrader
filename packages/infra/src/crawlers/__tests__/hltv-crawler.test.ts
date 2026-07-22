import { describe, expect, it } from 'vitest';
import {
  parseHltvMatchDetailHtml,
  parseHltvMatchOutcomeHtml,
  parseHltvMatchesHtml,
  parseHltvResultsHtml,
  parseHltvTeamHtml,
} from '../hltv-crawler';

describe('HLTV current markup parsers', () => {
  it('reads canonical IDs, names, URL and millisecond timestamps from match wrappers', () => {
    const matches = parseHltvMatchesHtml(`
      <div data-zonedgrouping-entry-unix="1784016000000">
        <div data-match-wrapper data-match-id="2395534" team1="4869" team2="13214" lan="false" data-stars="2">
          <a class="match" href="/matches/2395534/ence-vs-sparta-european-pro-league-series-8">
            <div class="match-teamname">ENCE</div>
            <div class="match-teamname">SPARTA</div>
            <div class="match-event">European Pro League Series 8</div>
            <div class="match-meta">bo3</div>
          </a>
        </div>
      </div>
    `);

    expect(matches).toEqual([expect.objectContaining({
      matchId: '2395534',
      teamAId: '4869',
      teamBId: '13214',
      teamAName: 'ENCE',
      teamBName: 'SPARTA',
      eventType: 'Online',
      format: 'BO3',
      date: '2026-07-14T08:00:00.000Z',
      stars: 2,
      url: 'https://www.hltv.org/matches/2395534/ence-vs-sparta-european-pro-league-series-8',
    })]);
  });

  it('reads team IDs, ranks and rated five-player lineups from a match page', () => {
    const playerCells = (side: number) => Array.from({ length: 5 }, (_value, index) =>
      `<div class="player-compare flagAlign" data-player-id="${side}${index}"><div class="text-ellipsis">P${side}${index}</div></div>`,
    ).join('');
    const stats = (side: number) => JSON.stringify(Object.fromEntries(
      Array.from({ length: 5 }, (_value, index) => [`${side}${index}`, { nickname: `P${side}${index}`, numericRating: 1 + index / 100 }]),
    ));
    const detail = parseHltvMatchDetailHtml(`
      <div class="teamsBox">
        <div class="team1-gradient"><a href="/team/4869/ence"><div class="teamName">ENCE</div></a></div>
        <div class="timeAndEvent"><div data-unix="1784016000000"></div><div class="event"><a>European Pro League Series 8</a></div></div>
        <div class="team2-gradient"><a href="/team/13214/sparta"><div class="teamName">SPARTA</div></a></div>
      </div>
      <div>Best of 3</div>
      <div class="lineups">
        <div class="lineup standard-box"><div class="teamRanking">World rank: #163</div>${playerCells(1)}</div>
        <div class="lineup standard-box"><div class="teamRanking">World rank: #103</div>${playerCells(2)}</div>
        <div class="lineups-compare-container" data-team1-players-data='${stats(1)}' data-team2-players-data='${stats(2)}'></div>
      </div>
    `, '2395534', 'https://www.hltv.org/matches/2395534/example');

    expect(detail).toMatchObject({
      teamAId: '4869',
      teamBId: '13214',
      teamARank: 163,
      teamBRank: 103,
      date: '2026-07-14T08:00:00.000Z',
      format: 'BO3',
    });
    expect(detail.lineups?.teamA.players).toHaveLength(5);
    expect(detail.lineups?.teamB.players[4]).toMatchObject({ playerId: '24', rating: 1.04 });
    expect(detail.lineups?.teamA.isConfirmed).toBe(true);
  });

  it('reads world rank, active roster and map records from the team overview', () => {
    const team = parseHltvTeamHtml(`
      <h1 class="profile-team-name">ENCE</h1>
      <div class="profile-team-logo-container"><img data-cookieblock-src="//img-cdn.hltv.org/teamlogo/ence.png"></div>
      <div class="profile-team-stat"><span>World ranking</span><span class="right">#163</span></div>
      <div class="bodyshot-team">
        <a href="/player/18848/henu"><img title="Henri 'HENU' Ylilehto">HENU</a>
        <a href="/player/21930/millert"><img title="Aleksi 'millert' Lehtopuu">millert</a>
        <a href="/player/22733/teme"><img title="Teemu 'teme' Korva">teme</a>
        <a href="/player/24121/cliqq"><img title="Niki 'Cliqq' Kinnunen">Cliqq</a>
        <a href="/player/24149/schwarz"><img title="Giorgi 'Schwarz' Gakhokidze">Schwarz</a>
      </div>
      <div class="map-statistics-container">
        <div class="map-statistics-row-map-mapname">Nuke</div>
        <div class="map-statistics-row-win-percentage">66.7%</div>
        <div class="map-statistics-extended-wdl"><span class="stat">4</span><span class="stat">0</span><span class="stat">2</span></div>
      </div>
    `, '4869');

    expect(team.rank).toBe(163);
    expect(team.logo).toBe('https://img-cdn.hltv.org/teamlogo/ence.png');
    expect(team.players).toHaveLength(5);
    expect(team.players[0]).toMatchObject({ playerId: '18848', nickname: 'HENU', name: 'Henri Ylilehto', rating: 0 });
    expect(team.mapPool.maps[0]).toMatchObject({ map: 'Nuke', winRate: 0.667, matchesPlayed: 6 });
  });

  it('aligns recent result scores and outcomes to the requested team', () => {
    const form = parseHltvResultsHtml(`
      <div class="result-con" data-zonedgrouping-entry-unix="1783850533000">
        <div class="team team-won">ENCE</div><div class="result-score"><span>2</span><span>0</span></div><div class="team">eternal premium</div>
        <span class="event-name">European Pro League Series 8</span>
      </div>
      <div class="result-con" data-zonedgrouping-entry-unix="1783514540000">
        <div class="team">ENCE</div><div class="result-score"><span>0</span><span>2</span></div><div class="team team-won">SPARTA</div>
        <span class="event-name">European Pro League Series 8</span>
      </div>
    `, 'ENCE');

    expect(form.last10Matches).toEqual([
      expect.objectContaining({ opponent: 'eternal premium', result: 'win', score: '2-0' }),
      expect.objectContaining({ opponent: 'SPARTA', result: 'loss', score: '0-2' }),
    ]);
    expect(form.winRate).toBe(0.5);
    expect(form.streak).toBe(1);
  });
});

describe('parseHltvMatchOutcomeHtml', () => {
  it('reads the series winner only from the match header', () => {
    const result = parseHltvMatchOutcomeHtml(`
      <body>Match over
        <div class="team1-gradient"><a href="/team/4869/ence"><div class="teamName">ENCE</div></a><span class="lost spoiler">0</span></div>
        <div class="team2-gradient"><a href="/team/13214/sparta"><div class="teamName">SPARTA</div></a><span class="won spoiler">2</span></div>
        <div class="mapholder"><span class="won">13</span><span class="lost">8</span></div>
      </body>
    `, '2395534');

    expect(result).toMatchObject({
      status: 'finished',
      teamAId: '4869',
      teamBId: '13214',
      teamAScore: 0,
      teamBScore: 2,
      winnerTeamId: '13214',
      winnerTeamName: 'SPARTA',
      maps: [
        expect.objectContaining({ mapNumber: 1, winnerTeamName: 'ENCE', teamARounds: 13, teamBRounds: 8 }),
      ],
    });
  });

  it('parses structured mapholder results with team names', () => {
    const result = parseHltvMatchOutcomeHtml(`
      <body>Match over
        <div class="team1-gradient"><a href="/team/4869/ence"><div class="teamName">ENCE</div></a><span class="lost spoiler">1</span></div>
        <div class="team2-gradient"><a href="/team/13214/sparta"><div class="teamName">SPARTA</div></a><span class="won spoiler">2</span></div>
        <div class="mapholder">
          <div class="mapname">Mirage</div>
          <div class="results played">
            <div class="results-left won"><div class="results-teamname">ENCE</div><div class="results-teamscore">13</div></div>
            <div class="results-right lost"><div class="results-teamname">SPARTA</div><div class="results-teamscore">10</div></div>
          </div>
        </div>
        <div class="mapholder">
          <div class="mapname">Inferno</div>
          <div class="results played">
            <div class="results-left lost"><div class="results-teamname">ENCE</div><div class="results-teamscore">8</div></div>
            <div class="results-right won"><div class="results-teamname">SPARTA</div><div class="results-teamscore">13</div></div>
          </div>
        </div>
        <div class="mapholder">
          <div class="mapname">Nuke</div>
          <div class="results played">
            <div class="results-left lost"><div class="results-teamname">ENCE</div><div class="results-teamscore">11</div></div>
            <div class="results-right won"><div class="results-teamname">SPARTA</div><div class="results-teamscore">13</div></div>
          </div>
        </div>
      </body>
    `, '2395534');

    expect(result.maps).toEqual([
      { mapNumber: 1, mapName: 'Mirage', winnerTeamName: 'ENCE', teamARounds: 13, teamBRounds: 10 },
      { mapNumber: 2, mapName: 'Inferno', winnerTeamName: 'SPARTA', teamARounds: 8, teamBRounds: 13 },
      { mapNumber: 3, mapName: 'Nuke', winnerTeamName: 'SPARTA', teamARounds: 11, teamBRounds: 13 },
    ]);
  });

  it('treats cancelled and postponed as terminal scheduling states without a winner', () => {
    expect(parseHltvMatchOutcomeHtml('<body><div class="countdown">Match cancelled</div></body>', '1').status).toBe('cancelled');
    expect(parseHltvMatchOutcomeHtml('<body><div class="timeAndEvent">Match postponed</div></body>', '2').status).toBe('postponed');
  });

  it('ignores cancellation words in user comments when the header says match over', () => {
    const result = parseHltvMatchOutcomeHtml(`
      <div class="teamsBox">
        <div class="team1-gradient"><a href="/team/1/a"><div class="teamName">A</div></a><span class="lost">0</span></div>
        <div class="countdown">Match over</div>
        <div class="team2-gradient"><a href="/team/2/b"><div class="teamName">B</div></a><span class="won">2</span></div>
      </div>
      <div class="comments">My bet got canceled</div>
    `, '3');
    expect(result).toMatchObject({ status: 'finished', winnerTeamName: 'B' });
  });
});
