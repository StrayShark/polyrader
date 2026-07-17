export interface CanonicalMatchInput {
  hltvMatchId?: string | null;
  teamAId?: string | null;
  teamBId?: string | null;
  teamAName?: string | null;
  teamBName?: string | null;
  eventName?: string | null;
  scheduledAt?: string | null;
}

const PLACEHOLDER_ID = /^(?:local-|team-[ab]$|unknown|tbd)/i;

/** Build a stable cross-source key without depending on a provider's market ID. */
export function buildCanonicalMatchId(input: CanonicalMatchInput): string {
  const hltvId = normalizeToken(input.hltvMatchId ?? '');
  if (hltvId) return `hltv:${hltvId}`;

  const teamA = canonicalTeamToken(input.teamAId, input.teamAName);
  const teamB = canonicalTeamToken(input.teamBId, input.teamBName);
  const teams = [teamA, teamB].sort().join('--');
  const event = normalizeToken(input.eventName ?? '') || 'unknown-event';
  const timeBucket = canonicalTimeBucket(input.scheduledAt);
  return `match:${teams || 'unknown-teams'}:${event}:${timeBucket}`;
}

export function normalizeMatchToken(value: string): string {
  return normalizeToken(value);
}

function canonicalTeamToken(id: string | null | undefined, name: string | null | undefined): string {
  const normalizedId = normalizeToken(id ?? '');
  if (normalizedId && !PLACEHOLDER_ID.test(normalizedId)) return `id-${normalizedId}`;
  return `name-${normalizeToken(name ?? '') || 'unknown'}`;
}

function canonicalTimeBucket(value: string | null | undefined): string {
  const timestamp = Date.parse(value ?? '');
  if (!Number.isFinite(timestamp)) return 'unknown-time';
  const thirtyMinutes = 30 * 60 * 1000;
  return String(Math.round(timestamp / thirtyMinutes));
}

function normalizeToken(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
