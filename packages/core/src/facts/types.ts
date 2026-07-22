import type { AnalysisFact, EsportsGame } from '../analysis/types';
import { sha256Hex, stableStringify } from '../analysis/hash';

export type { AnalysisFact, EsportsGame };

export type FactConflictFlag =
  | 'roster_mismatch'
  | 'schedule_mismatch'
  | 'identity_collision'
  | 'stale_source';

export interface NormalizedParticipant {
  participantId: string;
  side: 'a' | 'b';
  name: string;
  rating?: number;
  source: string;
}

export interface NormalizedPlayer {
  participantId: string;
  playerId: string;
  displayName: string;
  position?: string;
  isStarter: boolean;
  source: string;
}

export interface NormalizedSourceLink {
  source: string;
  entityType: string;
  externalId: string;
  precedence: number;
  observedAt: string;
}

export interface NormalizedMatchFacts {
  id: string;
  game: EsportsGame;
  externalMatchId: string;
  eventId?: string;
  eventName: string;
  startsAt: string;
  format: 'BO1' | 'BO3' | 'BO5';
  status: string;
  patchVersion?: string;
  mapPool: string[];
  participants: NormalizedParticipant[];
  players: NormalizedPlayer[];
  sourceLinks: NormalizedSourceLink[];
  facts: AnalysisFact[];
  missing: string[];
  conflictFlags: FactConflictFlag[];
  completeness: number;
  freshnessSeconds: number;
  dataSnapshotHash: string;
  adapterVersion: string;
}

export interface SourceSnapshotLike {
  game: EsportsGame;
  source: string;
  entityType: string;
  externalId: string;
  name: string;
  startsAt?: string | null;
  status?: string;
  payload: Record<string, unknown>;
  observedAt: string;
}

export interface BoardValidationSummary {
  game: EsportsGame;
  boardState: 'paper_ready' | 'needs_data' | 'blocked' | 'unconfigured';
  completeness: number;
  freshnessSeconds: number;
  missing: string[];
  conflictFlags: FactConflictFlag[];
  sourceCount: number;
  matchCount: number;
  sampleMatch?: NormalizedMatchFacts;
  stages: Array<{
    stage: string;
    status: 'passed' | 'warning' | 'failed' | 'waiting' | 'skipped';
    detail: string;
  }>;
}

export function hashNormalizedFacts(input: Omit<NormalizedMatchFacts, 'id' | 'dataSnapshotHash'>): string {
  const payload = {
    game: input.game,
    externalMatchId: input.externalMatchId,
    eventName: input.eventName,
    startsAt: input.startsAt,
    format: input.format,
    status: input.status,
    patchVersion: input.patchVersion ?? null,
    mapPool: input.mapPool,
    participants: input.participants,
    players: input.players,
    facts: input.facts,
    missing: input.missing,
    conflictFlags: input.conflictFlags,
    completeness: input.completeness,
  };
  return `sha256:${sha256Hex(stableStringify(payload))}`;
}

export function computeCompleteness(required: string[], missing: string[]): number {
  if (required.length === 0) return 1;
  const miss = new Set(missing);
  const present = required.filter((item) => !miss.has(item)).length;
  return present / required.length;
}

export function freshnessSeconds(observedAts: string[], now = new Date()): number {
  const stamps = observedAts
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));
  if (stamps.length === 0) return Number.POSITIVE_INFINITY;
  const newest = Math.max(...stamps);
  return Math.max(0, Math.floor((now.getTime() - newest) / 1000));
}
