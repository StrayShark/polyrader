/** Shared team-name identity matching for LoL and Valorant schedule ↔ roster links. */

export interface RiotTeamIdentityCandidate {
  teamId: string;
  name: string;
  tag?: string;
  aliases?: string[];
}

export interface RiotTeamIdentityResolution {
  status: 'matched' | 'ambiguous' | 'unmatched';
  teamId?: string;
  score: number;
  method: 'source_id' | 'name' | 'alias' | 'token_overlap' | 'none';
  candidateIds: string[];
}

const BASE_TEAM_WORDS = new Set(['team', 'esport', 'esports', 'gaming', 'club', 'org']);
const GAME_WORDS: Record<'lol' | 'valorant', Set<string>> = {
  lol: new Set(['lol', 'league', 'legends', 'lck', 'lpl', 'lec', 'lcs']),
  valorant: new Set(['valorant', 'val', 'vct']),
};

export function normalizeRiotTeamAlias(
  value: string,
  game: 'lol' | 'valorant' = 'lol',
): string {
  const noise = new Set([...BASE_TEAM_WORDS, ...GAME_WORDS[game]]);
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token && !noise.has(token))
    .join('');
}

export function resolveRiotTeamIdentity(
  input: { name: string; sourceId?: string },
  candidates: RiotTeamIdentityCandidate[],
  game: 'lol' | 'valorant' = 'lol',
): RiotTeamIdentityResolution {
  const sourceId = normalizeIdentifier(input.sourceId);
  const query = normalizeRiotTeamAlias(input.name, game);
  const scored = candidates
    .map((candidate) => scoreTeamCandidate(sourceId, query, candidate, game))
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

function scoreTeamCandidate(
  sourceId: string,
  query: string,
  candidate: RiotTeamIdentityCandidate,
  game: 'lol' | 'valorant',
): { teamId: string; score: number; method: RiotTeamIdentityResolution['method'] } {
  if (sourceId && sourceId === normalizeIdentifier(candidate.teamId)) {
    return { teamId: candidate.teamId, score: 1, method: 'source_id' };
  }
  const names = [candidate.name, candidate.tag ?? '', ...(candidate.aliases ?? [])]
    .map((name) => normalizeRiotTeamAlias(name, game))
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
