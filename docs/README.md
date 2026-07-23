# PolyRader Documentation

This directory is the canonical documentation set for the current product. Historical
CS2-only plans, generated audit reports, and pre-simulation product documents have been
removed. A document not linked from this index is not a current product authority.

## Current Product Definition

PolyRader is a local-first esports analysis and simulated betting workbench for four
game boards:

- Counter-Strike 2
- League of Legends
- Dota 2
- Valorant

The product uses public, licensed, and user-configured data sources to create
versioned LLM analysis reports. A deterministic risk engine may convert a valid
analysis into a local simulated order. The primary product does not place real-money
orders.

## Canonical Documents

| Document                                                            | Status                     | Purpose                                                                                 |
| ------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------- |
| [Four-game product plan](product/four-game-product-plan.md)         | Current                    | Product scope, workflows, statistics, UI requirements, and non-goals                    |
| [LLM analysis contract](contracts/llm-analysis-contract.md)         | Current                    | Versioned prompt envelope, response schema, validation, audit, and paper-order boundary |
| [Product UI prototype](design/four-game-llm-simbook-prototype.html) | Current design             | Interactive design for validation, analysis, simulated orders, and performance          |
| [Implementation roadmap](roadmap/four-game-llm-simbook-roadmap.md)  | Current                    | Phases, dependencies, test matrix, release gates, and migration plan                    |
| [Project rules](../.trae/rules/project_rules.md)                    | Current engineering policy | Persistent implementation constraints and post-change planning rules                    |

## Source Of Truth Order

When documents disagree, use this order:

1. Runtime safety boundary and database migrations.
2. LLM analysis contract.
3. Four-game product plan.
4. UI prototype.
5. Implementation roadmap.
6. Historical release notes and changelog entries.

## Current Completion Boundary

| Capability                                                   | Current state                                                                                                                                                                                 |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CS2 match discovery and enrichment                           | Implemented                                                                                                                                                                                   |
| Four-game source catalog and snapshot storage                | Implemented                                                                                                                                                                                   |
| Dota 2 match/team/player/patch/draft snapshots               | Implemented with public Liquipedia schedules/recent results/target rosters, OpenDota details, optional GRID, and an authorized Liquipedia DB fallback                                         |
| Cross-game Liquipedia roster retrieval                       | Implemented                                                                                                                                                                                   |
| Four-game future schedule normalization                      | Implemented: CS2 uses the local HLTV store; LoL, Dota 2, and Valorant use GRID when available and the public Liquipedia Matches API fallback                                                   |
| Standardized LLM run/prompt/response persistence             | Implemented for `analysis.v1` across four deterministic fixtures; a real CS2 run is reproducible from stored artifacts                                                                        |
| Deterministic paper decisions and canonical simulated orders | Implemented; `paper.v1.2.0` atomically enforces daily and open-exposure limits across game, provider, and market kind                                                                         |
| Per-game/provider/market performance attribution             | Implemented for canonical settled bets: Brier, ECE, log loss, ROI, volatility/Sharpe, CLV, event/data-quality/confidence/edge bands, shared filters, drill-down, and sample warnings are available |
| Four-game release-gate E2E                                   | Deterministic fixture and current-source nine-stage audits are implemented; 0/4 live boards have passed the full source-to-statistics release gate                                            |
| Release audit history and diagnostics                        | Implemented through migration 042 with stage timing, failure classification, linked lifecycle status, canonical source identities/team aliases, and redacted JSON export                     |

“Data source connected” does not mean “game board validated.” A game board is valid
only after it passes the complete source-to-settlement acceptance flow defined in the
roadmap.

## Current Release Evidence

- The latest full unit baseline is green: Core 359, Infra 159 passed with 13
  configuration-dependent tests skipped, Server 288, and Web 57.
- The Sprint 1-5 deterministic Integration E2E is green across all four games;
  opt-in source checks cover HLTV, OpenDota, and GRID-backed LoL/Valorant availability.
- Sprint 4 adds transactional paper-risk rejection, closing-price persistence, CLV
  capture at the start/close boundary, settlement fallback, and risk/CLV API and UI
  evidence. Missing closing prices remain explicitly unavailable.
- Sprint 5 adds canonical log loss, return volatility/Sharpe, shared
  game/provider/market/policy/prompt/date filters, low-sample warnings, and closing
  source/latency/attempt/unavailable-reason observability. These metrics verify the
  statistics pipeline; the current real sample size does not support rankings.
- Sprint 6 adds independent fixture/current-source release evidence for all nine
  stages, a 037-to-039 database-copy replay, service and Tauri restart persistence,
  and a read-only sidecar smoke. The real local database is migrated through 039;
  one existing open paper order and its 12.5 exposure persisted across restarts.
- Sprint 7 binds current-source evidence to the active match and snapshot hash, adds
  linked-bet-owned statistics, machine-readable release diagnostics, current-source
  audit execution, and event/data-quality/confidence/edge attribution with report and
  order drill-down. The packaged standalone sidecar embeds migrations 001-039 and is
  checked for migration-manifest drift during build.
- Sprint 8 persists release-audit history with four stage durations and stable provider
  failure categories, exports redacted `release-diagnostics.v1`, and exposes linked
  decision/order/closing/settlement/statistics lifecycle status. Migration replay and
  the packaged sidecar now include 040.
- Sprint 9 adds lobby 15-minute stale-market reconciliation, CS2 public Polymarket
  discovery during current-source audits (Gamma + persisted non-practice fallback),
  proactive stale-fact refresh before provider execution, and an opt-in CS2 tracking
  Integration E2E. Live audit `ra-1ed60569-…` selected Aurora vs FOKUS (`2396000`) and
  passed `market_align` with mixed real/synthetic evidence; provider execution remains
  blocked only by stale HLTV facts (Cloudflare 403 refresh). Release remains 0/4.
- Dota D5 fixture metrics now include captured CLV, ROI, and win rate after authoritative
  OpenDota reconcile; opt-in current-source tracking E2E is green while live samples stay
  blocked on incomplete rosters/form.
- The Sprint 6 responsive matrix is green in 15/15 cases across 390px, 768px, and
  1440px for Validation Lab, report, paper orders, and Performance, including
  loading, empty, error, low-sample, and populated states. CI uploads the screenshots
  as the `sprint-f-visual-matrix` artifact before Integration E2E clears its output.
- The deterministic browser baseline is green: Playwright 235 passed with 1
  environment-dependent test skipped, including the 15-case Sprint 6 responsive
  matrix and the three-theme visual baselines. The real-backend Integration E2E is
  also green with 17 passed and 12 explicit source, credential, or live-trading
  cases skipped; every run uses a fresh temporary SQLite database.
- Historical deterministic evidence includes one linked low-liquidity simulated order;
  it proves the audit chain, not strategy quality. The current Sprint 8 real MiniMax
  run did not create an order because the practice market was unaligned.
- The active `paper.v1.2.0` policy blocks stale facts and enforces portfolio limits.
  The Sprint 8 Tauri audit persisted 156 current-source records, proactively enriched
  both CS2 teams to a 100% board with 10 players and 7 maps, and persisted a
  schema-valid MiniMax `analysis.v1` run. Its current market failed
  alignment at the deterministic policy boundary, so no simulated order or false
  settlement was created.
- Dota 2 now has public future schedules, recent scored series, bounded current-roster
  retrieval, OpenDota performance/patch facts, game-aware identities, and optional
  licensed GRID/Liquipedia DB paths. The configured GRID key still lacks Dota title
  rights, so the sync is marked partial even though the public schedule path succeeds.
- Dota Sprint 4 adds one Core eligibility contract across UI/API/provider/paper boundaries,
  public no-key Gamma market discovery, independent match-winner/handicap/total selection,
  low-liquidity observe-only policy, standardized market-aware prompt/response/report, and
  an idempotent USD 12.50 synthetic-practice order. The current real sample remains blocked
  before provider execution because both teams lack required analysis facts.
- LoL and Valorant now have real public future schedules, 50-match recent-result
  windows, schedule-driven roster enrich with team-alias resolve/conflict,
  `lol-quality.v1` / `valorant-quality.v1`, Gamma market discovery in audits,
  analysis-eligibility gates, GRID fixture settlement, and opt-in current-source
  tracking E2E. Live release remains blocked when dual-team roster, real market
  alignment, or authoritative GRID series link is missing.
- Current-source release auditing remains 0/4 by design: CS2 now passes through a
  current provider decision but still lacks an eligible settled bet with captured CLV,
  Brier, and PnL; Dota 2, LoL, and Valorant now have future-series chains but still
  lack complete analysis facts and aligned/settleable markets. Every blocker is
  visible in Validation Lab instead of being collapsed into a generic load error.

## Documentation Governance

- Product and design documents must include a status and last-updated date.
- Generated reports belong under `artifacts/` or CI output, not the canonical docs set.
- Current docs must not link to deleted files.
- CS2-specific behavior must be labeled as a game adapter, not a product-wide rule.
- Each product or data-contract change must update the roadmap and project rules with
  verification, risk, and follow-up steps.
