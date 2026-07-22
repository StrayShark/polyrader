# Four-Game LLM Simbook Product Plan

Status: Current product plan
Last updated: 2026-07-22

## 1. Product Positioning

PolyRader is a local-first esports probability analysis and simulated betting
workbench. It lets a user verify the quality of four game data boards, run one or
more LLMs against versioned data, convert valid model edges into local simulated
orders, settle those orders from authoritative results, and study calibration,
win rate, and equity behavior.

Supported product boards:

- Counter-Strike 2
- League of Legends
- Dota 2
- Valorant

The product is for practice and research. Public market feeds provide prices and
liquidity context. They do not turn the primary workflow into real-money wagering.

## 2. Product Success Definition

A board is functional only when one test match can complete this sequence:

```text
Source sync
  -> normalized match/team/player/roster facts
  -> market identity and settlement rules
  -> standard prompt artifact
  -> schema-valid LLM response
  -> normalized analysis report
  -> deterministic paper-order decision
  -> local simulated order
  -> authoritative settlement
  -> win-rate, Brier, CLV, PnL and equity update
```

Merely showing a configured source or a fetched roster does not pass board
acceptance.

## 3. Primary Users And Jobs

### Analyst

- Verify whether a match has enough fresh, aligned facts for analysis.
- Compare market probability, individual LLM probabilities, and consensus.
- Inspect the exact standard prompt, raw response, normalized response, and risk
  decision.

### Practice bettor

- Configure deterministic simulated-order policy.
- Let valid LLM reports create local paper orders.
- Track exposure, open orders, settlements, PnL, drawdown, and discipline.

### Model evaluator

- Compare providers, prompt versions, games, market kinds, and data-quality bands.
- Measure Brier Score, log loss, calibration error, win rate, ROI, CLV, and sample
  uncertainty.
- Reproduce any historical run from immutable artifacts.

## 4. Information Architecture

### Main navigation

| Area | Responsibility |
| --- | --- |
| Event Lobby | Four-game match and market discovery |
| Validation Lab | Board release status and source-to-order test runs |
| My Ledger | Equity, simulated orders, settlement, and review |
| Strategy Lab | Deterministic policy and signal calibration |
| Settings | LLM keys, data sources, database, theme, and language |

Advanced model evaluation is reached from the ledger and reports, not exposed as a
large collection of unrelated primary-navigation pages.

### My Ledger tabs

1. `Portfolio`: combined virtual account, equity curve, exposure, and cash ledger.
2. `Paper Orders`: open, settled, rejected, and passed LLM decisions.
3. `Performance`: model, game, market, and prompt-version attribution.
4. `Review`: decision journal, mistakes, CLV, and report replay.

## 5. Four-Game Validation Lab

### Purpose

One screen must prove what works for each board and identify the exact failed stage.

### Board summary

Each game segment displays:

- Release state: `blocked`, `data_ready`, `analysis_ready`, `paper_ready`, `verified`.
- Last successful end-to-end run.
- Current source health and newest observation time.
- Normalized matches, teams, players, rosters, and aligned markets.
- Data completeness and freshness distribution.
- Last seven run outcomes.

### Test-run workflow

1. Select game, match, market, provider set, and policy profile.
2. Run preflight checks.
3. Freeze the data snapshot and create the run ID.
4. Show standard prompt before provider execution.
5. Execute providers and validate responses independently.
6. Produce provider reports and consensus.
7. Apply paper policy and create or reject the simulated order.
8. Display an append-only event timeline and artifact links.

### Required stage statuses

- `waiting`
- `running`
- `passed`
- `warning`
- `failed`
- `skipped`

The page must never collapse all failures into “Load failed.”

## 6. Standard Analysis Report UI

### Report header

- Game, match, market, start time, report ID, and run ID.
- Provider/model, prompt version, contract version, generated time, and duration.
- Data completeness, freshness, market liquidity, and validation state.

### Report body

- Outcome probabilities and market comparison.
- Confidence grade and calibrated confidence.
- Paper decision: selection or pass, deterministic reason codes, policy profile.
- Evidence list with fact source and observation time.
- Risks, missing inputs, and stale facts.
- Provider comparison and consensus dispersion.
- Market scenarios for match winner, map winner, handicap, totals, or correct score
  only when a game-specific model supports them.

### Audit tabs

- `Report`: normalized user-facing analysis.
- `Prompt`: immutable system prompt, JSON input envelope, and output schema.
- `Response`: raw provider response, normalized response, validation errors, and
  repair attempt.
- `Timeline`: source freeze, provider request, validation, decision, order, and
  settlement events.

Do not display or request hidden chain-of-thought.

## 7. LLM Simulated-Order Product Design

### Policy controls

- Enabled games.
- Enabled providers and prompt versions.
- Minimum data completeness and maximum age.
- Minimum confidence and edge.
- Fixed, proportional, fractional Kelly, or no-bet strategy.
- Maximum single stake, daily stake, per-game exposure, per-provider exposure, and
  total open exposure.
- Market-kind allowlist.
- Low-liquidity threshold and stake reduction.
- Require authoritative settlement rules.

### Decision separation

- LLM: probabilities, confidence, evidence, risks, recommendation.
- Runtime: edge, eligibility, stake, price, idempotency, exposure, and order status.
- Settlement service: result source, winning outcome, void rules, and PnL.

### Paper order row

Every row includes:

- Game, match, market kind, selection.
- Provider/model and report ID.
- Model probability, market probability, edge, price, and CLV when available.
- Amount, policy profile, status, placed time, settlement source, and PnL.
- Pass/rejection reason for decisions that did not create an order.

The product records pass decisions so model selectivity can be measured.

## 8. Win-Rate And Asset Statistics

### Portfolio summary

- Starting equity.
- Current equity.
- Available virtual cash.
- Open exposure.
- Realized and unrealized PnL.
- ROI, maximum drawdown, volatility, and Sharpe ratio.
- Settled sample count and settlement coverage.

### Model-quality summary

- Win rate with Wilson confidence interval.
- Brier Score and log loss.
- Expected calibration error.
- Average model edge at entry.
- CLV against final pre-match price.
- Pass rate, order conversion rate, and invalid-response rate.

Win rate is never displayed alone as proof of quality.

### Equity curve

Controls:

- Period: day, week, month, all.
- Game: all or one board.
- Provider/model.
- Prompt version.
- Market kind.
- Policy profile.
- Realized-only or mark-to-market.

Series:

- Total equity.
- Realized equity.
- Open exposure.
- Optional provider comparison, limited to a small number of selected lines.

Annotations:

- Settlements.
- Prompt or policy version changes.
- Largest drawdowns.
- Data-source incidents.

### Attribution tables

All statistics can be grouped by:

- Game.
- Provider and model.
- Prompt version.
- Market kind.
- Event tier.
- Data-completeness band.
- Confidence band.
- Edge band.

Each row includes settled sample size and an uncertainty indicator. Fewer than 30
settled orders shows a small-sample warning; fewer than 10 suppresses rankings.

## 9. Board-Specific Minimum Facts

| Board | Minimum analysis facts | Board-specific additions |
| --- | --- | --- |
| CS2 | Match, teams, current roster, rank, recent form | Map pool, veto, side, player rating |
| LoL | Match, teams, current roster, patch | Positions, champion pool, draft when available |
| Dota 2 | Match, teams, current roster, rating, patch | Positions, hero pool, draft when available |
| Valorant | Match, teams, current roster, map pool | Agent composition, map record, side splits |

Facts not available from a supported source remain missing. The model must not infer
them from team reputation.

## 10. Current-State Gap Analysis

### Implemented

- Immutable `analysis.v1` run, prompt, response, report, event, and validation
  artifacts with strict response validation and stable hashes.
- A standard report surface with Report, Prompt, Response, and Timeline tabs.
- A four-game source catalog, immutable source snapshots, normalized fact storage,
  and Validation Lab preflight states.
- A deterministic, versioned `PaperDecisionEngine` and canonical `sim_bets` linkage
  for eligible reports; pass and rejection decisions are retained for audit.
- A unified Portfolio, Paper Orders, Performance, and Review account workspace.
- Performance summaries for settled sample count, Wilson interval, Brier Score, ECE,
  ROI, PnL, equity, maximum drawdown, and game/provider/market groupings.

### Partial

- CS2 has the only proven real prompt-to-paper-order chain. Its current facts are
  stale under the active one-hour policy and must refresh before another order.
- Dota 2 has real match/team/player snapshots and normalized facts, but no supported
  runtime settlement loop or aligned publishable market.
- LoL has patch and roster source support but no complete normalized future match.
  Valorant has roster source support but no complete normalized future match.
- Market identity is game-aware, but runtime settlement support is currently limited
  to CS2 match/map/handicap/total markets.
- Performance attribution lacks real settled samples, log loss, closing-price CLV,
  volatility/Sharpe, and complete prompt/policy/data-quality filtering.
- Paper policy covers edge, confidence, completeness, freshness, liquidity, and stake
  sizing, but not yet daily, per-game, per-provider, total-open-exposure, or
  market-kind limits.

### Not implemented

- A complete current-source schedule, analysis, paper decision, authoritative
  settlement, and statistics loop for LoL, Dota 2, or Valorant.
- The required per-board release-gate Playwright suites and fixture plus real-source
  smoke evidence. Current release verification is 0/4 boards.
- Multi-provider consensus calibration, complete closing-price capture, and enough
  settled samples to enable model or strategy rankings.

## 11. Non-Goals

- Real-money order execution in the primary product.
- Model-generated stake amounts that bypass deterministic risk rules.
- Scraping unsupported websites as a hidden production dependency.
- Rankings based on tiny samples.
- Displaying hidden model chain-of-thought.
- Treating a data connector’s HTTP success as proof of board functionality.

## 12. Product Acceptance Metrics

- Four of four game boards pass the release-gate E2E suite.
- 100% of LLM requests have immutable prompt and response artifacts.
- 100% of paper orders link to a valid analysis report and policy version.
- Zero paper orders are created from invalid responses or unaligned markets.
- Settlement coverage is visible and exceeds the release threshold before performance
  rankings are enabled.
- Every displayed performance metric has a documented sample denominator.
