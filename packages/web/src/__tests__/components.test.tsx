import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ToastProvider } from '../components/ToastProvider';
import { PriceChart } from '../components/PriceChart';
import { CalibrationChart } from '../components/CalibrationChart';
import { DotaDataQualityPanel } from '../components/DotaDataQualityPanel';
import { DotaSprint3EvidencePanel } from '../components/DotaSprint3EvidencePanel';
import { RiotGameDataQualityPanel } from '../components/RiotGameDataQualityPanel';
import {
  buildDota2FixtureFacts,
  buildLolFixtureFacts,
  buildValorantFixtureFacts,
  type DotaAnalysisEligibility,
  type DotaDataQuality,
  type EsportsTeamAlias,
  type MarketAlignmentResult,
  type RiotGameDataQuality,
} from '@polyrader/core/browser';

// ============================================================
// ErrorBoundary
// ============================================================
describe('ErrorBoundary', () => {
  it('renders children normally', () => {
    const { container } = render(
      <ErrorBoundary>
        <div>Hello World</div>
      </ErrorBoundary>,
    );
    expect(container.textContent).toContain('Hello World');
  });

  it('renders fallback on error', () => {
    const ThrowError = () => {
      throw new Error('Test error');
    };

    const { container } = render(
      <ErrorBoundary fallback={<div>Custom Error</div>}>
        <ThrowError />
      </ErrorBoundary>,
    );
    expect(container.textContent).toContain('Custom Error');
  });

  it('renders default error UI', () => {
    const ThrowError = () => {
      throw new Error('Something broke');
    };

    const { container } = render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
    );
    expect(container.textContent).toContain('Something broke');
  });
});

// ============================================================
// ToastProvider
// ============================================================
describe('ToastProvider', () => {
  it('renders children', () => {
    const { container } = render(
      <ToastProvider>
        <div>Content</div>
      </ToastProvider>,
    );
    expect(container.textContent).toContain('Content');
  });
});

// ============================================================
// PriceChart
// ============================================================
describe('PriceChart', () => {
  it('renders with empty data', () => {
    const { container } = render(
      <BrowserRouter>
        <PriceChart data={[]} />
      </BrowserRouter>,
    );
    expect(container.querySelector('div')).toBeTruthy();
  });

  it('renders with data', () => {
    const data = [
      { time: '2025-01-01T00:00:00Z', value: 0.55 },
      { time: '2025-01-01T01:00:00Z', value: 0.56 },
    ];
    const { container } = render(
      <BrowserRouter>
        <PriceChart data={data} />
      </BrowserRouter>,
    );
    expect(container.querySelector('div')).toBeTruthy();
  });

  it('renders with label', () => {
    const { container } = render(
      <BrowserRouter>
        <PriceChart data={[]} label="Test Chart" />
      </BrowserRouter>,
    );
    expect(container.textContent).toContain('Test Chart');
  });
});

// ============================================================
// CalibrationChart
// ============================================================
describe('CalibrationChart', () => {
  it('renders empty state', () => {
    const { container } = render(
      <BrowserRouter>
        <CalibrationChart data={[]} />
      </BrowserRouter>,
    );
    expect(container.textContent).toContain('暂无校准数据');
  });

  it('renders with data', () => {
    const data = [
      { confidenceBucket: 5, accuracy: 0.52, sampleCount: 10 },
      { confidenceBucket: 7, accuracy: 0.71, sampleCount: 15 },
      { confidenceBucket: 9, accuracy: 0.88, sampleCount: 8 },
    ];
    const { container } = render(
      <BrowserRouter>
        <CalibrationChart data={data} providerName="openai" />
      </BrowserRouter>,
    );
    expect(container.textContent).toContain('openai');
  });
});

describe('DotaDataQualityPanel', () => {
  it('renders both teams, field evidence, roster metrics, and hero pool', () => {
    const { getByTestId, getByText } = render(
      <DotaDataQualityPanel match={buildDota2FixtureFacts(new Date('2026-07-21T12:00:00.000Z'))} />,
    );

    expect(getByTestId('dota-quality-side-a')).toHaveTextContent('Team Liquid');
    expect(getByTestId('dota-quality-side-b')).toHaveTextContent('Team Falcons');
    expect(getByText('Hero #1')).toBeInTheDocument();
    expect(getByTestId('dota-data-quality-panel')).toHaveTextContent('opendota');
  });

  it('does not label missing current data as stale', () => {
    const match = buildDota2FixtureFacts(new Date('2026-07-21T12:00:00.000Z'));
    const qualityFact = match.facts.find((fact) => fact.factId === 'dota-data-quality');
    if (!qualityFact || typeof qualityFact.value !== 'object' || qualityFact.value == null) {
      throw new Error('Dota quality fixture is missing');
    }
    const quality = qualityFact.value as DotaDataQuality;
    const rating = quality.sides[0]?.fields.find((field) => field.field === 'rating');
    if (!rating) throw new Error('Dota rating quality fixture is missing');
    quality.bothTeamsComplete = false;
    quality.bothTeamsFresh = false;
    quality.sides[0]!.complete = false;
    quality.sides[0]!.fresh = false;
    rating.status = 'missing';
    rating.reason = 'TEAM_RATING_MISSING';
    rating.ageSeconds = undefined;

    const { queryByText } = render(<DotaDataQualityPanel match={match} />);

    expect(queryByText('来源过期')).not.toBeInTheDocument();
  });
});

describe('RiotGameDataQualityPanel', () => {
  it('renders LoL quality evidence for both teams', () => {
    const { getByTestId } = render(
      <RiotGameDataQualityPanel match={buildLolFixtureFacts(new Date('2026-07-21T12:00:00.000Z'))} />,
    );

    expect(getByTestId('lol-quality-side-a')).toHaveTextContent('T1');
    expect(getByTestId('lol-quality-side-b')).toHaveTextContent('Hanwha Life Esports');
    expect(getByTestId('lol-data-quality-panel')).toHaveTextContent('liquipedia');
  });

  it('renders Valorant map-pool evidence without labeling missing roster as stale', () => {
    const match = buildValorantFixtureFacts(new Date('2026-07-21T12:00:00.000Z'));
    const qualityFact = match.facts.find((fact) => fact.factId === 'valorant-data-quality');
    if (!qualityFact || typeof qualityFact.value !== 'object' || qualityFact.value == null) {
      throw new Error('Valorant quality fixture is missing');
    }
    const quality = qualityFact.value as RiotGameDataQuality;
    const roster = quality.sides[0]?.fields.find((field) => field.field === 'roster');
    if (!roster) throw new Error('Valorant roster quality fixture is missing');
    quality.bothTeamsComplete = false;
    quality.bothTeamsFresh = false;
    quality.sides[0]!.complete = false;
    quality.sides[0]!.fresh = false;
    roster.status = 'missing';
    roster.reason = 'TEAM_ROSTER_MISSING';
    roster.ageSeconds = undefined;

    const { getByTestId, queryByText } = render(<RiotGameDataQualityPanel match={match} />);

    expect(getByTestId('valorant-data-quality-panel')).toHaveTextContent('地图池');
    expect(queryByText('来源过期')).not.toBeInTheDocument();
  });
});

describe('DotaSprint3EvidencePanel', () => {
  it('shows every alias candidate with source evidence and switches supported markets', () => {
    const onSelectMarket = vi.fn();
    const alignment: MarketAlignmentResult = {
      aligned: true,
      status: 'aligned',
      detail: 'two supported markets',
      evidenceType: 'mixed',
      realMarketCount: 1,
      syntheticMarketCount: 1,
      lowLiquidityMarketIds: ['real-total'],
      markets: [
        marketIdentity('fixture-winner', 'match_winner', 'synthetic', 0),
        marketIdentity('real-total', 'total_maps', 'real', 600),
      ],
    };
    const eligibility: DotaAnalysisEligibility = {
      contractVersion: 'dota-analysis-eligibility.v1',
      analysisEligible: true,
      paperOrderEligible: false,
      mode: 'observe_only',
      reasonCodes: ['LOW_LIQUIDITY_OBSERVE_ONLY'],
      selectedMarket: alignment.markets[1],
      checkedAt: '2026-07-23T08:00:00.000Z',
    };
    const aliases: EsportsTeamAlias[] = [
      {
        id: 1,
        game: 'dota2',
        source: 'liquipedia',
        sourceTeamId: 'liquid-liquipedia',
        alias: 'Team Liquid',
        normalizedAlias: 'teamliquid',
        targetSource: 'opendota',
        status: 'conflict',
        method: 'candidate_search',
        confidence: 0.84,
        candidateTeamIds: ['2163', '9999'],
        evidence: {
          candidateTeams: [
            {
              teamId: '2163',
              name: 'Team Liquid',
              sourceUrl: 'https://www.opendota.com/teams/2163',
            },
            {
              teamId: '9999',
              name: 'Team Liquid Academy',
              sourceUrl: 'https://www.opendota.com/teams/9999',
            },
          ],
        },
        observedAt: '2026-07-23T08:00:00.000Z',
      },
    ];

    const { getByRole, getByText } = render(
      <DotaSprint3EvidencePanel
        alignment={alignment}
        eligibility={eligibility}
        aliases={aliases}
        selectedMarketId="real-total"
        onSelectMarket={onSelectMarket}
        onReviewed={() => undefined}
      />,
    );

    expect(getByText('2163')).toBeInTheDocument();
    expect(getByText('9999')).toBeInTheDocument();
    expect(getByText('Team Liquid Academy')).toBeInTheDocument();
    expect(getByText('LOW_LIQUIDITY_OBSERVE_ONLY')).toBeInTheDocument();
    fireEvent.click(getByRole('button', { name: /match winner/i }));
    expect(onSelectMarket).toHaveBeenCalledWith('fixture-winner');
  });
});

function marketIdentity(
  marketId: string,
  kind: 'match_winner' | 'total_maps',
  evidenceType: 'real' | 'synthetic',
  liquidityUsd: number,
): MarketAlignmentResult['markets'][number] {
  return {
    marketId,
    matchId: 'fixture-match',
    game: 'dota2',
    kind,
    line: kind === 'total_maps' ? 2.5 : null,
    outcomes: [
      { outcomeId: 'a', label: 'Team Liquid' },
      { outcomeId: 'b', label: 'Team Falcons' },
    ],
    settlementRuleId: `dota2.${kind}.v1`,
    settlementSupported: true,
    liquidityUsd,
    liquidityStatus:
      evidenceType === 'synthetic' ? 'synthetic' : liquidityUsd < 1_000 ? 'low' : 'normal',
    evidenceType,
    warnings: evidenceType === 'real' && liquidityUsd < 1_000 ? ['low_liquidity'] : [],
  };
}
