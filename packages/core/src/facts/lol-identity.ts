import {
  normalizeRiotTeamAlias,
  resolveRiotTeamIdentity,
  type RiotTeamIdentityCandidate,
  type RiotTeamIdentityResolution,
} from './riot-team-identity';

export type LolTeamIdentityCandidate = RiotTeamIdentityCandidate;
export type LolTeamIdentityResolution = RiotTeamIdentityResolution;

export function normalizeLolTeamAlias(value: string): string {
  return normalizeRiotTeamAlias(value, 'lol');
}

export function resolveLolTeamIdentity(
  input: { name: string; sourceId?: string },
  candidates: LolTeamIdentityCandidate[],
): LolTeamIdentityResolution {
  return resolveRiotTeamIdentity(input, candidates, 'lol');
}
