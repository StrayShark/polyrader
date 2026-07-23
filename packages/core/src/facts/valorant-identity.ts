import {
  normalizeRiotTeamAlias,
  resolveRiotTeamIdentity,
  type RiotTeamIdentityCandidate,
  type RiotTeamIdentityResolution,
} from './riot-team-identity';

export type ValorantTeamIdentityCandidate = RiotTeamIdentityCandidate;
export type ValorantTeamIdentityResolution = RiotTeamIdentityResolution;

export function normalizeValorantTeamAlias(value: string): string {
  return normalizeRiotTeamAlias(value, 'valorant');
}

export function resolveValorantTeamIdentity(
  input: { name: string; sourceId?: string },
  candidates: ValorantTeamIdentityCandidate[],
): ValorantTeamIdentityResolution {
  return resolveRiotTeamIdentity(input, candidates, 'valorant');
}
