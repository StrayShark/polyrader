import { useNavigate } from 'react-router-dom';
import type { EsportsGame, Market, MatchResult, TeamBrief } from '@polyrader/core/browser';
import {
  isSubgameMarketQuestion,
  parsePolymarketMatch,
  type ParsedPolymarketMatch,
} from '../utils/match-parser';
import { formatOddsByFormat, type OddsFormat } from '../utils/bet-math';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '../utils/cn';
import { useI18n } from '../hooks/use-i18n';
import { hasDisplayableTwoWayPrices } from '../utils/match-eligibility';

interface MatchOddsRowProps {
  market: Market;
  markets?: Market[];
  className?: string;
  displayFormat?: OddsFormat;
  analysisReady?: boolean;
  liquidity?: number;
}

function formatScheduledAt(iso: string | undefined): string {
  if (!iso) return 'TBD';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'TBD';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isLive(market: Market): boolean {
  return market.match?.status === 'live';
}

function getMarketGame(market: Market, parsedGame: EsportsGame | null): EsportsGame | null {
  if (parsedGame) return parsedGame;
  const tag = market.tags.find(
    (item): item is EsportsGame =>
      item === 'cs2' || item === 'lol' || item === 'dota2' || item === 'valorant',
  );
  return tag ?? null;
}

function formatLiquidity(value: number | undefined): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return '$0';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    notation: amount >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: amount >= 10_000 ? 1 : 0,
  }).format(amount);
}

const GAME_TAG_CONFIG: Record<EsportsGame, { label: string; className: string }> = {
  cs2: { label: 'CS2', className: 'game-tag--cs2' },
  dota2: { label: 'Dota 2', className: 'game-tag--dota2' },
  lol: { label: 'LOL', className: 'game-tag--lol' },
  valorant: { label: 'Valorant', className: 'game-tag--valorant' },
};

function GameTag({ game }: { game: EsportsGame }) {
  const config = GAME_TAG_CONFIG[game];
  return (
    <span
      className={cn(
        'game-tag inline-flex h-5 shrink-0 items-center rounded px-1.5 font-mono text-[9px] font-medium leading-none',
        config.className,
      )}
      data-testid="game-tag"
      data-game={game}
    >
      {config.label}
    </span>
  );
}

function ReadinessSignal({
  label,
  active,
  activeLabel,
  inactiveLabel,
  testId,
}: {
  label: string;
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
  testId: string;
}) {
  const statusLabel = active ? activeLabel : inactiveLabel;
  return (
    <span
      className="inline-flex h-5 shrink-0 items-center gap-1"
      data-testid={testId}
      data-state={active ? 'on' : 'off'}
      title={statusLabel}
      aria-label={statusLabel}
    >
      <span
        className={cn(
          'h-2 w-2 shrink-0 rounded-full border',
          active
            ? 'border-green/60 bg-green text-green shadow-[0_0_5px_currentColor]'
            : 'border-border bg-muted-foreground/20',
        )}
        aria-hidden="true"
        data-testid={`${testId}-lamp`}
      />
      <span className="font-mono text-[9px] font-medium leading-none text-muted-foreground">
        {label}
      </span>
    </span>
  );
}

export function MatchOddsRow({
  market,
  markets,
  className,
  displayFormat = 'decimal',
  analysisReady = false,
  liquidity,
}: MatchOddsRowProps) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const groupedMarkets = markets?.length ? markets : [market];

  const parsed = parsePolymarketMatch(market.question);
  if (!parsed) return null;

  const teamAName = market.match?.teamA.name || parsed.teamAName;
  const teamBName = market.match?.teamB.name || parsed.teamBName;
  const format = market.match?.format || parsed.format;
  const parsedEventName = market.match?.eventName || parsed.eventName;
  const eventName =
    parsedEventName && parsedEventName !== 'Unknown Event'
      ? parsedEventName
      : `${teamAName} vs ${teamBName}`;
  const { eventStage, isMapMarket } = parsed;
  const game = getMarketGame(market, parsed.game);
  const live = isLive(market);
  const scheduledAt = market.match?.scheduledAt ?? market.endDate;

  const teamAData = market.match?.teamDetails?.teamA;
  const teamBData = market.match?.teamDetails?.teamB;
  const dataReady = market.match?.teamDetails?.isComplete === true;

  return (
    <div
      className={cn(
        'group flex min-h-[150px] cursor-pointer flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-foreground/25 hover:bg-accent/10',
        className,
      )}
      data-testid="match-odds-row"
      role="link"
      tabIndex={0}
      aria-label={`${teamAName} vs ${teamBName}`}
      onClick={() => navigate(`/match/${market.slug}`)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') navigate(`/match/${market.slug}`);
      }}
    >
      <div
        className="flex min-h-10 items-center gap-2 border-b border-border/70 px-3 text-[11px] text-muted-foreground"
        data-testid="match-card-meta"
      >
        {game && <GameTag game={game} />}
        {format && <span className="shrink-0 font-mono text-foreground/70">{format}</span>}
        <span
          className="min-w-0 flex-1 truncate text-foreground/80"
          data-testid="match-title"
        >
          {eventName}
        </span>
        {live ? (
          <span
            className="flex shrink-0 items-center gap-1 font-medium text-red"
            data-testid="match-date"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-red" aria-hidden="true" />
            {t('lobby.live')}
          </span>
        ) : (
          <time
            className="shrink-0 tabular-nums"
            dateTime={scheduledAt}
            data-testid="match-date"
          >
            {formatScheduledAt(scheduledAt)}
          </time>
        )}
        {eventStage && !isMapMarket && (
          <span className="hidden shrink-0 truncate text-muted-foreground xl:block">{eventStage}</span>
        )}
        <ReadinessSignal
          label={t('lobby.dataSignal')}
          active={dataReady}
          activeLabel={t('lobby.dataReady')}
          inactiveLabel={t('lobby.dataPending')}
          testId="data-ready-signal"
        />
        <ReadinessSignal
          label={t('lobby.llmSignal')}
          active={analysisReady}
          activeLabel={t('lobby.llmAnalyzed')}
          inactiveLabel={t('lobby.llmPending')}
          testId="llm-analysis-signal"
        />
        <span
          className="inline-flex h-5 shrink-0 items-center rounded bg-muted px-1.5 font-mono text-[9px] font-medium leading-none tabular-nums text-foreground"
          data-testid="market-liquidity"
        >
          {formatLiquidity(liquidity ?? market.liquidity)}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-3 pt-2.5">
        <MarketOddsGrid
          market={market}
          markets={groupedMarkets}
          displayFormat={displayFormat}
          teamAName={teamAName}
          teamBName={teamBName}
          teamAForm={teamAData?.recentForm.last10Matches}
          teamBForm={teamBData?.recentForm.last10Matches}
          t={t}
        />
      </div>
    </div>
  );
}

function getMarketLabel(
  parsed: ParsedPolymarketMatch,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (parsed.category === 'match_winner') return t('match.marketKind.match_winner');
  if (parsed.category === 'handicap') return t('match.marketKind.handicap');
  if (parsed.category === 'total_maps') return t('match.marketKind.total_maps');
  return parsed.marketLabel;
}

interface MatrixOutcome {
  selection: string;
  odds: number;
  detailLabel?: string;
}

const LOBBY_MARKET_CATEGORY_ORDER = ['match_winner', 'handicap', 'total_maps'] as const;
type LobbyMarketCategory = (typeof LOBBY_MARKET_CATEGORY_ORDER)[number];

function isLobbyMarketCategory(category: ParsedPolymarketMatch['category']): category is LobbyMarketCategory {
  return LOBBY_MARKET_CATEGORY_ORDER.some((item) => item === category);
}

function normalizeOutcomeName(name: string): string {
  return cleanOutcomeLabel(name, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isNonTeamOutcome(name: string): boolean {
  return /^(yes|no|over|under|o\s*\d|u\s*\d)/i.test(name.trim());
}

function getOutcomeDetailLabel(selection: string, isTeamOutcome: boolean): string | undefined {
  if (!isTeamOutcome) return selection;
  const line = selection.match(/\(([+-]?\d+(?:\.\d+)?)\)\s*$/)?.[1]
    ?? selection.match(/\s([+-]\d+(?:\.\d+)?)\s*$/)?.[1];
  return line;
}

function getMarketOutcomes(
  market: Market,
  parsed: ParsedPolymarketMatch,
  teamAName: string,
  teamBName: string,
): MatrixOutcome[] {
  const outcomes = [0, 1].map((index) => {
    const rawSelection = market.outcomes[index] ?? '';
    const selection =
      (parsed.category === 'match_winner' || parsed.category === 'map_winner') &&
      /^(yes|no)$/i.test(rawSelection)
        ? index === 0
          ? teamAName
          : teamBName
        : rawSelection;
    const price = parseFloat(market.outcomePrices[index] ?? '0');
    const isTeamOutcome = !isNonTeamOutcome(selection);
    return {
      selection,
      odds: price > 0 ? 1 / price : 0,
      detailLabel: getOutcomeDetailLabel(selection, isTeamOutcome),
    };
  });

  const [first, second] = outcomes;
  if (
    first &&
    second &&
    !isNonTeamOutcome(first.selection) &&
    !isNonTeamOutcome(second.selection)
  ) {
    const firstTeam = normalizeOutcomeName(first.selection);
    const secondTeam = normalizeOutcomeName(second.selection);
    const teamA = normalizeOutcomeName(teamAName);
    const teamB = normalizeOutcomeName(teamBName);
    if (firstTeam === teamB && secondTeam === teamA) return [second, first];
  }

  return outcomes;
}

function cleanOutcomeLabel(selection: string, fallback: string): string {
  const cleaned = selection
    .replace(/\s*\([+-]?\d+(?:\.\d+)?\)\s*$/i, '')
    .replace(/\s+[+-]\d+(?:\.\d+)?\s*$/i, '')
    .trim();
  return cleaned || fallback;
}

function getTeamDisplayName(team?: TeamBrief, fallbackName = ''): string {
  return team?.name || fallbackName;
}

function MarketOddsGrid({
  market,
  markets,
  displayFormat,
  teamAName,
  teamBName,
  teamAForm,
  teamBForm,
  t,
}: {
  market: Market;
  markets: Market[];
  displayFormat: OddsFormat;
  teamAName: string;
  teamBName: string;
  teamAForm?: MatchResult[];
  teamBForm?: MatchResult[];
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const columnsByCategory = new Map<
    LobbyMarketCategory,
    {
      market: Market;
      category: LobbyMarketCategory;
      parsed: ParsedPolymarketMatch;
      label: string;
      outcomes: MatrixOutcome[];
    }
  >();
  for (const item of markets) {
    const parsed = parsePolymarketMatch(item.question);
    if (
      !parsed ||
      !isLobbyMarketCategory(parsed.category) ||
      isSubgameMarketQuestion(item.question) ||
      !hasDisplayableTwoWayPrices(item.outcomePrices)
    ) {
      continue;
    }
    const existing = columnsByCategory.get(parsed.category);
    if (!existing || (item.liquidity ?? 0) > (existing.market.liquidity ?? 0)) {
      columnsByCategory.set(parsed.category, {
        market: item,
        category: parsed.category,
        parsed,
        label: getMarketLabel(parsed, t),
        outcomes: getMarketOutcomes(item, parsed, teamAName, teamBName),
      });
    }
  }
  const columns = LOBBY_MARKET_CATEGORY_ORDER
    .map((category) => columnsByCategory.get(category))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return (
    <div
      className="overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data-testid="market-odds-scroll"
    >
      <div className="grid min-w-[430px] grid-cols-[minmax(110px,1fr)_auto] gap-3">
        <div className="grid grid-rows-[18px_32px_32px] gap-1">
          <div className="flex h-[18px] items-center px-1 text-[9px] font-medium uppercase text-muted-foreground">
            VS
          </div>
          <LobbyTeamRow
            team={market.match?.teamA}
            fallbackName={teamAName}
            displayName={getTeamDisplayName(market.match?.teamA, teamAName)}
            form={teamAForm}
            score={market.match?.currentScore?.teamA}
          />
          <LobbyTeamRow
            team={market.match?.teamB}
            fallbackName={teamBName}
            displayName={getTeamDisplayName(market.match?.teamB, teamBName)}
            form={teamBForm}
            score={market.match?.currentScore?.teamB}
          />
        </div>
        <div
          className="grid justify-start gap-1.5"
          style={{
            gridTemplateColumns: columns
              .map((column) => column.category === 'match_winner' ? '80px' : '104px')
              .join(' '),
          }}
          data-testid="market-odds-grid"
        >
          {columns.map((column) => (
            <MarketOddsColumn
              key={column.market.conditionId}
              category={column.category}
              label={column.label}
              teamAName={teamAName}
              teamBName={teamBName}
              outcomes={column.outcomes}
              displayFormat={displayFormat}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function MarketOddsColumn({
  category,
  label,
  teamAName,
  teamBName,
  outcomes,
  displayFormat,
}: {
  category: LobbyMarketCategory;
  label: string;
  teamAName: string;
  teamBName: string;
  outcomes: MatrixOutcome[];
  displayFormat: OddsFormat;
}) {
  return (
    <div
      className="grid min-w-0 grid-rows-[18px_32px_32px] gap-1"
      data-market-category={category}
    >
      <div className="flex h-[18px] items-center px-1 text-[9px] font-medium uppercase text-muted-foreground">
        <span className="truncate">{label}</span>
      </div>
      <MatrixOddsQuote
        odds={outcomes[0]?.odds ?? 0}
        selection={outcomes[0]?.selection ?? teamAName}
        detailLabel={outcomes[0]?.detailLabel}
        displayFormat={displayFormat}
        showSelection={category !== 'match_winner'}
      />
      <MatrixOddsQuote
        odds={outcomes[1]?.odds ?? 0}
        selection={outcomes[1]?.selection ?? teamBName}
        detailLabel={outcomes[1]?.detailLabel}
        displayFormat={displayFormat}
        showSelection={category !== 'match_winner'}
      />
    </div>
  );
}

function MatrixOddsQuote({
  odds,
  selection,
  detailLabel,
  displayFormat,
  showSelection,
}: {
  odds: number;
  selection: string;
  detailLabel?: string;
  displayFormat: OddsFormat;
  showSelection: boolean;
}) {
  const mainValue = formatOddsByFormat(odds, displayFormat);
  const outcomeLabel = showSelection ? formatOutcomeLabel(selection, detailLabel) : null;

  return (
    <div
      className={buttonVariants({
        variant: 'secondary',
        size: 'sm',
        className: cn(
          'h-8 max-w-full min-w-0 items-center gap-2 border border-border/70 px-2.5 leading-none shadow-sm',
          showSelection ? 'w-[104px] justify-between text-left' : 'w-20 justify-center text-center',
        ),
      })}
      data-testid="odds-quote"
      data-variant="secondary"
      data-show-selection={showSelection ? 'true' : 'false'}
      aria-label={`${selection} ${mainValue}`}
    >
      {outcomeLabel && (
        <span className="min-w-0 truncate text-[10px] font-medium uppercase leading-none text-muted-foreground">
          {outcomeLabel}
        </span>
      )}
      <span className="shrink-0 text-xs font-semibold leading-none tabular-nums text-foreground">{mainValue}</span>
    </div>
  );
}

function formatOutcomeLabel(selection: string, detailLabel?: string): string {
  const shortSelection = cleanOutcomeLabel(selection, selection)
    .replace(/^Over\s+/i, 'O ')
    .replace(/^Under\s+/i, 'U ');
  if (detailLabel && /^[+-]/.test(detailLabel)) return `${shortSelection} ${detailLabel}`;
  if (/^(?:Over|Under)\s+/i.test(detailLabel ?? '')) {
    return String(detailLabel).replace(/^Over\s+/i, 'O ').replace(/^Under\s+/i, 'U ');
  }
  return shortSelection;
}

function LobbyTeamRow({
  team,
  fallbackName,
  displayName,
  form = [],
  score,
}: {
  team?: TeamBrief;
  fallbackName: string;
  displayName?: string;
  form?: MatchResult[];
  score?: number;
}) {
  const name = displayName || team?.name || fallbackName;
  const rank = team?.rank && team.rank > 0 && team.rank < 999 ? `#${team.rank}` : null;
  return (
    <div
      className="flex h-8 min-w-0 items-center gap-2 rounded-md px-1 leading-none"
      data-testid="match-team-row"
    >
      <span
        className="min-w-0 flex-1 truncate text-sm font-medium leading-none"
        data-testid="match-team-name"
      >
        {name}
      </span>
      {rank && (
        <span className="shrink-0 font-mono text-[10px] leading-none text-muted-foreground">
          {rank}
        </span>
      )}
      {form.length > 0 && (
        <div className="flex shrink-0 items-center gap-1.5" data-testid="match-team-form">
          {form.slice(0, 3).map((result, index) => (
            <span
              key={`${result.date}-${index}`}
              className={cn(
                'font-mono text-[9px] font-medium leading-none',
                result.result === 'win'
                  ? 'text-green'
                  : result.result === 'loss'
                    ? 'text-red'
                    : 'text-muted-foreground',
              )}
              title={`${result.opponent} ${result.score}`}
            >
              {result.result === 'win' ? 'W' : result.result === 'loss' ? 'L' : 'D'}
            </span>
          ))}
        </div>
      )}
      {score !== undefined && (
        <span className="shrink-0 font-mono text-sm font-semibold leading-none tabular-nums">
          {score}
        </span>
      )}
    </div>
  );
}
