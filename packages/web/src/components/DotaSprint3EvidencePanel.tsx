import { useState } from 'react';
import { Check, ExternalLink, GitMerge, ShieldCheck, TriangleAlert } from 'lucide-react';
import type {
  DotaAnalysisEligibility,
  EsportsGame,
  EsportsTeamAlias,
  MarketAlignmentResult,
} from '@polyrader/core/browser';
import { Badge, Button, Card, CardHeader, CardTitle } from '@/components/ui';
import { api } from '../utils/api';

type AnalysisEligibilityLike = Pick<
  DotaAnalysisEligibility,
  'analysisEligible' | 'paperOrderEligible' | 'mode' | 'reasonCodes' | 'selectedMarket'
>;

export function DotaSprint3EvidencePanel({
  game = 'dota2',
  alignment,
  eligibility,
  aliases,
  selectedMarketId,
  onSelectMarket,
  onReviewed,
}: {
  game?: EsportsGame;
  alignment?: MarketAlignmentResult;
  eligibility?: AnalysisEligibilityLike;
  aliases: EsportsTeamAlias[];
  selectedMarketId?: string;
  onSelectMarket: (marketId: string) => void;
  onReviewed: () => void;
}) {
  const [pendingId, setPendingId] = useState<number | null>(null);

  const review = async (
    alias: EsportsTeamAlias,
    status: 'confirmed' | 'rejected',
    selectedTargetTeamId?: string,
  ) => {
    const targetTeamId =
      selectedTargetTeamId ?? alias.targetTeamId ?? alias.candidateTeamIds?.[0];
    if (status === 'confirmed' && !targetTeamId) return;
    setPendingId(alias.id ?? null);
    try {
      await api.post(`/esports/sources/${game}/team-aliases/review`, {
        source: alias.source,
        sourceTeamId: alias.sourceTeamId,
        alias: alias.alias,
        targetSource: alias.targetSource,
        targetTeamId,
        status,
        evidence: {
          previousStatus: alias.status,
          previousMethod: alias.method,
          selectedTargetTeamId: targetTeamId,
        },
      });
      onReviewed();
    } finally {
      setPendingId(null);
    }
  };

  const reviewRows = aliases
    .filter((item) => item.status !== 'rejected')
    .slice(0, 10);
  const unresolvedCount = aliases.filter((item) =>
    ['candidate', 'conflict', 'unmatched'].includes(item.status),
  ).length;

  return (
    <Card className="overflow-hidden p-0" data-testid="dota-sprint3-evidence-panel">
      <CardHeader className="flex-row items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <GitMerge className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm">
            {game === 'dota2'
              ? 'Dota identity & market evidence'
              : game === 'lol'
                ? 'LoL identity & market evidence'
                : game === 'valorant'
                  ? 'Valorant identity & market evidence'
                  : 'Identity & market evidence'}
          </CardTitle>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge
            variant={
              eligibility?.analysisEligible
                ? eligibility.paperOrderEligible
                  ? 'green'
                  : 'yellow'
                : 'destructive'
            }
          >
            {eligibility?.mode ?? 'blocked'}
          </Badge>
          <Badge variant={alignment?.evidenceType === 'real' ? 'green' : 'secondary'}>
            {alignment?.evidenceType ?? 'none'} evidence
          </Badge>
          <Badge variant={unresolvedCount > 0 ? 'yellow' : 'green'}>
            {unresolvedCount} aliases to review
          </Badge>
        </div>
      </CardHeader>

      <div className="grid divide-y divide-border lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <section className="min-w-0 px-4 py-4">
          <div className="mb-3 text-xs font-medium uppercase text-muted-foreground">
            Market alignment
          </div>
          <div className="divide-y divide-border border-y border-border">
            {(alignment?.markets ?? []).map((market) => (
              <button
                type="button"
                key={market.marketId}
                className="grid w-full grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 py-2 text-left text-xs disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!market.settlementSupported}
                onClick={() => onSelectMarket(market.marketId)}
              >
                <span className="flex h-[18px] w-[18px] items-center justify-center border border-border">
                  {selectedMarketId === market.marketId && <Check className="h-3 w-3" />}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-medium">{market.kind.replaceAll('_', ' ')}</div>
                  <div className="truncate text-muted-foreground" title={market.settlementRuleId}>
                    {market.settlementRuleId}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline">{market.evidenceType}</Badge>
                  <Badge variant={market.liquidityStatus === 'low' ? 'yellow' : 'secondary'}>
                    {market.liquidityStatus}
                    {market.liquidityUsd != null ? ` $${market.liquidityUsd.toFixed(0)}` : ''}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
          {eligibility && eligibility.reasonCodes.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1" data-testid="dota-eligibility-reasons">
              {eligibility.reasonCodes.map((code) => (
                <Badge key={code} variant="yellow">
                  {code}
                </Badge>
              ))}
            </div>
          )}
          {(alignment?.lowLiquidityMarketIds.length ?? 0) > 0 && (
            <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 text-warning" />
              Real liquidity below $1,000. Analysis remains observe-only.
            </div>
          )}
        </section>

        <section className="min-w-0 px-4 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-xs font-medium uppercase text-muted-foreground">
              Team alias review
            </div>
            <span className="font-mono text-xs text-muted-foreground">{aliases.length} records</span>
          </div>
          <div className="divide-y divide-border border-y border-border">
            {reviewRows.map((alias) => {
              const candidates = aliasCandidates(alias);
              return (
                <div key={alias.id ?? `${alias.source}:${alias.normalizedAlias}`} className="py-2">
                  <div className="flex items-center gap-2 text-xs">
                    <Badge
                      variant={
                        alias.status === 'confirmed'
                          ? 'green'
                          : alias.status === 'conflict'
                            ? 'destructive'
                            : 'yellow'
                      }
                    >
                      {alias.status}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate font-medium">{alias.alias}</span>
                    <span className="font-mono text-muted-foreground">
                      {Math.round(alias.confidence * 100)}%
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{alias.source} → {alias.targetTeamId ?? 'unresolved'}</span>
                    <span className="ml-auto shrink-0">{alias.method}</span>
                    {alias.status !== 'confirmed' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11px]"
                        disabled={pendingId === alias.id}
                        onClick={() => void review(alias, 'rejected')}
                      >
                        Reject
                      </Button>
                    )}
                  </div>
                  {candidates.length > 0 && (
                    <div className="mt-2 divide-y divide-border border-y border-border/70">
                      {candidates.map((candidate) => (
                        <div
                          key={candidate.teamId}
                          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-1.5 text-[11px]"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">{candidate.name}</div>
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <span className="font-mono">{candidate.teamId}</span>
                              <a
                                href={candidate.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex hover:text-foreground"
                                title="OpenDota team source"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          </div>
                          {alias.status !== 'confirmed' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[11px]"
                              disabled={pendingId === alias.id}
                              onClick={() => void review(alias, 'confirmed', candidate.teamId)}
                            >
                              <ShieldCheck className="h-3 w-3" />
                              Confirm
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {reviewRows.length === 0 && (
              <div className="py-6 text-center text-xs text-muted-foreground">
                Sync Dota sources to generate alias evidence.
              </div>
            )}
          </div>
        </section>
      </div>
    </Card>
  );
}

interface AliasCandidate {
  teamId: string;
  name: string;
  sourceUrl: string;
}

function aliasCandidates(alias: EsportsTeamAlias): AliasCandidate[] {
  const evidence = alias.evidence?.candidateTeams;
  const rows = Array.isArray(evidence) ? evidence : [];
  const byId = new Map<string, AliasCandidate>();
  for (const item of rows) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const teamId = String(row.teamId ?? '');
    if (!teamId) continue;
    byId.set(teamId, {
      teamId,
      name: String(row.name ?? teamId),
      sourceUrl: String(row.sourceUrl ?? `https://www.opendota.com/teams/${teamId}`),
    });
  }
  for (const teamId of alias.candidateTeamIds ?? []) {
    if (!byId.has(teamId)) {
      byId.set(teamId, {
        teamId,
        name: teamId,
        sourceUrl: `https://www.opendota.com/teams/${teamId}`,
      });
    }
  }
  return [...byId.values()];
}
