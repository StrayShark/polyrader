# Four-Game LLM Simbook Implementation Roadmap

Status: Current delivery plan
Last updated: 2026-07-23

## Delivery Principle

Implement vertical slices. A phase is complete only when its database contract,
service behavior, UI state, migration, unit tests, integration tests, and E2E evidence
all pass. Do not open a game selector in the main lobby before that game can create a
reproducible report and deterministic paper decision.

## Current Delivery Snapshot

| Phase   | Status              | Evidence and remaining boundary                                                                                                                                                          |
| ------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0 | Complete            | Canonical docs, contract, prototype, audit, and obsolete-document removal are in the P0 baseline                                                                                         |
| Phase 1 | Implemented         | Strict `analysis.v1` artifacts work across four deterministic boards; a current-source MiniMax CS2 run is persisted, while multi-provider consensus remains                              |
| Phase 2 | Partial             | Four `facts.v2` adapters and deterministic complete fixtures exist; current GRID access returns no upcoming LoL/Valorant series, so their live facts remain unavailable                  |
| Phase 3 | Implemented         | All four games have match-winner identity, deterministic orders, authoritative settlement adapters, and transactional portfolio exposure limits                                          |
| Phase 4 | Implemented metrics | Canonical metrics include Wilson, Brier, ECE, log loss, ROI, volatility/Sharpe, CLV, event/data-quality/confidence/edge attribution, shared filters, drill-down, and low-sample warnings |
| Phase 5 | Partial             | Machine-readable gates and current-source audits are implemented; no board has passed fixture plus current-source settlement/statistics, so release status remains 0/4                   |

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
Status: Partial; common storage, adapters, source readiness, and Validation Lab are
implemented for all four games, but current credentials return no Dota/LoL/Valorant
future matches

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
Status: Implemented for deterministic paper flows; the policy, canonical order audit
chain, four-game match-winner settlement, and transactional portfolio limits are green

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
Status: Implemented for canonical settled-order metrics and shared filters; sufficient
real samples, event-tier/data-quality bands, and segment-to-report drill-down remain

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

| Stage      | Required assertion                                                    |
| ---------- | --------------------------------------------------------------------- |
| Source     | Required sources respond or show explicit licensed/unconfigured state |
| Facts      | Match, participants, roster, version/map context normalize            |
| Market     | Canonical market and settlement rules resolve                         |
| Prompt     | Versioned prompt artifact and stable hash persist                     |
| Response   | Provider response validates against schema                            |
| Report     | Probabilities, evidence, risks, data quality, and edge render         |
| Decision   | Deterministic paper policy creates order or explainable pass          |
| Settlement | Authoritative result settles once                                     |
| Statistics | Win rate, Brier, CLV, PnL, and equity update                          |

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

1. Sprint A — completed 2026-07-22: CS2 facts refresh inside the active policy window;
   deterministic source-to-report-to-decision E2E and current HLTV smoke are green.
2. Sprint B — completed 2026-07-22: Dota 2 match-winner identity, OpenDota/GRID
   authoritative settlement, historical patch, ten-slot rosters, draft context, and
   the first deterministic paper-to-performance loop are green. Live release remains
   blocked by missing aligned market and, for some matches, team ratings.
3. Sprint C — completed 2026-07-22: LoL and Valorant GRID schedule/title discovery,
   bounded roster enrichment, `facts.v2`, canonical match-winner mappings, standard
   analysis fixtures, deterministic paper loops, and GRID settlement are green. Public
   Liquipedia schedules and Valorant static content were added on 2026-07-23; live
   release remains blocked by incomplete facts, market alignment, and settlement proof.
4. Sprint D — completed 2026-07-22: `paper.v1.2.0` enforces daily, game, provider,
   market-kind, and total open exposure in the order transaction. Migration 038 stores
   closing prices and CLV; boundary polling and settlement fallback never substitute a
   resolved result price for a missing close.
5. Sprint E — completed 2026-07-22: canonical log loss, return volatility/Sharpe,
   shared game/provider/market/policy/prompt/date filters, settled-sample warnings,
   and closing source/latency/attempt/unavailable-reason telemetry are green.
6. Sprint F — completed 2026-07-22: independent fixture/current-source nine-stage
   release gates, migration 038-039 database-copy replay, service and Tauri restart
   persistence, read-only sidecar smoke, and 15 CI-uploaded responsive/state
   screenshots are green. Live release remains 0/4 because current-source chains are
   incomplete.
7. Sprint G — completed 2026-07-22: release evidence is tied to the current board
   match and snapshot hash; the linked bet owns settlement, Brier, captured CLV, and
   PnL evidence. Current-source audits, machine-readable release reports, four new
   attribution dimensions with report/order drill-down, packaged sidecar migration
   verification, and isolated CI diagnostics are implemented. A real CS2 audit
   refreshed 168 HLTV records and completed a schema-valid MiniMax run; the paper
   policy rejected its unaligned market, so authoritative settlement/statistics remain
   blocked instead of being fabricated.
8. Sprint H — engineering completed 2026-07-23: migration 040 persists every
   current-source audit with four stage durations and stable provider-failure
   categories. Validation Lab adds audit history, linked-run/order lifecycle tracking,
   and a redacted `release-diagnostics.v1` export. Candidate selection now excludes
   stale active rows, and a real CS2 audit enriches a current match to 100% facts before
   a schema-valid MiniMax run. Its unaligned zero-liquidity practice market was rejected,
   so the live release count correctly remains 0/4.
9. Sprint I — engineering completed 2026-07-23: lobby `/api/markets` and the CS2 rail
   now hide scheduled rows older than the shared 15-minute prematch grace while keeping
   live matches. CS2 audits proactively refresh stale facts and discover public
   Polymarket markets under `hltv:<matchId>` before provider execution. An opt-in
   Integration E2E records audit/lifecycle evidence without fabricating settlement.
   A live audit selected match `2396000` (86% facts) but correctly stayed blocked:
   HLTV enrichment returned Cloudflare 403, Polymarket returned no open markets, and
   only synthetic practice markets remained, so release status stays 0/4.
10. Sprint L/V (LoL/Valorant L2–L5) — engineering completed 2026-07-23: shared team-alias
   resolve/conflict for `lol`/`valorant`, schedule-driven roster enrich, `lol-quality.v1` /
   `valorant-quality.v1`, Validation Lab quality panels, Gamma market discovery in audits,
   analysis-eligibility gates on board/API/paper, GRID fixture settle path, and opt-in
   current-source tracking E2E (`sprint-l-lol-current-source`, `sprint-v-valorant-current-source`).
   Live release remains blocked when dual-team roster, real market alignment, or GRID
   series link is missing; Liquipedia-only rows keep an explicit settlement blocker.

Sprint 1-9 acceptance baseline: Core 348, Infra 140 passed with 13
external-configuration tests skipped, Server 270, Web 52, four-workspace typecheck,
production build, Cargo check, and lint all pass. The deterministic browser suite is
green with 235 passed and 1 environment-dependent skipped. The default
real-backend Integration E2E is green with 18 passed and 12 explicitly skipped source,
credential, or live-trading cases; each invocation uses a fresh temporary SQLite
database. Four deterministic paper-loop E2E cases, the Sprint D risk/CLV API E2E,
the Sprint E performance E2E, and opt-in HLTV/OpenDota/GRID source checks are green.
Sprint F adds 2 fixture-gate integration cases, 8 current-source smoke/gate cases,
and a 15-case responsive matrix. Sprint G adds current-snapshot release auditing,
performance drill-down browser evidence, machine-readable diagnostics, and packaged
sidecar migration smoke. Sprint H adds persisted release history, failure timing,
redacted export, lifecycle evidence, and migration 040 replay. Sprint I adds lobby
stale-market reconciliation, CS2 public market discovery, stale-fact refresh during
audit, and opt-in current-source tracking evidence. Explicit fixture runs must remain isolated from real
snapshots already stored in the same database.

## Dota 2 Completion Track

### Sprint D1: Future Schedule And Source Truth

Status: Engineering and real-source schedule ingestion complete 2026-07-23

- Source readiness now progresses from `key_configured` to `title_resolved` to
  `schedule_available`. GRID title or schedule failures remain visible in Settings.
- Dota sync tries GRID first, then the public Liquipedia `action=parse` Matches API;
  the DB API v3 is an optional authorized fallback. Collection is identifiable,
  gzip-aware, rate-limited, cached, and does not hide browser fingerprints.
- Historical OpenDota matches continue to update team, player, patch, and draft facts,
  but a Dota sync without a real future series returns `partial`.
- Validation Lab labels finished OpenDota rows as historical validation samples and
  disables standard LLM execution. The analysis API independently rejects finished,
  stale, or non-prematch facts before selecting or calling an LLM provider.
- Migration 041 stores provider IDs, canonical series IDs, OpenDota game IDs, and parent
  series relationships. The read API supports canonical/parent lookup.
- Acceptance evidence: four-workspace typecheck, 16 focused Infra tests, 11 source
  service tests, 2 Server plus 2 Web eligibility tests, migration 037-to-041 replay,
  and 5 Settings browser tests are green.
- Current environment result: GRID Dota title unavailable, while public Liquipedia
  returned 30 future series and 50 recent series; OpenDota returned 261 source records.
  GRID remains an explicit source-level blocker, not a schedule-ingestion blocker.
- Packaged Tauri acceptance: the personal database migrated through 041 and shows 261
  latest Dota source records plus 50 persisted identities. Validation Lab selects a
  finished 80%-complete OpenDota sample, labels it historical, and exposes a disabled
  LLM action while keeping authoritative reconciliation separate.

### Sprint D2: Scheduled-Team Enrichment

Status: Engineering complete; current-source acceptance completed with explicit blockers 2026-07-23

- Scheduled Liquipedia/GRID names resolve to OpenDota IDs through one alias contract.
  Exact IDs, normalized names, tags, time tolerance, event disambiguation, and ambiguous
  collisions are tested; an ambiguous match remains a blocker instead of being guessed.
- OpenDota enrichment is schedule-driven. The single `/teams` response supplies up to 1,000
  identity candidates, while persistence remains bounded to the first 200 ranked teams plus
  teams matched to the current future schedule. At most eight target teams are enriched by
  sequential `/teams/:id/players` and `/teams/:id/matches` calls, with eight match details
  globally and three recent details per resolved team by default. It persists request evidence,
  rating, ten-match form, current affiliation, player averages, patch, and recent hero pool.
- `dota2.facts.v3` consumes Liquipedia team-payload rosters and OpenDota enrichment together.
  `dota-quality.v1` supplies per-field source, age, missing reason, conflict, and symmetric
  both-team completeness/freshness to the immutable analysis input.
- Validation Lab and match detail share a dense Dota quality panel. Match detail can fall
  back to persisted normalized facts when the legacy CS2 match table has no row.
- Final App-sidecar acceptance produced 918 Dota records: 84 Liquipedia and 834 OpenDota.
  Thirty future series supplied 60 team sides; 10 matched, 5 remained ambiguous, and 45 were
  unmatched. This improved the previous 5/2/53 result without extra team-list requests.
- Zero Tenacity, Nemiga, Level UP, and PuckChamp received bounded target evidence. Available
  teams have ten recent matches; successful detail samples generated five-player metrics and
  9-12 hero-pool rows. OpenDota reports only 0-3 current members for these current tier-two
  teams, so no future series has two authoritative five-player rosters. The best current future
  sample, PuckChamp versus Team Spirit Academy, reaches 75% completeness and remains blocked.
- Dota stays `partial` only because this GRID account has no authorized Dota title. Liquipedia
  and OpenDota both succeeded. Fixtures never satisfy current-source evidence, and no LLM or
  paper-order action was run against the incomplete samples.

### Sprint D3-D5: Market, Analysis, And Settlement

Status: D3-D4 complete; D5 engineering started 2026-07-23

1. D3 aligns match-winner, handicap, and total markets to the canonical series and shows
   a warning below USD 1,000 liquidity.
2. D4 executes the immutable prompt/response/report and deterministic paper decision for
   an eligible future Dota series, without any real-order API call.
3. D5 captures closing price, reconciles authoritative OpenDota/GRID results, settles
   idempotently, and updates Brier, CLV, ROI, PnL, win rate, and equity.

D5 acceptance evidence so far (2026-07-23):

- Fixture authoritative loop asserts `clvStatus=captured`, `avgClv`, `roi`, `winRate`,
  Brier, PnL, equity, and idempotent OpenDota reconcile.
- Integration `dota2-paper-loop` captures closing odds before settle and checks CLV/ROI.
- Opt-in `sprint-d5-dota-current-source.spec.ts` records current-source audit/lifecycle
  without fabricating settlement. Live audit `ra-722280a6-…` remains correctly blocked at
  50% completeness (`INPUT_INCOMPLETE` roster/form/hero-pool reasons).

D3 acceptance evidence (2026-07-23):

- Migration `042_esports_team_aliases.sql` stores candidate, confirmed, conflict,
  unmatched, and rejected mappings with source, evidence, and confirmation time. Refresh
  cannot overwrite a manually confirmed or rejected result.
- The Dota adapter merges Liquipedia-first current rosters with OpenDota current members by
  player identity and preserves `roster_mismatch` when cross-source overlap is below three.
- Settlement rules now cover `dota2.match_winner.v1`, `dota2.handicap.v1`, and
  `dota2.total_maps.v1`. A BO3 practice series creates three separate zero-liquidity
  synthetic markets; none counts as real current-source evidence.
- The personal database sync stored 918 records (Liquipedia 84, OpenDota 834) and generated
  20 unique alias audit rows: 4 candidates, 2 conflicts, and 14 unmatched. The current
  Zero Tenacity versus Dandelions sample remains `needs_data` at 62.5% completeness, so D4
  analysis and paper-order execution stay blocked.
- The rebuilt macOS Tauri App launches its bundled sidecar without relying on GUI `PATH`,
  displays the Dota quality and Sprint 3 evidence panels, and passes the Tauri smoke check
  with migration 42.

D4 acceptance evidence (2026-07-23):

- Core owns one Dota analysis-eligibility contract used by the board, API, provider boundary,
  and paper policy. It distinguishes `real_market`, `synthetic_practice`, `observe_only`, and
  `blocked`; status, freshness, identity, rating, form, five-player roster, player metrics,
  hero pool, patch, source conflicts, selected-market support, and liquidity all produce
  stable reason codes.
- Public Polymarket Gamma discovery needs no account key. Match winner, handicap, and totals
  are aligned independently to canonical team/time identity and persisted as read-only market
  evidence. A real market below USD 1,000 remains analysis-visible but paper-order blocked;
  an unaligned or incomplete market is rejected before provider execution.
- `analysis.v1` prompts and `analysis-response.v1` responses carry the selected market kind,
  line, outcomes, evidence type, liquidity status, and all Dota quality evidence. The report
  exposes the same market context, while deterministic paper ingestion is idempotent across
  repeated callbacks.
- The deterministic Dota fixture completed facts -> prompt -> schema-valid response -> report
  -> `SYNTHETIC_PRACTICE` decision -> one USD 12.50 simulated order. The run records
  `dota2.fixture.v1` and `market.v1`; no real-order API exists in this flow.
- The latest personal current-source sample remains correctly blocked before LLM execution:
  completeness is 37.5% and both teams lack required identity/rating/form/roster/player and
  hero-pool evidence. This is valid D4 blocker evidence, not a failed practice implementation.
- Both ambiguous aliases were reviewed against their public OpenDota candidates and rejected:
  `Pandawa Lima` candidates resolve to Panda Gaming, while `Team Spirit Academy` candidates
  resolve to senior Team Spirit rosters. The registry now has zero conflicts, and automatic
  sync cannot overwrite either manual rejection.
- Full regression is green: Core 359, Infra 159 passed with 13 configuration-dependent skips,
  Server 288, and Web 57. The Dota Integration E2E additionally verifies normalized facts,
  report market context, adapter versions, simulated order, and equity-curve persistence.

## Dependencies And Risks

- GRID title IDs are auto-discovered with optional environment overrides. Production
  rights and schedule availability remain external dependencies; missing access or an
  empty schedule must block only the affected adapter and show an explicit reason.
- Riot Developer API is policy-restricted for this simulated betting product and is not
  called by default. Valorant static version/agent/map context uses the public community
  API; any future Riot connector requires explicit written approval.
- OpenDota recent professional matches are historical and do not alone provide a
  future schedule.
- Liquipedia templates differ by game and may change; keep real-source smoke fixtures
  optional and rate-limited.
- Polymarket may not have markets for every esports match. The validation suite needs
  deterministic local markets while separately reporting real market availability.
- The unit, type-check, and deterministic browser baselines are green. The Sprint F
  responsive matrix contributes 15 explicit screenshots with page-overflow checks;
  CI uploads them as a 14-day artifact. Integration, current real-source, and Tauri
  smoke remain distinct release gates and cannot be inferred from fixture-browser
  success. Debug Tauri development uses the dedicated strict IPv4 port `15173` so an
  unrelated Vite process cannot silently substitute another frontend.

## Required Operational Metrics

- Run success and failure count by stage/game/provider.
- Invalid-response and repair rate.
- Source freshness and conflict rate.
- Prompt and response token usage/cost.
- Paper decision conversion/pass/rejection rate.
- Settlement lag and unresolved-order count.
- Database growth and artifact retention size.

## Immediate Next Actions

1. Continue Sprint I ops for CS2 match `2396000` (Aurora vs FOKUS): wait until HLTV
   facts refresh inside the 1-hour window. Market alignment now passes with mixed
   real/synthetic evidence after local Gamma fallback; only stale source freshness
   blocks provider execution. If policy then creates a paper order, capture closing and
   settle from HLTV.
2. Continue Dota D5 ops: wait for a future series that clears D4 eligibility (both-team
   roster/form/hero-pool) and a real aligned market, then run provider → paper → closing
   → OpenDota/GRID settlement. Fixture D5 metrics (CLV/ROI/winRate + reconcile) are green.
3. Continue LoL/Valorant L2–L5 ops: sync future series until dual-team roster clears
   quality, discover a real Gamma match-winner (liquidity ≥ $1000 for paper), and settle
   only when a GRID series link exists; Liquipedia-only remains an explicit blocker.
4. Accumulate at least 10 authoritative settlements per comparison segment before
   showing provisional rankings and 30 before treating calibration changes as eligible.
5. Configure updater signing only in the protected release environment, then validate a signed
   and notarized macOS bundle. Local unsigned debug app evidence must remain labeled.
