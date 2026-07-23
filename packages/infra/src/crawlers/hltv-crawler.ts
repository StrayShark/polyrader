import * as cheerio from 'cheerio';
import { fetchTextPolitely } from './polite-fetch';
import type { Team, Player, RecentForm, MatchResult, MapStat, HeadToHead, Lineup, LineupPlayer } from '@polyrader/core';

const HLTV_BASE = 'https://www.hltv.org';

export interface HltvMatchSummary {
  matchId: string;
  teamAId: string;
  teamBId: string;
  teamAName: string;
  teamBName: string;
  event: string;
  eventType: 'LAN' | 'Online';
  format: 'BO1' | 'BO3' | 'BO5';
  date: string;
  stars: number; // HLTV star rating (match importance)
  url: string;
}

export interface HltvMatchDetail {
  matchId: string;
  teamA: string;
  teamB: string;
  maps: string[];
  format: string;
  event: string;
  date: string;
  teamAId: string;
  teamBId: string;
  teamARank: number;
  teamBRank: number;
  url: string;
  lineups: { teamA: Lineup; teamB: Lineup } | null;
}

export interface HltvCommunityPrediction {
  matchId: string;
  teamAProb: number;
  teamBProb: number;
  teamAName: string;
  teamBName: string;
}

export type HltvMatchLiveStatus = 'upcoming' | 'live' | 'finished' | 'postponed' | 'cancelled';

export interface HltvMapResult {
  mapNumber: number;
  mapName?: string;
  winnerTeamName?: string;
  teamARounds?: number;
  teamBRounds?: number;
}

export interface HltvMatchOutcome {
  matchId: string;
  available: boolean;
  status: HltvMatchLiveStatus;
  teamAId: string;
  teamBId: string;
  teamAName: string;
  teamBName: string;
  teamAScore?: number;
  teamBScore?: number;
  winnerTeamId?: string;
  winnerTeamName?: string;
  maps?: HltvMapResult[];
  url: string;
}

/**
 * Parse a team ID from an HLTV team URL.
 * e.g. "/team/9565/vitality" → "9565"
 */
function parseTeamId(href: string): string {
  const match = href.match(/\/team\/(\d+)/);
  return match ? match[1] : '';
}

/**
 * Parse a match ID from an HLTV match URL.
 * e.g. "/matches/2395371/inner-circle-vs-am-..." → "2395371"
 */
function parseMatchId(href: string): string {
  const match = href.match(/\/matches\/(\d+)/);
  return match ? match[1] : '';
}

function toIsoDate(raw: string | undefined): string {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return '';
  const milliseconds = value >= 1_000_000_000_000 ? value : value * 1000;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function absoluteHltvUrl(href: string): string {
  if (!href) return '';
  return href.startsWith('http') ? href : `${HLTV_BASE}${href.startsWith('/') ? href : `/${href}`}`;
}

function absoluteHltvAssetUrl(src: string): string {
  if (!src) return '';
  if (src.startsWith('//')) return `https:${src}`;
  if (src.startsWith('http')) return src;
  return `${HLTV_BASE}${src.startsWith('/') ? src : `/${src}`}`;
}

function parseFormat(text: string): HltvMatchSummary['format'] {
  const bestOf = text.match(/best\s+of\s+([135])/i)?.[1];
  const bo = text.match(/\bbo([135])\b/i)?.[1];
  return `BO${bestOf ?? bo ?? '3'}` as HltvMatchSummary['format'];
}

function parseRank(text: string): number {
  const value = Number(text.match(/#\s*(\d+)/)?.[1]);
  return Number.isFinite(value) && value > 0 ? value : 999;
}

function emptyRecentForm(): RecentForm {
  return { last10Matches: [], winRate: 0.5, streak: 0, averageRating: 0 };
}

/** Parse the current HLTV matches markup without performing network I/O. */
export function parseHltvMatchesHtml(html: string): HltvMatchSummary[] {
  const $ = cheerio.load(html);
  const matches: HltvMatchSummary[] = [];
  const seen = new Set<string>();

  $('[data-match-wrapper]').each((_index, element) => {
    const wrapper = $(element);
    const href = wrapper.find('a[href*="/matches/"]').first().attr('href') ?? '';
    const matchId = wrapper.attr('data-match-id') ?? parseMatchId(href);
    if (!matchId || seen.has(matchId)) return;

    const names = wrapper.find('.match-teamname').map((_i, team) => $(team).text().trim()).get();
    if (!names[0] || !names[1]) return;

    const grouping = wrapper.closest('[data-zonedgrouping-entry-unix]');
    const rawDate = wrapper.find('[data-unix]').first().attr('data-unix')
      ?? grouping.attr('data-zonedgrouping-entry-unix');
    const meta = wrapper.find('.match-meta').first().text().trim();
    const event = wrapper.find('.match-event').first().text().trim() || 'Unknown Event';
    const lan = wrapper.attr('lan') === 'true';

    seen.add(matchId);
    matches.push({
      matchId,
      teamAId: wrapper.attr('team1') ?? '',
      teamBId: wrapper.attr('team2') ?? '',
      teamAName: names[0],
      teamBName: names[1],
      event,
      eventType: lan ? 'LAN' : 'Online',
      format: parseFormat(meta),
      date: toIsoDate(rawDate),
      stars: Number(wrapper.attr('data-stars')) || wrapper.find('.match-stars i.fa-star').length,
      url: absoluteHltvUrl(href),
    });
  });

  return matches.sort((a, b) => b.stars - a.stars || a.date.localeCompare(b.date));
}

function parseLineupPlayers(
  $: cheerio.CheerioAPI,
  lineup: ReturnType<cheerio.CheerioAPI>,
  stats: Record<string, Record<string, unknown>>,
): LineupPlayer[] {
  const players: LineupPlayer[] = [];
  const seen = new Set<string>();
  lineup.find('.player-compare.flagAlign[data-player-id]').each((_index, element) => {
    const playerId = $(element).attr('data-player-id') ?? '';
    if (!playerId || seen.has(playerId)) return;
    const nickname = $(element).find('.text-ellipsis').first().text().trim()
      || String(stats[playerId]?.nickname ?? '');
    if (!nickname) return;
    const rating = Number(stats[playerId]?.numericRating ?? stats[playerId]?.rating) || 0;
    seen.add(playerId);
    players.push({
      playerId,
      nickname,
      rating,
      role: 'Rifler',
      isStandin: $(element).text().toLowerCase().includes('stand-in'),
      impactScore: rating > 0 ? Math.min(100, Math.round(rating * 80)) : 0,
      mapsOnRecord: 0,
    });
  });
  return players.slice(0, 5);
}

function parsePlayerStatsJson(raw: string | undefined): Record<string, Record<string, unknown>> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, Record<string, unknown>>;
  } catch {
    return {};
  }
}

/** Parse a current HLTV match page, including both confirmed five-player lineups. */
export function parseHltvMatchDetailHtml(html: string, matchId: string, url = ''): HltvMatchDetail {
  const $ = cheerio.load(html);
  const teamAAnchor = $('.teamsBox .team1-gradient a[href*="/team/"]').first();
  const teamBAnchor = $('.teamsBox .team2-gradient a[href*="/team/"]').first();
  const teamA = teamAAnchor.find('.teamName').text().trim() || teamAAnchor.text().trim();
  const teamB = teamBAnchor.find('.teamName').text().trim() || teamBAnchor.text().trim();
  const event = $('.timeAndEvent .event a, .timeAndEvent .event').first().text().trim()
    || $('.event-name').first().text().trim();
  const date = toIsoDate($('.timeAndEvent [data-unix]').first().attr('data-unix'));
  const bodyText = $('body').text();
  const maps: string[] = [];
  $('.mapholder .mapname, .mapholder .map-name, .map-name').each((_index, element) => {
    const map = $(element).text().trim();
    if (map && map.toLowerCase() !== 'tba' && !maps.includes(map)) maps.push(map);
  });

  const compare = $('.lineups-compare-container').first();
  const teamAStats = parsePlayerStatsJson(compare.attr('data-team1-players-data'));
  const teamBStats = parsePlayerStatsJson(compare.attr('data-team2-players-data'));
  const lineupElements = $('.lineups .lineup.standard-box');
  const teamAPlayers = parseLineupPlayers($, lineupElements.eq(0), teamAStats);
  const teamBPlayers = parseLineupPlayers($, lineupElements.eq(1), teamBStats);
  const lineups = teamAPlayers.length || teamBPlayers.length ? {
    teamA: buildLineup(teamAPlayers),
    teamB: buildLineup(teamBPlayers),
  } : null;

  return {
    matchId,
    teamA,
    teamB,
    maps,
    format: parseFormat(bodyText),
    event,
    date,
    teamAId: parseTeamId(teamAAnchor.attr('href') ?? ''),
    teamBId: parseTeamId(teamBAnchor.attr('href') ?? ''),
    teamARank: parseRank(lineupElements.eq(0).find('.teamRanking').text()),
    teamBRank: parseRank(lineupElements.eq(1).find('.teamRanking').text()),
    url,
    lineups,
  };
}

/** Parse authoritative series status and result from the match page header. */
export function parseHltvMatchOutcomeHtml(html: string, matchId: string, url = ''): HltvMatchOutcome {
  const $ = cheerio.load(html);
  const pageText = $('body').text().replace(/\s+/g, ' ').trim().toLowerCase();
  const statusText = $('.countdown, .timeAndEvent, .teamsBox').text().replace(/\s+/g, ' ').trim().toLowerCase();
  const teamABox = $('.team1-gradient').first();
  const teamBBox = $('.team2-gradient').first();
  const teamAAnchor = teamABox.find('a[href*="/team/"]').first();
  const teamBAnchor = teamBBox.find('a[href*="/team/"]').first();
  const teamAName = teamABox.find('.teamName, .team-name').first().text().trim()
    || teamAAnchor.text().trim();
  const teamBName = teamBBox.find('.teamName, .team-name').first().text().trim()
    || teamBAnchor.text().trim();
  const teamAScoreNode = teamABox.find('.won, .lost').first();
  const teamBScoreNode = teamBBox.find('.won, .lost').first();
  const teamAScore = parseSeriesScore(teamAScoreNode.text());
  const teamBScore = parseSeriesScore(teamBScoreNode.text());

  let status: HltvMatchLiveStatus = 'upcoming';
  if (/\b(cancelled|canceled)\b/.test(statusText)) status = 'cancelled';
  else if (/\b(postponed|delayed|rescheduled)\b/.test(statusText)) status = 'postponed';
  else if (
    /\bmatch over\b/.test(statusText || pageText)
    || (teamAScore !== undefined && teamBScore !== undefined
      && (teamAScoreNode.hasClass('won') || teamBScoreNode.hasClass('won')))
  ) status = 'finished';
  else if (
    $('.live-indicator, .match-page-live, .standard-box .live').length > 0
    || $('.countdown').first().text().toLowerCase().includes('live')
  ) status = 'live';

  const winnerSide = status === 'finished'
    ? teamAScoreNode.hasClass('won') || (teamAScore !== undefined && teamBScore !== undefined && teamAScore > teamBScore)
      ? 'a'
      : teamBScoreNode.hasClass('won') || (teamAScore !== undefined && teamBScore !== undefined && teamBScore > teamAScore)
        ? 'b'
        : undefined
    : undefined;

  const maps = parseHltvMapResults($, teamAName, teamBName);

  return {
    matchId,
    available: true,
    status,
    teamAId: parseTeamId(teamAAnchor.attr('href') ?? ''),
    teamBId: parseTeamId(teamBAnchor.attr('href') ?? ''),
    teamAName,
    teamBName,
    teamAScore,
    teamBScore,
    winnerTeamId: winnerSide === 'a'
      ? parseTeamId(teamAAnchor.attr('href') ?? '')
      : winnerSide === 'b' ? parseTeamId(teamBAnchor.attr('href') ?? '') : undefined,
    winnerTeamName: winnerSide === 'a' ? teamAName : winnerSide === 'b' ? teamBName : undefined,
    maps: maps.length > 0 ? maps : undefined,
    url,
  };
}

function parseHltvMapResults(
  $: cheerio.CheerioAPI,
  teamAName: string,
  teamBName: string,
): HltvMapResult[] {
  const maps: HltvMapResult[] = [];
  $('.mapholder').each((index, element) => {
    const holder = $(element);
    const mapName = holder.find('.mapname, .map-name').first().text().replace(/\s+/g, ' ').trim() || undefined;
    const results = holder.find('.results').first();
    if (results.length === 0 && holder.find('.won, .lost').length === 0) return;

    const left = results.find('.results-left').first();
    const right = results.find('.results-right').first();
    let teamARounds: number | undefined;
    let teamBRounds: number | undefined;
    let winnerTeamName: string | undefined;

    if (left.length && right.length) {
      const leftScore = parseSeriesScore(left.find('.results-teamscore, .results-score').first().text() || left.text());
      const rightScore = parseSeriesScore(right.find('.results-teamscore, .results-score').first().text() || right.text());
      const leftName = left.find('.results-teamname').first().text().trim();
      const rightName = right.find('.results-teamname').first().text().trim();
      const leftIsA = namesRoughlyMatch(leftName, teamAName) || (!namesRoughlyMatch(leftName, teamBName) && !namesRoughlyMatch(rightName, teamAName));
      teamARounds = leftIsA ? leftScore : rightScore;
      teamBRounds = leftIsA ? rightScore : leftScore;
      if (left.hasClass('won') || right.hasClass('lost')) {
        winnerTeamName = leftIsA ? teamAName : teamBName;
      } else if (right.hasClass('won') || left.hasClass('lost')) {
        winnerTeamName = leftIsA ? teamBName : teamAName;
      } else if (teamARounds !== undefined && teamBRounds !== undefined && teamARounds !== teamBRounds) {
        winnerTeamName = teamARounds > teamBRounds ? teamAName : teamBName;
      }
    } else {
      const scores = holder.find('.won, .lost');
      if (scores.length >= 2) {
        const first = scores.eq(0);
        const second = scores.eq(1);
        teamARounds = parseSeriesScore(first.text());
        teamBRounds = parseSeriesScore(second.text());
        if (first.hasClass('won')) winnerTeamName = teamAName;
        else if (second.hasClass('won')) winnerTeamName = teamBName;
        else if (teamARounds !== undefined && teamBRounds !== undefined && teamARounds !== teamBRounds) {
          winnerTeamName = teamARounds > teamBRounds ? teamAName : teamBName;
        }
      }
    }

    if (!winnerTeamName && teamARounds === undefined && teamBRounds === undefined && !mapName) return;
    maps.push({
      mapNumber: index + 1,
      mapName,
      winnerTeamName,
      teamARounds,
      teamBRounds,
    });
  });
  return maps.filter((map) => map.winnerTeamName || map.teamARounds !== undefined);
}

function namesRoughlyMatch(a: string, b: string): boolean {
  const left = a.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const right = b.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function parseSeriesScore(value: string): number | undefined {
  const score = Number(value.trim());
  return Number.isInteger(score) && score >= 0 ? score : undefined;
}

function buildLineup(players: LineupPlayer[]): Lineup {
  const standinCount = players.filter((player) => player.isStandin).length;
  return {
    players,
    isConfirmed: players.length >= 5,
    hasStandin: standinCount > 0,
    standinCount,
    missingKeyPlayers: [],
  };
}

function parseRealName(title: string, nickname: string): string {
  if (!title) return '';
  const escapedNickname = nickname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return title.replace(new RegExp(`['\"]${escapedNickname}['\"]`, 'i'), '').replace(/\s+/g, ' ').trim();
}

/** Parse team identity, world rank, active roster and the three-month map pool. */
export function parseHltvTeamHtml(html: string, teamId: string): Team {
  const $ = cheerio.load(html);
  const logo = $('.profile-team-logo-container img, img.teamlogo').first();
  const name = $('.profile-team-name, .team-name, h1').first().text().trim();
  let rank = 999;
  $('.profile-team-stat').each((_index, element) => {
    const text = $(element).text().replace(/\s+/g, ' ').trim();
    if (text.toLowerCase().includes('world ranking')) rank = parseRank(text);
  });

  const players: Player[] = [];
  const seen = new Set<string>();
  $('.bodyshot-team a[href*="/player/"]').each((_index, element) => {
    const href = $(element).attr('href') ?? '';
    const playerId = href.match(/\/player\/(\d+)/)?.[1] ?? '';
    const nickname = $(element).text().replace(/\s+/g, ' ').trim();
    if (!playerId || !nickname || seen.has(playerId)) return;
    const title = $(element).find('img[title]').attr('title') ?? '';
    seen.add(playerId);
    players.push({
      playerId,
      name: parseRealName(title, nickname),
      nickname,
      rating: 0,
      kdRatio: 0,
      headshotPercent: 0,
      mapsPlayed: 0,
      role: '',
    });
  });

  const maps: MapStat[] = [];
  $('.map-statistics-container').each((_index, element) => {
    const container = $(element);
    const map = container.find('.map-statistics-row-map-mapname').first().text().trim();
    const winRate = Number(container.find('.map-statistics-row-win-percentage').first().text().replace('%', '').trim()) / 100;
    const counts = container.find('.map-statistics-extended-wdl .stat').map((_i, stat) => Number($(stat).text().trim()) || 0).get();
    if (!map) return;
    maps.push({
      map,
      winRate: Number.isFinite(winRate) ? winRate : 0,
      matchesPlayed: (counts[0] ?? 0) + (counts[1] ?? 0) + (counts[2] ?? 0),
      roundsWon: 0,
      roundsLost: 0,
    });
  });

  return {
    teamId,
    name,
    logo: absoluteHltvAssetUrl(logo.attr('src') ?? logo.attr('data-cookieblock-src') ?? ''),
    rank,
    region: $('.profile-team-country .flag, .team-country .flag').first().attr('title') ?? '',
    players,
    recentForm: emptyRecentForm(),
    mapPool: { maps },
    headToHead: [],
  };
}

/** Parse the most recent results page for one team. */
export function parseHltvResultsHtml(html: string, teamName: string): RecentForm {
  const $ = cheerio.load(html);
  const normalizedTeam = teamName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const results: MatchResult[] = [];

  $('.result-con').each((_index, element) => {
    if (results.length >= 10) return;
    const result = $(element);
    const teams = result.find('.team').map((_i, team) => $(team).text().trim()).get();
    if (teams.length < 2) return;
    let ownIndex = teams.findIndex((team) => team.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedTeam);
    if (ownIndex < 0) ownIndex = 0;
    const opponentIndex = ownIndex === 0 ? 1 : 0;
    const teamElements = result.find('.team');
    const ownWon = teamElements.eq(ownIndex).hasClass('team-won');
    const opponentWon = teamElements.eq(opponentIndex).hasClass('team-won');
    const scores = result.find('.result-score span').map((_i, score) => $(score).text().trim()).get();
    results.push({
      opponent: teams[opponentIndex],
      result: ownWon ? 'win' : opponentWon ? 'loss' : 'draw',
      score: scores.length >= 2 ? `${scores[ownIndex]}-${scores[opponentIndex]}` : result.find('.result-score').text().replace(/\s+/g, ' ').trim(),
      date: toIsoDate(result.attr('data-zonedgrouping-entry-unix')),
      event: result.find('.event-name').first().text().trim(),
    });
  });

  const wins = results.filter((result) => result.result === 'win').length;
  let streak = 0;
  for (const result of results) {
    if (result.result !== 'win') break;
    streak++;
  }
  return {
    last10Matches: results,
    winRate: results.length ? wins / results.length : 0.5,
    streak,
    averageRating: 0,
  };
}

export class HLTVCrawler {
  /**
   * Get the current HLTV world ranking.
   * Uses Playwright to bypass Cloudflare, then extracts data via page.evaluate.
   */
  async getRankings(): Promise<Array<{ rank: number; teamId: string; name: string }>> {
    const html = await fetchTextPolitely(`${HLTV_BASE}/ranking/teams`);
    const $ = cheerio.load(html);

    const rankings: Array<{ rank: number; teamId: string; name: string }> = [];

    $('.ranked-team').each((_i, el) => {
      const rankText = $(el).find('.position').text().trim().replace('#', '');
      // Team name: try multiple selectors for the new page structure
      const name = $(el).find('.name, .team-ranking-header, .team-name, img[title]').attr('title')
        || $(el).find('.name').text().trim()
        || $(el).find('.team-name').text().trim();
      // Team ID: extract from any team link href
      const teamHref = $(el).find('a[href*="/team/"]').attr('href') ?? '';
      const teamId = parseTeamId(teamHref);

      if (rankText && name) {
        rankings.push({ rank: parseInt(rankText, 10), teamId, name });
      }
    });

    return rankings;
  }

  /**
   * Get upcoming matches with star ratings.
   * Returns all upcoming matches sorted by star rating (importance).
   */
  async getMatches(): Promise<HltvMatchSummary[]> {
    const html = await fetchTextPolitely(`${HLTV_BASE}/matches`);
    return parseHltvMatchesHtml(html);
  }

  /**
   * Get high-importance matches (3+ stars, LAN events, BO3/BO5).
   * These are the matches worth fetching detailed team data for.
   */
  getHighProfileMatches(matches: HltvMatchSummary[]): HltvMatchSummary[] {
    return matches.filter((m) => {
      // LAN events are always high profile
      if (m.eventType === 'LAN') return true;
      // 3+ star matches
      if (m.stars >= 3) return true;
      // BO5 matches
      if (m.format === 'BO5') return true;
      return false;
    });
  }

  /**
   * Get match details including map picks and team IDs.
   */
  async getMatchDetail(matchId: string, matchUrl?: string): Promise<HltvMatchDetail> {
    const url = await this.resolveMatchUrl(matchId, matchUrl);
    const html = await fetchTextPolitely(url);
    return parseHltvMatchDetailHtml(html, matchId, url);
  }

  /**
   * HLTV community "Pick a winner" vote percentages.
   * Selectors follow the public HLTV match page structure.
   */
  async getCommunityPrediction(matchId: string): Promise<HltvCommunityPrediction | null> {
    try {
      const html = await fetchTextPolitely(await this.resolveMatchUrl(matchId));
      const $ = cheerio.load(html);
      if (!$('.pick-a-winner').length) return null;

      const parsePct = (selector: string): number | null => {
        const text = $(selector).first().text().trim().replace('%', '');
        const n = parseFloat(text);
        return Number.isFinite(n) ? n / 100 : null;
      };

      let teamAProb = parsePct('.pick-a-winner-team.team1 > .percentage')
        ?? parsePct('.pick-a-winner .team1 .percentage');
      let teamBProb = parsePct('.pick-a-winner-team.team2 > .percentage')
        ?? parsePct('.pick-a-winner .team2 .percentage');

      if (teamAProb === null || teamBProb === null) return null;

      const sum = teamAProb + teamBProb;
      if (sum <= 0) return null;

      teamAProb /= sum;
      teamBProb /= sum;

      const teamAName = $('.pick-a-winner-team.team1 .team-name, .team1-gradient .team-name').first().text().trim()
        || $('.team1 .team-name').first().text().trim();
      const teamBName = $('.pick-a-winner-team.team2 .team-name, .team2-gradient .team-name').first().text().trim()
        || $('.team2 .team-name').first().text().trim();

      return { matchId, teamAProb, teamBProb, teamAName, teamBName };
    } catch {
      return null;
    }
  }

  /**
   * Find an upcoming HLTV match ID by fuzzy team name match.
   */
  async findMatchIdByTeams(teamAName: string, teamBName: string): Promise<string | null> {
    try {
      const matches = await this.getMatches();
      for (const m of matches) {
        const direct = this.teamsMatch(m.teamAName, teamAName) && this.teamsMatch(m.teamBName, teamBName);
        const swapped = this.teamsMatch(m.teamAName, teamBName) && this.teamsMatch(m.teamBName, teamAName);
        if (direct || swapped) return m.matchId;
      }
    } catch {
      // ignore
    }
    return null;
  }

  /**
   * Community vote probability for team A (0-1), aligned to the given team names.
   */
  async getCommunityProbForTeams(teamAName: string, teamBName: string, hltvMatchId?: string): Promise<number | undefined> {
    const matchId = hltvMatchId ?? await this.findMatchIdByTeams(teamAName, teamBName);
    if (!matchId) return undefined;

    const pred = await this.getCommunityPrediction(matchId);
    if (!pred) return undefined;

    const hltvAIsOurA = this.teamsMatch(pred.teamAName || teamAName, teamAName)
      || this.teamsMatch(pred.teamAName, teamAName);
    const hltvAIsOurB = this.teamsMatch(pred.teamAName || teamBName, teamBName);

    if (hltvAIsOurA) return pred.teamAProb;
    if (hltvAIsOurB) return pred.teamBProb;
    return pred.teamAProb;
  }

  async getMatchOutcome(matchId: string, matchUrl?: string): Promise<HltvMatchOutcome> {
    try {
      const url = matchUrl || await this.resolveMatchUrl(matchId);
      const html = await fetchTextPolitely(url);
      return parseHltvMatchOutcomeHtml(html, matchId, url);
    } catch (err) {
      return {
        matchId,
        available: false,
        status: 'upcoming',
        teamAId: '',
        teamBId: '',
        teamAName: '',
        teamBName: '',
        url: matchUrl ?? '',
      };
    }
  }

  /** Read match page status while preserving the legacy status-only API. */
  async getMatchLiveStatus(matchId: string, matchUrl?: string): Promise<HltvMatchLiveStatus> {
    return (await this.getMatchOutcome(matchId, matchUrl)).status;
  }

  private teamsMatch(a: string, b: string): boolean {
    const na = a.toLowerCase().replace(/[^a-z0-9]/g, '');
    const nb = b.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!na || !nb) return false;
    return na === nb || na.includes(nb) || nb.includes(na);
  }

  /**
   * Extract lineup data from a match page.
   * Parses the starting five for each team, detecting standins and key absences.
   */
  async getMatchLineups(matchId: string, matchUrl?: string): Promise<{
    teamA: Lineup;
    teamB: Lineup;
  } | null> {
    try {
      const detail = await this.getMatchDetail(matchId, matchUrl);
      return detail.lineups;
    } catch {
      return null;
    }
  }

  /**
   * Get detailed team information including players, recent form, and map pool.
   */
  async getTeam(teamId: string): Promise<Team> {
    const html = await fetchTextPolitely(`${HLTV_BASE}/team/${teamId}/_`);
    const team = parseHltvTeamHtml(html, teamId);
    try {
      const resultsHtml = await fetchTextPolitely(`${HLTV_BASE}/results?team=${teamId}`);
      team.recentForm = parseHltvResultsHtml(resultsHtml, team.name);
    } catch {
      // Team identity, roster and map pool remain usable when results are temporarily unavailable.
    }
    return team;
  }

  private async resolveMatchUrl(matchId: string, matchUrl?: string): Promise<string> {
    if (matchUrl) return absoluteHltvUrl(matchUrl);
    const summary = (await this.getMatches()).find((match) => match.matchId === matchId);
    if (!summary?.url) throw new Error(`HLTV match ${matchId} was not found on the current matches page`);
    return summary.url;
  }

  /**
   * Get head-to-head history between two teams.
   * Scrapes the HLTV head-to-head comparison page.
   */
  async getHeadToHead(teamAId: string, teamBId: string): Promise<HeadToHead> {
    try {
      const html = await fetchTextPolitely(`${HLTV_BASE}/stats/teams/compare/${teamAId}/${teamBId}`);
      const $ = cheerio.load(html);

      // Parse overall stats
      const matchesPlayedText = $('.matches-played .value').text().trim();
      const matchesPlayed = parseInt(matchesPlayedText, 10) || 0;

      const winsText = $('.team-a-wins .value, .wins .value').first().text().trim();
      const wins = parseInt(winsText, 10) || 0;

      const lossesText = $('.team-b-wins .value, .losses .value').first().text().trim();
      const losses = parseInt(lossesText, 10) || 0;

      // Parse last match date
      const lastMatchText = $('.last-match-date, .recent-match-date').text().trim();
      const lastMatch = lastMatchText || '';

      // Parse map-specific results
      const mapResults: Array<{ map: string; teamAWins: number; teamBWins: number }> = [];
      $('.map-stats-row, .map-result-row').each((_i, el) => {
        const mapName = $(el).find('.map-name').text().trim();
        const teamAWinsText = $(el).find('.team-a-wins, .wins-a').text().trim();
        const teamBWinsText = $(el).find('.team-b-wins, .wins-b').text().trim();

        if (mapName) {
          mapResults.push({
            map: mapName,
            teamAWins: parseInt(teamAWinsText, 10) || 0,
            teamBWins: parseInt(teamBWinsText, 10) || 0,
          });
        }
      });

      // Fallback: try the matches history page if compare page fails
      if (matchesPlayed === 0) {
        return this.getHeadToHeadFromMatches(teamAId, teamBId);
      }

      return {
        opponent: teamBId,
        matchesPlayed,
        wins,
        losses,
        lastMatch,
        mapResults: mapResults.map((m) => ({
          map: m.map,
          result: (m.teamAWins > m.teamBWins ? 'win' : 'loss') as 'win' | 'loss',
          score: `${m.teamAWins}-${m.teamBWins}`,
        })),
      };
    } catch {
      return {
        opponent: teamBId,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        lastMatch: '',
        mapResults: [],
      };
    }
  }

  /**
   * Fallback H2H: parse from team A's match history page.
   */
  private async getHeadToHeadFromMatches(teamAId: string, teamBId: string): Promise<HeadToHead> {
    try {
      const html = await fetchTextPolitely(`${HLTV_BASE}/team/${teamAId}/matches`);
      const $ = cheerio.load(html);

      let wins = 0;
      let losses = 0;
      let lastMatch = '';

      $('.results-table tbody tr').each((_i, el) => {
        const opponentHref = $(el).find('.opponent a').attr('href') ?? '';
        const opponentId = parseTeamId(opponentHref);

        if (opponentId === teamBId) {
          const resultText = $(el).find('.result').text().trim();
          const dateAttr = $(el).find('.date').attr('data-unix');
          const date = dateAttr ? new Date(parseInt(dateAttr, 10) * 1000).toISOString() : '';

          if (resultText === 'W') wins++;
          else if (resultText === 'L') losses++;

          if (!lastMatch) lastMatch = date;
        }
      });

      return {
        opponent: teamBId,
        matchesPlayed: wins + losses,
        wins,
        losses,
        lastMatch,
        mapResults: [],
      };
    } catch {
      return {
        opponent: teamBId,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        lastMatch: '',
        mapResults: [],
      };
    }
  }

}
