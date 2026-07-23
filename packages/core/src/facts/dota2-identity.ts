export interface DotaTeamIdentityCandidate {
  teamId: string;
  name: string;
  tag?: string;
  aliases?: string[];
}

export interface DotaTeamIdentityResolution {
  status: 'matched' | 'ambiguous' | 'unmatched';
  teamId?: string;
  score: number;
  method: 'source_id' | 'name' | 'alias' | 'token_overlap' | 'none';
  candidateIds: string[];
}

export interface DotaSeriesIdentityCandidate {
  seriesId: string;
  teamAName: string;
  teamBName: string;
  startsAt: string;
  eventName?: string;
}

export interface DotaSeriesIdentityResolution {
  status: 'matched' | 'ambiguous' | 'unmatched';
  seriesId?: string;
  score: number;
  candidateIds: string[];
}

const TEAM_WORDS = new Set(['team', 'esport', 'esports', 'gaming', 'dota', 'club']);

export function normalizeDotaTeamAlias(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token && !TEAM_WORDS.has(token))
    .join('');
}

export function resolveDotaTeamIdentity(
  input: { name: string; sourceId?: string },
  candidates: DotaTeamIdentityCandidate[],
): DotaTeamIdentityResolution {
  const sourceId = normalizeIdentifier(input.sourceId);
  const query = normalizeDotaTeamAlias(input.name);
  const scored = candidates
    .map((candidate) => scoreTeamCandidate(sourceId, query, candidate))
    .filter((item) => item.score >= 0.72)
    .sort((a, b) => b.score - a.score || a.teamId.localeCompare(b.teamId));

  const top = scored[0];
  if (!top) {
    return { status: 'unmatched', score: 0, method: 'none', candidateIds: [] };
  }
  const collisions = scored.filter((item) => top.score - item.score <= 0.025);
  if (collisions.length > 1) {
    return {
      status: 'ambiguous',
      score: top.score,
      method: top.method,
      candidateIds: collisions.map((item) => item.teamId),
    };
  }
  return {
    status: 'matched',
    teamId: top.teamId,
    score: top.score,
    method: top.method,
    candidateIds: [top.teamId],
  };
}

export function resolveDotaSeriesIdentity(
  input: Omit<DotaSeriesIdentityCandidate, 'seriesId'>,
  candidates: DotaSeriesIdentityCandidate[],
  toleranceMs = 45 * 60 * 1000,
): DotaSeriesIdentityResolution {
  const inputTeams = normalizedTeamPair(input.teamAName, input.teamBName);
  const startsAt = Date.parse(input.startsAt);
  if (inputTeams.some((team) => !team) || !Number.isFinite(startsAt)) {
    return { status: 'unmatched', score: 0, candidateIds: [] };
  }

  const scored = candidates
    .flatMap((candidate) => {
      if (!sameTeamPair(inputTeams, normalizedTeamPair(candidate.teamAName, candidate.teamBName))) {
        return [];
      }
      const candidateStart = Date.parse(candidate.startsAt);
      const delta = Math.abs(startsAt - candidateStart);
      if (!Number.isFinite(candidateStart) || delta > toleranceMs) return [];
      const timeScore = 1 - delta / toleranceMs;
      const eventScore = eventSimilarity(input.eventName, candidate.eventName);
      return [
        {
          seriesId: candidate.seriesId,
          score: 0.72 + timeScore * 0.18 + eventScore * 0.1,
        },
      ];
    })
    .sort((a, b) => b.score - a.score || a.seriesId.localeCompare(b.seriesId));

  const top = scored[0];
  if (!top) return { status: 'unmatched', score: 0, candidateIds: [] };
  const collisions = scored.filter((item) => top.score - item.score <= 0.025);
  if (collisions.length > 1) {
    return {
      status: 'ambiguous',
      score: top.score,
      candidateIds: collisions.map((item) => item.seriesId),
    };
  }
  return {
    status: 'matched',
    seriesId: top.seriesId,
    score: top.score,
    candidateIds: [top.seriesId],
  };
}

function scoreTeamCandidate(
  sourceId: string,
  query: string,
  candidate: DotaTeamIdentityCandidate,
): { teamId: string; score: number; method: DotaTeamIdentityResolution['method'] } {
  if (sourceId && sourceId === normalizeIdentifier(candidate.teamId)) {
    return { teamId: candidate.teamId, score: 1, method: 'source_id' };
  }
  const names = [candidate.name, candidate.tag ?? '', ...(candidate.aliases ?? [])]
    .map(normalizeDotaTeamAlias)
    .filter(Boolean);
  if (query && names[0] === query) return { teamId: candidate.teamId, score: 0.98, method: 'name' };
  if (query && names.slice(1).includes(query)) {
    return { teamId: candidate.teamId, score: 0.95, method: 'alias' };
  }
  const overlap = Math.max(0, ...names.map((name) => aliasOverlap(query, name)));
  return {
    teamId: candidate.teamId,
    score: overlap,
    method: overlap > 0 ? 'token_overlap' : 'none',
  };
}

function aliasOverlap(a: string, b: string): number {
  if (!a || !b) return 0;
  if ((a.includes(b) || b.includes(a)) && Math.min(a.length, b.length) >= 4) return 0.84;
  const aPairs = bigrams(a);
  const bPairs = bigrams(b);
  const intersection = [...aPairs].filter((pair) => bPairs.has(pair)).length;
  const union = new Set([...aPairs, ...bPairs]).size;
  const score = union > 0 ? intersection / union : 0;
  return score >= 0.72 ? 0.72 + score * 0.16 : 0;
}

function bigrams(value: string): Set<string> {
  if (value.length < 2) return new Set([value]);
  return new Set(
    Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2)),
  );
}

function normalizeIdentifier(value: string | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function normalizedTeamPair(teamAName: string, teamBName: string): [string, string] {
  return [normalizeDotaTeamAlias(teamAName), normalizeDotaTeamAlias(teamBName)].sort() as [
    string,
    string,
  ];
}

function sameTeamPair(a: [string, string], b: [string, string]): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function eventSimilarity(a: string | undefined, b: string | undefined): number {
  const left = normalizeDotaTeamAlias(a ?? '');
  const right = normalizeDotaTeamAlias(b ?? '');
  if (!left || !right) return 0.5;
  if (left === right) return 1;
  return aliasOverlap(left, right);
}
