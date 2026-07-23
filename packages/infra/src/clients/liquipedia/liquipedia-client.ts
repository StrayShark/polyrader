import type { Player, PlayerRole } from '@polyrader/core';
import { load } from 'cheerio';
import { fetchTextPolitely } from '../../crawlers/polite-fetch';

export type LiquipediaGame = 'cs2' | 'lol' | 'dota2' | 'valorant';

const LIQUIPEDIA_WIKIS: Record<LiquipediaGame, string> = {
  cs2: 'counterstrike',
  lol: 'leagueoflegends',
  dota2: 'dota2',
  valorant: 'valorant',
};
const DEFAULT_USER_AGENT = 'PolyRader/0.3 local-development (Liquipedia API; set LIQUIPEDIA_USER_AGENT)';

export interface LiquipediaTeamSearchResult {
  pageId: number;
  title: string;
  canonicalName: string;
  sourceId: string;
  sourceUrl: string;
  confidence: number;
  snippet?: string;
}

export interface LiquipediaRosterPlayer extends Player {
  position?: string;
  nationality?: string;
  status?: 'active' | 'inactive' | 'coach' | 'substitute';
  joinDate?: string;
  leaveDate?: string;
}

export interface LiquipediaRosterSnapshot {
  teamTitle: string;
  sourceId: string;
  sourceUrl: string;
  players: LiquipediaRosterPlayer[];
  fetchedAt: string;
  rawLength: number;
}

export interface LiquipediaUpcomingMatch {
  matchId: string;
  teamAId: string;
  teamBId: string;
  teamAName: string;
  teamBName: string;
  date: string;
  eventId?: string;
  eventName: string;
  format: 'BO1' | 'BO2' | 'BO3' | 'BO5';
  sourceUrl?: string;
  status?: 'scheduled' | 'finished';
  scoreA?: number;
  scoreB?: number;
}

interface LiquipediaClientOptions {
  game?: LiquipediaGame;
  apiUrl?: string;
  userAgent?: string;
  timeoutMs?: number;
  minIntervalMs?: number;
  dbApiUrl?: string;
  dbApiKey?: string;
}

let lastRequestAt = 0;

export class LiquipediaClient {
  private readonly game: LiquipediaGame;
  private readonly wiki: string;
  private readonly apiUrl: string;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly minIntervalMs: number;
  private readonly dbApiUrl: string;
  private readonly dbApiKey: string;

  constructor(options: LiquipediaClientOptions = {}) {
    this.game = options.game ?? 'cs2';
    this.wiki = LIQUIPEDIA_WIKIS[this.game];
    this.apiUrl = options.apiUrl ?? gameApiUrl(this.game);
    this.userAgent = options.userAgent ?? process.env.LIQUIPEDIA_USER_AGENT ?? DEFAULT_USER_AGENT;
    this.timeoutMs = options.timeoutMs ?? envNumber('LIQUIPEDIA_TIMEOUT_MS', 8000, 500, 30000);
    this.minIntervalMs = options.minIntervalMs ?? envNumber('LIQUIPEDIA_MIN_INTERVAL_MS', 2100, 0, 10000);
    this.dbApiUrl = (
      options.dbApiUrl ??
      process.env.LIQUIPEDIA_DB_API_URL ??
      'https://api.liquipedia.net/api/v3'
    ).replace(/\/$/, '');
    this.dbApiKey = options.dbApiKey ?? process.env.LIQUIPEDIA_DB_API_KEY ?? '';
  }

  isMatchScheduleConfigured(): boolean {
    return Boolean(this.dbApiKey);
  }

  async getPublicUpcomingMatches(limit = 50, now = new Date()): Promise<LiquipediaUpcomingMatch[]> {
    const html = await this.getPublicMatchesHtml();
    return parseUpcomingMatchesHtml(html, this.game, now, limit);
  }

  async getPublicRecentMatches(limit = 50, now = new Date()): Promise<LiquipediaUpcomingMatch[]> {
    const html = await this.getPublicMatchesHtml();
    return parseRecentMatchesHtml(html, this.game, now, limit);
  }

  private async getPublicMatchesHtml(): Promise<string> {
    const data = await this.fetchApi<Record<string, unknown>>({
      action: 'parse',
      page: 'Liquipedia:Matches',
      prop: 'text',
    });
    const parsed = objectValue(data.parse);
    const textValue = parsed?.text;
    const html = typeof textValue === 'string'
      ? textValue
      : String(objectValue(textValue)?.['*'] ?? '');
    if (!html) throw new Error('Liquipedia public matches page returned no rendered content');
    return html;
  }

  async getUpcomingMatches(limit = 50, now = new Date()): Promise<LiquipediaUpcomingMatch[]> {
    if (!this.dbApiKey) {
      throw new Error('LIQUIPEDIA_DB_API_KEY not configured for schedule access');
    }
    await this.rateLimit();

    const url = new URL(`${this.dbApiUrl}/match`);
    url.searchParams.set('wiki', this.game);
    url.searchParams.set('limit', String(clamp(limit, 1, 100)));
    url.searchParams.set('order', 'date ASC');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          Authorization: `Apikey ${this.dbApiKey}`,
          'User-Agent': this.userAgent,
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Liquipedia DB API HTTP ${response.status}: ${text.slice(0, 200)}`);
      }
      const payload = (await response.json()) as Record<string, unknown>;
      const rows = Array.isArray(payload.result) ? payload.result : [];
      const nowMs = now.getTime();
      return rows
        .map(mapUpcomingMatch)
        .filter((match): match is LiquipediaUpcomingMatch => Boolean(match))
        .filter((match) => Date.parse(match.date) >= nowMs)
        .slice(0, clamp(limit, 1, 100));
    } finally {
      clearTimeout(timer);
    }
  }

  async searchTeams(name: string, limit = 5): Promise<LiquipediaTeamSearchResult[]> {
    const query = name.trim();
    if (!query) return [];

    const data = await this.fetchApi<Record<string, unknown>>({
      action: 'query',
      list: 'search',
      srsearch: `${query} team`,
      srnamespace: '0',
      srlimit: String(limit),
    });
    const rows = ((data.query as Record<string, unknown> | undefined)?.search ?? []) as Array<Record<string, unknown>>;

    return rows
      .map((row) => {
        const title = String(row.title ?? '');
        return {
          pageId: Number(row.pageid) || 0,
          title,
          canonicalName: title.replace(/_/g, ' '),
          sourceId: title,
          sourceUrl: this.pageUrl(title),
          confidence: nameConfidence(query, title),
          snippet: stripHtml(String(row.snippet ?? '')),
        };
      })
      .filter((row) => row.title)
      .sort((a, b) => b.confidence - a.confidence);
  }

  async getCurrentRoster(title: string): Promise<LiquipediaRosterSnapshot> {
    const wikitext = await this.getPageWikitext(title);
    let players = parseRosterFromWikitext(wikitext);
    if (/\{\{\s*ActiveSquadAuto\b/i.test(wikitext)) {
      const expanded = await this.expandTemplate(title, '{{ActiveSquadAuto}}');
      const expandedPlayers = parseExpandedRosterTable(expanded);
      if (expandedPlayers.length > 0) players = expandedPlayers;
    }
    return {
      teamTitle: title,
      sourceId: title,
      sourceUrl: this.pageUrl(title),
      players,
      fetchedAt: new Date().toISOString(),
      rawLength: wikitext.length,
    };
  }

  async getPageWikitext(title: string): Promise<string> {
    const data = await this.fetchApi<Record<string, unknown>>({
      action: 'query',
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      titles: title,
    });
    const pages = (data.query as Record<string, unknown> | undefined)?.pages as Record<string, unknown> | Record<string, unknown>[] | undefined;
    const firstPage = Array.isArray(pages)
      ? pages[0]
      : pages ? Object.values(pages)[0] as Record<string, unknown> | undefined : undefined;
    const revisions = (firstPage?.revisions ?? []) as Array<Record<string, unknown>>;
    const revision = revisions[0];
    const slots = revision?.slots as Record<string, unknown> | undefined;
    const main = slots?.main as Record<string, unknown> | undefined;
    return String(main?.content ?? main?.['*'] ?? revision?.content ?? revision?.['*'] ?? '');
  }

  private async expandTemplate(title: string, text: string): Promise<string> {
    const data = await this.fetchApi<Record<string, unknown>>({
      action: 'expandtemplates',
      title,
      text,
      prop: 'wikitext',
    });
    const expanded = data.expandtemplates as Record<string, unknown> | undefined;
    return String(expanded?.wikitext ?? '');
  }

  private async fetchApi<T>(params: Record<string, string>): Promise<T> {
    const url = new URL(this.apiUrl);
    url.searchParams.set('format', 'json');
    url.searchParams.set('formatversion', '2');
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    try {
      const text = await fetchTextPolitely(url.href, {
        headers: {
          Accept: 'application/json',
        },
        userAgent: this.userAgent,
        timeoutMs: this.timeoutMs,
        minIntervalMs: this.minIntervalMs,
        cacheTtlMs: envNumber('LIQUIPEDIA_CACHE_TTL_MS', 5 * 60_000, 0, 60 * 60_000),
      });
      return JSON.parse(text) as T;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('Liquipedia API returned invalid JSON');
      }
      throw error;
    }
  }

  private async rateLimit(): Promise<void> {
    if (this.minIntervalMs <= 0) {
      lastRequestAt = Date.now();
      return;
    }
    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < this.minIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, this.minIntervalMs - elapsed));
    }
    lastRequestAt = Date.now();
  }

  private pageUrl(title: string): string {
    return `https://liquipedia.net/${this.wiki}/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  }
}

function gameApiUrl(game: LiquipediaGame): string {
  const suffix = game === 'cs2' ? 'CS2' : game.toUpperCase();
  return process.env[`LIQUIPEDIA_API_URL_${suffix}`]
    ?? process.env.LIQUIPEDIA_API_URL
    ?? `https://liquipedia.net/${LIQUIPEDIA_WIKIS[game]}/api.php`;
}

function mapUpcomingMatch(row: unknown): LiquipediaUpcomingMatch | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const value = row as Record<string, unknown>;
  const opponents = parseOpponentRows(value.match2opponents ?? value.opponents);
  if (opponents.length < 2) return null;
  const date = normalizeDate(value.dateexact ?? value.date ?? value.starttime ?? value.start_time);
  if (!date) return null;

  const tournament = objectValue(value.tournament);
  const eventName = String(
    tournament?.name ?? value.tournamentname ?? value.eventname ?? value.event ?? 'Unknown event',
  );
  const sourcePage = String(value.liquipediapage ?? value.pagename ?? value.page ?? '');
  const matchId = String(
    value.match2id ?? value.matchid ?? value.objectid ?? value.id ?? sourcePage,
  );
  if (!matchId) return null;

  return {
    matchId,
    teamAId: opponents[0].id || opponents[0].name,
    teamBId: opponents[1].id || opponents[1].name,
    teamAName: opponents[0].name,
    teamBName: opponents[1].name,
    date,
    eventId: String(tournament?.id ?? value.tournamentid ?? value.eventid ?? '') || undefined,
    eventName,
    format: normalizeBestOf(value.bestof ?? value.format ?? value.matchformat),
    sourceUrl: sourcePage
      ? `https://liquipedia.net/${String(value.wiki ?? 'dota2')}/${encodeURIComponent(sourcePage.replace(/ /g, '_'))}`
      : undefined,
  };
}

export function parseUpcomingMatchesHtml(
  html: string,
  game: LiquipediaGame,
  now = new Date(),
  limit = 50,
): LiquipediaUpcomingMatch[] {
  return parseMatchesHtml(html, game, now, limit, 'scheduled');
}

export function parseRecentMatchesHtml(
  html: string,
  game: LiquipediaGame,
  now = new Date(),
  limit = 50,
): LiquipediaUpcomingMatch[] {
  return parseMatchesHtml(html, game, now, limit, 'finished');
}

function parseMatchesHtml(
  html: string,
  game: LiquipediaGame,
  now: Date,
  limit: number,
  mode: 'scheduled' | 'finished',
): LiquipediaUpcomingMatch[] {
  const $ = load(html, null, false);
  const rows: LiquipediaUpcomingMatch[] = [];
  const nowMs = now.getTime();

  $('.match-info').each((_index, element) => {
    if (rows.length >= clamp(limit, 1, 100)) return;
    const root = $(element);
    const timestamp = Number(root.find('.timer-object[data-timestamp]').first().attr('data-timestamp'));
    if (!Number.isFinite(timestamp)) return;
    const startsAt = timestamp * 1000;
    const finished = root.find('.timer-object[data-finished]').length > 0;
    if (mode === 'scheduled' && (startsAt < nowMs || finished)) return;
    if (mode === 'finished' && (!finished || startsAt > nowMs)) return;

    const opponents = root.find('.match-info-header-opponent').toArray().map((node) => {
      const anchor = $(node).find('.name a').first();
      const title = cleanTeamTitle(anchor.attr('title') ?? anchor.text() ?? $(node).find('.name').text());
      return {
        id: pageIdentity(anchor.attr('href'), title),
        name: title,
      };
    }).filter((opponent) => opponent.name);
    if (opponents.length < 2) return;

    const eventAnchor = root.find('.match-info-tournament-name a').first();
    const eventName = cleanWikiText(eventAnchor.text()) || cleanTeamTitle(eventAnchor.attr('title') ?? '');
    const eventId = pageIdentity(eventAnchor.attr('href'), eventName);
    const matchAnchor = root.find('.match-info-links a[href*="/Match:"], .match-info-links a[href*="title=Match"]').first();
    const matchPage = cleanMatchIdentity(matchAnchor.attr('title') ?? matchAnchor.attr('href') ?? '');
    const date = new Date(startsAt).toISOString();
    const matchId = matchPage || [
      'public',
      game,
      String(timestamp),
      slug(opponents[0].id),
      slug(opponents[1].id),
    ].join(':');
    const sourceHref = matchAnchor.attr('href') || eventAnchor.attr('href');
    const scores = root.find('.match-info-header-scoreholder-score').toArray()
      .map((node) => Number($(node).text().trim()))
      .filter(Number.isFinite);

    rows.push({
      matchId,
      teamAId: opponents[0].id,
      teamBId: opponents[1].id,
      teamAName: opponents[0].name,
      teamBName: opponents[1].name,
      date,
      eventId: eventId || undefined,
      eventName: eventName || 'Unknown event',
      format: normalizeBestOf(root.find('.match-info-header-scoreholder-lower').text()),
      sourceUrl: absoluteLiquipediaUrl(sourceHref),
      status: mode,
      ...(mode === 'finished' && scores.length >= 2
        ? { scoreA: scores[0], scoreB: scores[1] }
        : {}),
    });
  });

  return rows.sort((a, b) => mode === 'scheduled'
    ? Date.parse(a.date) - Date.parse(b.date)
    : Date.parse(b.date) - Date.parse(a.date));
}

function cleanTeamTitle(value: string): string {
  return cleanWikiText(value).replace(/\s*\(page does not exist\)\s*$/i, '').trim();
}

function pageIdentity(href: string | undefined, fallback: string): string {
  if (!href) return fallback;
  try {
    const url = new URL(href, 'https://liquipedia.net');
    const queryTitle = url.searchParams.get('title');
    const pathTitle = decodeURIComponent(url.pathname.split('/').slice(2).join('/'));
    return cleanTeamTitle((queryTitle ?? pathTitle).replace(/_/g, ' ')) || fallback;
  } catch {
    return fallback;
  }
}

function cleanMatchIdentity(value: string): string {
  let decoded = value;
  try {
    const url = new URL(value, 'https://liquipedia.net');
    decoded = url.searchParams.get('title') ?? decodeURIComponent(url.pathname.split('/').at(-1) ?? value);
  } catch {
    // The title attribute is already a provider identity.
  }
  const normalized = decoded.replace(/^Match:/i, '').replace(/^ID[ _]/i, '').replace(/\s+/g, '_');
  return normalized.replace(/[^A-Za-z0-9:_-]/g, '').replace(/^_+|_+$/g, '');
}

function absoluteLiquipediaUrl(href: string | undefined): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href, 'https://liquipedia.net').href;
  } catch {
    return undefined;
  }
}

function slug(value: string): string {
  return normalizeName(value) || 'unknown';
}

function parseOpponentRows(value: unknown): Array<{ id: string; name: string }> {
  let rows = value;
  if (typeof rows === 'string') {
    try {
      rows = JSON.parse(rows) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      if (typeof row === 'string') return { id: row, name: row };
      const item = objectValue(row);
      if (!item) return null;
      const name = String(item.name ?? item.opponentname ?? item.template ?? item.page ?? '');
      if (!name) return null;
      return {
        id: String(item.id ?? item.opponentid ?? item.page ?? item.template ?? name),
        name,
      };
    })
    .filter((row): row is { id: string; name: string } => Boolean(row));
}

function normalizeDate(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value < 10_000_000_000 ? value * 1000 : value;
    return new Date(millis).toISOString();
  }
  const millis = Date.parse(String(value ?? ''));
  return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
}

function normalizeBestOf(value: unknown): LiquipediaUpcomingMatch['format'] {
  const match = String(value ?? '').match(/(?:bo|best\s*of\s*)?([1235])/i);
  if (match?.[1] === '1') return 'BO1';
  if (match?.[1] === '2') return 'BO2';
  if (match?.[1] === '5') return 'BO5';
  return 'BO3';
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function parseRosterFromWikitext(wikitext: string): LiquipediaRosterPlayer[] {
  const focused = focusRosterSection(wikitext.replace(/<!--[\s\S]*?-->/g, ''));
  const players = new Map<string, LiquipediaRosterPlayer>();
  const templateRegex = /\{\{([^{}]+)\}\}/g;
  let match: RegExpExecArray | null;

  while ((match = templateRegex.exec(focused)) !== null) {
    const parsed = parseTemplate(match[1]);
    if (!parsed) continue;
    const templateName = parsed.name.toLowerCase();
    if (!/(person|player|roster|squad|teamcard)/.test(templateName)) continue;
    if (/coach/.test(templateName) && !templateName.includes('player')) continue;

    const nickname = cleanWikiText(
      parsed.params.id
      ?? parsed.params.player
      ?? parsed.params.nickname
      ?? parsed.params.nick
      ?? parsed.positionals[0]
      ?? parsed.positionals[1]
      ?? '',
    );
    if (!nickname || nickname.length > 32) continue;

    const playerId = normalizePlayerId(nickname);
    if (!playerId || players.has(playerId)) continue;

    const realName = cleanWikiText(
      parsed.params.name
      ?? parsed.params.realname
      ?? parsed.params.real_name
      ?? parsed.params.fullname
      ?? '',
    );
    const role = parseRole(parsed.params.igl === 'y' ? 'IGL' : parsed.params.role ?? parsed.params.position ?? templateName);
    if (role === 'Coach') continue;
    players.set(playerId, {
      playerId,
      name: realName,
      nickname,
      rating: 1,
      kdRatio: 1,
      headshotPercent: 0,
      mapsPlayed: 0,
      role,
      position: cleanWikiText(parsed.params.position ?? parsed.params.pos ?? parsed.params.role ?? ''),
      nationality: cleanWikiText(parsed.params.nationality ?? parsed.params.country ?? ''),
      status: templateName.includes('coach') ? 'coach' : templateName.includes('sub') ? 'substitute' : 'active',
      joinDate: cleanWikiText(parsed.params.joindate ?? parsed.params.join_date ?? ''),
      leaveDate: cleanWikiText(parsed.params.leavedate ?? parsed.params.leave_date ?? ''),
    });
  }

  return Array.from(players.values());
}

export function parseExpandedRosterTable(fragment: string): LiquipediaRosterPlayer[] {
  const $ = load(fragment, null, false);
  const players: LiquipediaRosterPlayer[] = [];

  $('tr.table2__row--body').each((_index, row) => {
    const cells = $(row).find('td');
    if (cells.length < 2) return;
    const identity = cells.eq(0).text();
    const links = Array.from(identity.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g));
    const playerLink = links.filter((match) => !match[1].toLowerCase().startsWith('file:')).at(-1);
    const nickname = cleanWikiText(playerLink?.[2] ?? playerLink?.[1] ?? identity);
    const playerId = normalizePlayerId(nickname);
    if (!playerId || players.some((player) => player.playerId === playerId)) return;

    const position = cleanExpandedCell(cells.eq(2).text());
    const dateText = cleanExpandedCell(cells.eq(3).text());
    const nationality = identity.match(/\[\[File:([a-z]{2,5})(?:_hd)?\./i)?.[1] ?? '';
    players.push({
      playerId,
      name: cleanExpandedCell(cells.eq(1).text()),
      nickname,
      rating: 1,
      kdRatio: 1,
      headshotPercent: 0,
      mapsPlayed: 0,
      role: parseRole(position),
      position,
      nationality,
      status: 'active',
      joinDate: dateText.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? '',
    });
  });

  return players;
}

function cleanExpandedCell(value: string): string {
  return cleanWikiText(value)
    .replace(/\[[^\]]+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function focusRosterSection(wikitext: string): string {
  const start = wikitext.search(/={2,}\s*(current\s+)?(players|player\s+roster|roster|active\s+roster|lineup)\s*={2,}/i);
  if (start < 0) return wikitext;
  const rest = wikitext.slice(start);
  const next = rest.slice(1).search(/={2,}\s*(former|organization|achievements|results|timeline|references|external links)/i);
  return next > 0 ? rest.slice(0, next + 1) : rest;
}

function parseTemplate(raw: string): { name: string; params: Record<string, string>; positionals: string[] } | null {
  const parts = raw.split('|').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const [name, ...rest] = parts;
  const params: Record<string, string> = {};
  const positionals: string[] = [];
  for (const part of rest) {
    const equals = part.indexOf('=');
    if (equals > 0) {
      params[part.slice(0, equals).trim().toLowerCase()] = part.slice(equals + 1).trim();
    } else {
      positionals.push(part);
    }
  }
  return { name, params, positionals };
}

function parseRole(value: string): PlayerRole {
  const text = value.toLowerCase();
  if (text.includes('awp') || text.includes('sniper')) return 'AWPer';
  if (text.includes('igl') || text.includes('captain') || text.includes('leader')) return 'IGL';
  if (text.includes('entry')) return 'Entry';
  if (text.includes('support')) return 'Support';
  if (text.includes('lurk')) return 'Lurker';
  if (text.includes('coach')) return 'Coach';
  return 'Rifler';
}

function cleanWikiText(value: unknown): string {
  return String(value ?? '')
    .replace(/\[\[(?:[^|\]]+\|)?([^\]]+)\]\]/g, '$1')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function normalizePlayerId(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_]+/g, '');
}

function normalizeName(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
}

function nameConfidence(query: string, title: string): number {
  const a = normalizeName(query);
  const b = normalizeName(title);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  return 0.5;
}

function envNumber(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
