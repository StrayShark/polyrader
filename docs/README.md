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

| Document | Status | Purpose |
| --- | --- | --- |
| [Four-game product plan](product/four-game-product-plan.md) | Current | Product scope, workflows, statistics, UI requirements, and non-goals |
| [LLM analysis contract](contracts/llm-analysis-contract.md) | Current | Versioned prompt envelope, response schema, validation, audit, and paper-order boundary |
| [Product UI prototype](design/four-game-llm-simbook-prototype.html) | Current design | Interactive design for validation, analysis, simulated orders, and performance |
| [Implementation roadmap](roadmap/four-game-llm-simbook-roadmap.md) | Current | Phases, dependencies, test matrix, release gates, and migration plan |
| [Project rules](../.trae/rules/project_rules.md) | Current engineering policy | Persistent implementation constraints and post-change planning rules |

## Source Of Truth Order

When documents disagree, use this order:

1. Runtime safety boundary and database migrations.
2. LLM analysis contract.
3. Four-game product plan.
4. UI prototype.
5. Implementation roadmap.
6. Historical release notes and changelog entries.

## Current Completion Boundary

| Capability | Current state |
| --- | --- |
| CS2 match discovery and enrichment | Implemented |
| Four-game source catalog and snapshot storage | Implemented |
| Dota 2 match/team/player snapshots | Implemented |
| Cross-game Liquipedia roster retrieval | Implemented |
| Four-game future schedule normalization | Partial |
| Standardized LLM run/prompt/response persistence | Implemented for `analysis.v1`; a real CS2 run is reproducible from stored artifacts |
| Deterministic paper decisions and canonical simulated orders | Implemented; current real closed-loop evidence is CS2 only |
| Per-game/provider/market performance attribution | Partial: Wilson, Brier, ECE, ROI, PnL, equity, and drawdown are available; settled samples, CLV, log loss, and full filtering remain incomplete |
| Four-game release-gate E2E | Not complete; 0/4 boards have passed the full source-to-statistics release gate |

“Data source connected” does not mean “game board validated.” A game board is valid
only after it passes the complete source-to-settlement acceptance flow defined in the
roadmap.

## Current Release Evidence

- The latest full unit baseline is green: Core 342, Infra 135 passed with 13
  configuration-dependent tests skipped, Server 233, and Web 52.
- The deterministic browser baseline is green: Playwright 217 passed with 1
  environment-dependent test skipped, including the three-theme analysis report and
  Validation Lab visual baselines.
- A real MiniMax CS2 `analysis.v1` run passed strict validation and created one linked
  low-liquidity simulated order. It proves the audit chain, not strategy quality.
- The active `paper.v1.1.0` policy blocks stale facts. Current CS2 facts exceed the
  one-hour freshness limit and correctly remain `needs_data` until refreshed.
- Dota 2 has normalized real-source facts but lacks a publishable market/settlement
  loop. LoL and Valorant do not yet have complete normalized match inputs.

## Documentation Governance

- Product and design documents must include a status and last-updated date.
- Generated reports belong under `artifacts/` or CI output, not the canonical docs set.
- Current docs must not link to deleted files.
- CS2-specific behavior must be labeled as a game adapter, not a product-wide rule.
- Each product or data-contract change must update the roadmap and project rules with
  verification, risk, and follow-up steps.
