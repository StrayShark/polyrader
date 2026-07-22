import type { EsportsGame } from '@polyrader/core';
import { LLMRepository } from '@polyrader/infra';
import { EsportsSourceService } from './esports-source-service';
import { FactNormalizationService } from './fact-normalization-service';
import { SourceAlignmentService } from './source-alignment-service';

/** Refresh target-match intelligence before freezing an analysis prompt. */
export class AnalysisFactPreparationService {
  private readonly matches: Pick<LLMRepository, 'getMatch'>;
  private readonly alignment: Pick<SourceAlignmentService, 'enrichHltvMatchForAnalysis'>;
  private readonly sources: Pick<EsportsSourceService, 'syncLegacyCs2Snapshots'>;
  private readonly normalization: Pick<FactNormalizationService, 'normalizeMatch'>;

  constructor(deps?: {
    matches?: Pick<LLMRepository, 'getMatch'>;
    alignment?: Pick<SourceAlignmentService, 'enrichHltvMatchForAnalysis'>;
    sources?: Pick<EsportsSourceService, 'syncLegacyCs2Snapshots'>;
    normalization?: Pick<FactNormalizationService, 'normalizeMatch'>;
  }) {
    this.matches = deps?.matches ?? new LLMRepository();
    this.alignment = deps?.alignment ?? new SourceAlignmentService();
    this.sources = deps?.sources ?? new EsportsSourceService();
    this.normalization = deps?.normalization ?? new FactNormalizationService();
  }

  async prepare(game: EsportsGame, externalMatchId?: string): Promise<void> {
    if (game !== 'cs2' || !externalMatchId) return;
    const normalizedExternalId = externalMatchId.replace(/^local-hltv-/, '');
    const localMatchId = `local-hltv-${normalizedExternalId}`;
    const match = this.matches.getMatch(localMatchId) ?? this.matches.getMatch(externalMatchId);
    if (!match) return;

    if (needsRefresh(match)) {
      await this.alignment.enrichHltvMatchForAnalysis(match);
    }
    this.sources.syncLegacyCs2Snapshots();
    this.normalization.normalizeMatch('cs2', normalizedExternalId);
  }
}

function needsRefresh(match: Record<string, unknown>): boolean {
  if (Number(match.has_team_data ?? 0) !== 1) return true;
  if (!hasCompleteLineups(match.lineups)) return true;
  const updatedAt = Date.parse(String(match.updated_at ?? ''));
  return !Number.isFinite(updatedAt) || Date.now() - updatedAt > 6 * 60 * 60 * 1000;
}

function hasCompleteLineups(value: unknown): boolean {
  try {
    const parsed = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    const lineups = parsed as Record<string, unknown>;
    return lineupSize(lineups.teamA) >= 5 && lineupSize(lineups.teamB) >= 5;
  } catch {
    return false;
  }
}

function lineupSize(value: unknown): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  const players = (value as Record<string, unknown>).players;
  return Array.isArray(players) ? players.length : 0;
}
