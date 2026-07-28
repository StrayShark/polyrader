import type { EsportsGame } from '@polyrader/core/browser';

/**
 * Polymarket esports match parser.
 *
 * Extracts structured match info from Polymarket market questions.
 *
 * Question format examples:
 *   "Counter-Strike: Acend vs Bebop (BO3) - CCT Europe Series #14 Play-In Group B"
 *   "Dota 2: Team Liquid vs Team Falcons - Match Winner"
 *   "League of Legends: T1 vs Gen.G - Match Winner"
 *   "Valorant: Sentinels vs G2 Esports - Map 1 Winner"
 *   "Counter-Strike: FC Famalicão Esports vs Falcons Force - Map 1 Winner"
 *   "Counter-Strike: 3DMAX vs FOKUS - Map 2 Winner"
 *   "Counter-Strike: Spirit vs G2 (BO5) - IEM Cologne 2026 Quarterfinal"
 */

export type MarketCategory =
  | 'match_winner'
  | 'map_winner'
  | 'handicap'
  | 'total_maps'
  | 'correct_score'
  | 'other';

export interface ParsedPolymarketMatch {
  /** Original Polymarket question */
  question: string;
  /** Esports title inferred from the question prefix, if present. */
  game: EsportsGame | null;
  /** Team A name as written in the question */
  teamAName: string;
  /** Team B name as written in the question */
  teamBName: string;
  /** Best-of format, null if not specified */
  format: 'BO1' | 'BO3' | 'BO5' | null;
  /** Event/tournament name */
  eventName: string;
  /** Event stage if present (e.g. "Quarterfinal", "Group B", "Play-In") */
  eventStage: string | null;
  /** Map number if this is a single-map market (e.g. "Map 1 Winner") */
  mapNumber: number | null;
  /** Whether this is a map market rather than a match market */
  isMapMarket: boolean;
  /** Classified market category */
  category: MarketCategory;
  /** Human-readable market label */
  marketLabel: string;
}

export function isSubgameMarketQuestion(question: string): boolean {
  return /(?:\b(?:Map|Game)\s*#?\d+\b|(?:地图|小局)\s*\d+)/i.test(question);
}

function classifyMarketCategory(
  marketText: string,
  eventPart: string,
  isMapMarket: boolean,
  mapNumber: number | null,
): { category: MarketCategory; marketLabel: string } {
  const lower = marketText.toLowerCase();

  if (isMapMarket && mapNumber !== null) {
    return { category: 'map_winner', marketLabel: `Map ${mapNumber} Winner` };
  }

  if (
    lower.includes('handicap') ||
    lower.includes('spread') ||
    /\+\d+\.5/.test(marketText) ||
    /-\d+\.5/.test(marketText)
  ) {
    return { category: 'handicap', marketLabel: 'Handicap' };
  }

  if (
    lower.includes('total maps') ||
    lower.includes('total games') ||
    lower.includes('total rounds') ||
    /\bo\/u\b/i.test(marketText) ||
    /over\/under/i.test(marketText)
  ) {
    const lineMatch = marketText.match(/(\d+\.5)/);
    return {
      category: 'total_maps',
      marketLabel: lineMatch ? `Total Maps O/U ${lineMatch[1]}` : 'Total Maps',
    };
  }

  if (lower.includes('correct score') || /\d-\d/.test(marketText)) {
    return { category: 'correct_score', marketLabel: 'Correct Score' };
  }

  // Default: if the event part is empty or only contains event/stage info, treat as match winner.
  const stripped = eventPart
    .replace(/(?:Map|Game)\s+\d+\s+Winner/gi, '')
    .replace(/Handicap/gi, '')
    .replace(/Total Maps/gi, '')
    .replace(/Total Games/gi, '')
    .replace(/Correct Score/gi, '')
    .replace(/Over\/Under/gi, '')
    .trim();
  if (!stripped || /^[A-Za-z0-9\s\-#]+$/.test(stripped)) {
    return { category: 'match_winner', marketLabel: 'Match Winner' };
  }

  return { category: 'other', marketLabel: marketText || 'Other' };
}

function stripGamePrefix(question: string): { text: string; game: EsportsGame | null } {
  const prefixPatterns: Array<{ pattern: RegExp; game: EsportsGame }> = [
    { pattern: /^Counter-Strike(?:\s*2)?:\s*/i, game: 'cs2' },
    { pattern: /^CS2:\s*/i, game: 'cs2' },
    { pattern: /^CSGO:\s*/i, game: 'cs2' },
    { pattern: /^Dota\s*2:\s*/i, game: 'dota2' },
    { pattern: /^League\s+of\s+Legends:\s*/i, game: 'lol' },
    { pattern: /^LoL:\s*/i, game: 'lol' },
    { pattern: /^Valorant:\s*/i, game: 'valorant' },
  ];
  let text = question.trim();
  for (const { pattern, game } of prefixPatterns) {
    if (pattern.test(text)) {
      text = text.replace(pattern, '');
      return { text, game };
    }
  }
  return { text, game: null };
}

function stripMarketPrefix(text: string): string {
  return text
    .replace(/^(?:Game|Map)\s+\d+\s+Rounds?\s+Handicap\s*:\s*/i, '')
    .replace(/^(?:Game|Map)\s+\d+\s+Handicap\s*:\s*/i, '')
    .replace(/^(?:Game|Map)\s+Handicap\s*:\s*/i, '')
    .replace(/^Handicap\s*:\s*/i, '')
    .replace(
      /^Total\s+(?:Maps|Games|Rounds)(?:\s+(?:O\/U|Over\/Under))?\s+\d+(?:\.\d+)?\s*:\s*/i,
      '',
    )
    .replace(/^Total\s+(?:Maps|Games|Rounds)\s*:\s*/i, '')
    .trim();
}

function cleanTeamName(name: string): string {
  return name
    .replace(/\s*\(BO[135]\)\s*$/i, '')
    .replace(/\s*-\s*(?:Map|Game)\s+\d+\s+Winner\s*$/i, '')
    .replace(/\s*\([+-]?\d+(?:\.\d+)?\)\s*$/i, '')
    .replace(/\s+[+-]\d+(?:\.\d+)?\s*$/i, '')
    .trim();
}

/**
 * Parse a Polymarket esports market question into structured data.
 *
 * Returns null if the question doesn't look like a two-team match market.
 */
export function parsePolymarketMatch(question: string): ParsedPolymarketMatch | null {
  // Must contain "vs" to be a match market
  if (!question.includes(' vs ')) return null;

  const { text: rawText, game } = stripGamePrefix(question);
  const text = stripMarketPrefix(rawText);

  // Split into match part and event part by " - " (first occurrence)
  const dashIdx = text.indexOf(' - ');
  const matchPart = dashIdx >= 0 ? text.substring(0, dashIdx).trim() : text.trim();
  const eventPart = dashIdx >= 0 ? text.substring(dashIdx + 3).trim() : '';

  // Extract format (BO1/BO3/BO5) from match part
  const formatMatch = matchPart.match(/\((BO[135])\)/i);
  const format = formatMatch ? (formatMatch[1].toUpperCase() as 'BO1' | 'BO3' | 'BO5') : null;

  // Extract map number (e.g. "Map 1 Winner", "Map 2 Winner")
  const mapMatch = eventPart.match(/(?:Map|Game)\s+(\d+)\s+Winner/i);
  const mapNumber = mapMatch ? parseInt(mapMatch[1], 10) : null;
  const isMapMarket = mapNumber !== null;

  // Split teams by " vs "
  const vsIdx = matchPart.indexOf(' vs ');
  if (vsIdx < 0) return null;

  const teamAName = cleanTeamName(matchPart.substring(0, vsIdx));
  const teamBName = cleanTeamName(matchPart.substring(vsIdx + 4));

  // Parse event name and stage
  let eventName = eventPart;
  let eventStage: string | null = null;

  // Try to extract stage from event part
  const stageMatch = eventPart.match(
    /\b(Play-In|Quarterfinal|Quarterfinals|Semifinal|Semifinals|Final|Grand Final|Group [A-Z]|Group \d+|Upper Bracket Round \d|Lower Bracket Round \d|Upper Bracket Semifinal|Lower Bracket Semifinal|Upper Bracket Final|Lower Bracket Final)\b/i,
  );
  if (stageMatch) {
    eventStage = stageMatch[1];
    eventName = eventPart
      .replace(stageMatch[0], '')
      .replace(/\s*-\s*$/, '')
      .trim();
  }

  // If no stage found, check if event part has "Map X Winner" and strip it
  if (isMapMarket && !eventStage) {
    eventName = eventPart
      .replace(/(?:Map|Game)\s+\d+\s+Winner/i, '')
      .replace(/\s*-\s*$/, '')
      .trim();
  }

  if (!eventName) eventName = 'Unknown Event';

  const { category, marketLabel } = classifyMarketCategory(
    `${rawText} - ${eventPart}`.trim(),
    eventPart,
    isMapMarket,
    mapNumber,
  );

  return {
    question,
    game,
    teamAName,
    teamBName,
    format,
    eventName,
    eventStage,
    mapNumber,
    isMapMarket,
    category,
    marketLabel,
  };
}
