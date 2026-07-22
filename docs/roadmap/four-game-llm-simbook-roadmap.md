# Four-Game LLM Simbook Implementation Roadmap

Status: Current delivery plan
Last updated: 2026-07-22

## Delivery Principle

Implement vertical slices. A phase is complete only when its database contract,
service behavior, UI state, migration, unit tests, integration tests, and E2E evidence
all pass. Do not open a game selector in the main lobby before that game can create a
reproducible report and deterministic paper decision.

## Current Delivery Snapshot

| Phase | Status | Evidence and remaining boundary |
| --- | --- | --- |
| Phase 0 | Complete | Canonical docs, contract, prototype, audit, and obsolete-document removal are in the P0 baseline |
| Phase 1 | Implemented for CS2 | Strict `analysis.v1` artifacts and a real MiniMax CS2 run are proven; multi-provider consensus remains |
| Phase 2 | Partial | Common facts and Validation Lab exist; CS2 and Dota 2 have real normalized facts, while LoL and Valorant lack complete matches |
| Phase 3 | Partial | Canonical markets, policy profiles, deterministic decisions, passes/rejections, and linked `sim_bets` exist; non-CS2 settlement and broader exposure limits remain |
| Phase 4 | Partial | Wilson, Brier, ECE, ROI, PnL, equity, drawdown, and core attribution exist; settled evidence, CLV, log loss, and full filtering remain |
| Phase 5 | Not complete | No board has passed the complete fixture plus current-real-source release suite; release status is 0/4 |

## Phase 0: Contract And UI Baseline

Status: Complete

Deliverables:

- Canonical documentation index.
- `analysis.v1` prompt/response contract.
- Four-game product plan.
- Interactive UI prototype.
- Current-state audit and obsolete-document removal.

Exit criteria:

- No current README or contributor link points to deleted documentation.
- Product scope consistently states four game boards and simulation-only execution.
- Runtime gaps are explicitly marked planned, not represented as shipped.

## Phase 1: Versioned Analysis Run Foundation

Priority: P1
Status: Implemented for the CS2 vertical slice; consensus and additional provider
release evidence remain

Backend:

- Add migration 033 for analysis runs, prompt artifacts, response artifacts, reports,
  and run events.
- Add `AnalysisRequestEnvelope`, `AnalysisResponseV1`, `AnalysisReport`, and validator
  types in Core.
- Replace permissive response parsing with strict schema validation.
- Add provider structured-output capabilities and one bounded repair path.
- Store raw prompt, raw response, normalized response, validation errors, hashes,
  versions, token usage, and latency.
- Keep a compatibility adapter for existing CS2 `LLMAnalysisResult` consumers during
  migration.

Frontend:

- Build standard report shell with Report, Prompt, Response, and Timeline tabs.
- Add validation and provider-failure states.

Tests:

- Golden prompt snapshots.
- Schema property tests and malformed-response fixtures.
- Prompt hash determinism.
- No persistence of secrets.
- Cross-provider structured-output fixtures.

Exit criteria:

- A CS2 run is reproducible from stored artifacts.
- An invalid response cannot enter aggregation or paper-order execution.

## Phase 2: Four-Game Normalized Fact Layer

Priority: P1
Status: Partial; common storage, adapters, and Validation Lab are implemented, but
LoL and Valorant lack complete normalized future matches

Common model:

- Add game-neutral match, participant, roster, player-position, patch, map, and event
  entities.
- Add source identity links, source precedence, freshness rules, and conflict flags.
- Promote selected `esports_source_snapshots` into normalized facts without deleting
  the immutable raw snapshot.

Game adapters:

- CS2: migrate current HLTV/GRID/Liquipedia facts behind the common adapter.
- LoL: future schedule, teams, current roster, patch, positions, and draft placeholder.
- Dota 2: schedule, team rating, roster, player affiliation, patch, and draft placeholder.
- Valorant: future schedule, teams, roster, maps, and agent/map placeholders.

Frontend:

- Build Validation Lab board summaries and preflight panel.
- Add source freshness, completeness, conflict, and missing-fact views.

Tests:

- Fixture normalization for every source and game.
- External ID collision and roster-version tests.
- Freshness and source-precedence tests.
- One normalized future match fixture per board.

Exit criteria:

- Every board produces one complete, immutable `dataSnapshotHash`.
- No CS2-specific role or map field is required by another game adapter.

## Phase 3: Market Identity And Deterministic Paper Orders

Priority: P1
Status: Partial; the deterministic policy and canonical order audit chain are
implemented, while non-CS2 settlement and portfolio-wide exposure limits remain

Backend:

- Add game-aware canonical match and market identity.
- Add settlement-rule registry for supported market kinds.
- Add `PaperDecisionEngine` with policy versioning and idempotency.
- Extend simulated order storage with report, run, game, market, probability, edge,
  price, CLV, and policy references.
- Persist pass and rejection decisions as first-class records.

Frontend:

- Add policy profile editor to My Ledger > Paper Orders.
- Add analysis-to-order decision panel.
- Add open/rejected/passed/settled filters and order trace drawer.

Tests:

- Minimum edge/confidence/completeness/liquidity boundaries.
- Duplicate run protection.
- Provider disagreement and pass behavior.
- Zero real-order API calls from every paper flow.

Exit criteria:

- One valid report per board can create a local simulated order or an explainable pass.
- Every order links back to immutable artifacts.

## Phase 4: Settlement, Win Rate And Asset Attribution

Priority: P1
Status: Partial; the performance service and UI are implemented without a sufficient
settled real sample or complete CLV/log-loss attribution

Backend:

- Add authoritative result adapters and void/postponement rules per game and market.
- Add event-sourced virtual cash/equity ledger.
- Add Brier, log loss, calibration error, CLV, Wilson interval, drawdown, exposure,
  and settlement coverage services.
- Aggregate by game, provider/model, prompt version, policy, market kind, confidence,
  edge, event tier, and data-quality band.

Frontend:

- Implement Performance tab from the approved prototype.
- Implement filterable equity chart and attribution table.
- Show sample-size and settlement-coverage warnings.
- Link every chart/table segment back to its underlying reports and orders.

Tests:

- Ledger balance invariants.
- Settlement idempotency.
- Push, void, cancellation, and postponed cases.
- Metric formula golden fixtures.
- Sample-size ranking suppression.

Exit criteria:

- A settled order updates all expected metrics exactly once.
- Portfolio and provider equity reconcile to the local ledger.

## Phase 5: Four-Board Functional Verification

Priority: P1 release gate
Status: Not complete; 0/4 boards have passed the full release gate

Test matrix for each board:

| Stage | Required assertion |
| --- | --- |
| Source | Required sources respond or show explicit licensed/unconfigured state |
| Facts | Match, participants, roster, version/map context normalize |
| Market | Canonical market and settlement rules resolve |
| Prompt | Versioned prompt artifact and stable hash persist |
| Response | Provider response validates against schema |
| Report | Probabilities, evidence, risks, data quality, and edge render |
| Decision | Deterministic paper policy creates order or explainable pass |
| Settlement | Authoritative result settles once |
| Statistics | Win rate, Brier, CLV, PnL, and equity update |

Required E2E scenarios:

- `cs2-paper-loop.spec.ts`
- `lol-paper-loop.spec.ts`
- `dota2-paper-loop.spec.ts`
- `valorant-paper-loop.spec.ts`
- invalid-response and low-data rejection.
- low-liquidity warning and stake reduction.
- restart/replay from SQLite.
- desktop and narrow-screen report/performance layouts.

Release rule:

- A board remains hidden from the main lobby until its complete test is green against
  both a deterministic fixture and a current real-source smoke run.

## Recommended Sprint Order

1. Sprint A: Refresh CS2 facts inside the active policy window and lock one current
   source-to-report-to-decision fixture plus real-source smoke loop.
2. Sprint B: Add Dota 2 market identity, authoritative settlement, missing patch and
   roster facts, then pass its first complete paper loop.
3. Sprint C: Add supported LoL and Valorant future schedules, normalized matches,
   market mappings, and settlement adapters.
4. Sprint D: Extend policy limits for daily, game, provider, market-kind, and total
   open exposure; capture closing prices for CLV.
5. Sprint E: Complete log loss, volatility/Sharpe, attribution filters, and settled
   sample warnings from canonical `sim_bets`.
6. Sprint F: Implement all four release-gate Playwright suites, Tauri smoke coverage,
   migration replay, and desktop/narrow-screen visual evidence.

## Dependencies And Risks

- GRID title IDs and production rights are external dependencies. Missing licensed
  access must block only the affected adapter, not the entire app.
- Riot development keys expire; production verification needs an approved key and
  explicit route configuration.
- OpenDota recent professional matches are historical and do not alone provide a
  future schedule.
- Liquipedia templates differ by game and may change; keep real-source smoke fixtures
  optional and rate-limited.
- Polymarket may not have markets for every esports match. The validation suite needs
  deterministic local markets while separately reporting real market availability.
- The unit, type-check, and deterministic browser baselines are green. Browser
  Playwright currently records 217 passed and 1 skipped, including three-theme visual
  coverage for the analysis report and Validation Lab. Integration, current
  real-source, and Tauri E2E remain distinct release gates and cannot be inferred from
  fixture-browser success.

## Required Operational Metrics

- Run success and failure count by stage/game/provider.
- Invalid-response and repair rate.
- Source freshness and conflict rate.
- Prompt and response token usage/cost.
- Paper decision conversion/pass/rejection rate.
- Settlement lag and unresolved-order count.
- Database growth and artifact retention size.

## Immediate Next Actions

1. Add a deterministic `cs2-paper-loop.spec.ts` and rerun it against a current
   real-source smoke dataset after refreshing stale CS2 facts.
2. Complete the Dota 2 market/settlement vertical slice and its release-gate E2E.
3. Connect supported LoL and Valorant schedules, normalize one current match per
   board, and expose explicit configuration blockers in Validation Lab.
4. Extend policy exposure limits and performance attribution before enabling model
   or strategy rankings.
5. Finish the four-board Playwright, Tauri, migration replay, and responsive visual
   matrix; keep a board unreleased until both fixture and real-source evidence pass.
