import type { EsportsGame, NormalizedMatchFacts } from '@polyrader/core';
import { LLMRepository } from '@polyrader/infra';
import { EsportsSourceService } from './esports-source-service';
import { FactNormalizationService } from './fact-normalization-service';
import { SourceAlignmentService } from './source-alignment-service';
import { PaperPolicyService } from './paper-policy-service';

export interface AnalysisFactPreparationResult {
  game: EsportsGame;
  externalMatchId?: string;
  attemptedRefresh: boolean;
  refreshed: boolean;
  normalized: NormalizedMatchFacts | null;
  message?: string;
}

/** Refresh target-match intelligence before freezing an analysis prompt. */
export class AnalysisFactPreparationService {
  private readonly matches: Pick<LLMRepository, 'getMatch'>;
  private readonly alignment: Pick<SourceAlignmentService, 'enrichHltvMatchForAnalysis'>;
  private readonly sources: Pick<EsportsSourceService, 'syncLegacyCs2Snapshots'>;
  private readonly normalization: Pick<FactNormalizationService, 'normalizeMatch'>;
  private readonly policy: Pick<PaperPolicyService, 'getActive'>;
  private readonly now: () => Date;

  constructor(deps?: {
    matches?: Pick<LLMRepository, 'getMatch'>;
    alignment?: Pick<SourceAlignmentService, 'enrichHltvMatchForAnalysis'>;
    sources?: Pick<EsportsSourceService, 'syncLegacyCs2Snapshots'>;
    normalization?: Pick<FactNormalizationService, 'normalizeMatch'>;
    policy?: Pick<PaperPolicyService, 'getActive'>;
    now?: () => Date;
  }) {
    this.matches = deps?.matches ?? new LLMRepository();
    this.alignment = deps?.alignment ?? new SourceAlignmentService();
    this.sources = deps?.sources ?? new EsportsSourceService();
    this.normalization = deps?.normalization ?? new FactNormalizationService();
    this.policy = deps?.policy ?? new PaperPolicyService();
    this.now = deps?.now ?? (() => new Date());
  }

  async prepare(
    game: EsportsGame,
    externalMatchId?: string,
  ): Promise<AnalysisFactPreparationResult> {
    if (game !== 'cs2' || !externalMatchId) {
      return { game, externalMatchId, attemptedRefresh: false, refreshed: false, normalized: null };
    }
    const normalizedExternalId = externalMatchId.replace(/^local-hltv-/, '');
    const localMatchId = `local-hltv-${normalizedExternalId}`;
    const match = this.matches.getMatch(localMatchId) ?? this.matches.getMatch(externalMatchId);
    if (!match) {
      return {
        game,
        externalMatchId: normalizedExternalId,
        attemptedRefresh: false,
        refreshed: false,
        normalized: null,
        message: 'legacy CS2 match not found; using persisted normalized facts',
      };
    }

    const maximumFreshnessSeconds = this.policy.getActive().maximumFreshnessSeconds;
    const attemptedRefresh = needsRefresh(match, maximumFreshnessSeconds, this.now().getTime());
    let refreshed = false;
    let message: string | undefined;
    if (attemptedRefresh) {
      try {
        const result = await this.alignment.enrichHltvMatchForAnalysis(match);
        refreshed = result.refreshed;
        message = result.message;
      } catch (error) {
        message = (error as Error).message;
      }
    }
    this.sources.syncLegacyCs2Snapshots();
    const normalized = this.normalization.normalizeMatch('cs2', normalizedExternalId);
    return {
      game,
      externalMatchId: normalizedExternalId,
      attemptedRefresh,
      refreshed,
      normalized,
      message,
    };
  }
}

function needsRefresh(
  match: Record<string, unknown>,
  maximumFreshnessSeconds: number,
  now: number,
): boolean {
  if (Number(match.has_team_data ?? 0) !== 1) return true;
  if (!hasCompleteLineups(match.lineups)) return true;
  const updatedAt = Date.parse(String(match.updated_at ?? ''));
  return (
    !Number.isFinite(updatedAt) || now - updatedAt > Math.max(60, maximumFreshnessSeconds) * 1000
  );
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
