# Contributing to PolyRader

PolyRader is a local-first four-game esports analysis and simulated betting
workbench. Counter-Strike 2 is currently the most complete board. League of
Legends, Dota 2, and Valorant must pass the release gates in
`docs/roadmap/four-game-llm-simbook-roadmap.md` before they appear as complete
product boards.

## Product And Safety Boundary

- The primary workflow is simulation-only.
- Public or licensed market feeds are read-only analysis inputs.
- No primary-navigation action may place a real-money order.
- Use virtual cash, simulated order, paper decision, analysis, and review language.
- Do not add deposit, withdrawal, bonus, VIP, cashback, or guaranteed-profit language.
- A configured data source does not prove that a game board is functional.

## Canonical Documentation

- `docs/README.md`
- `docs/product/four-game-product-plan.md`
- `docs/contracts/llm-analysis-contract.md`
- `docs/design/four-game-llm-simbook-prototype.html`
- `docs/roadmap/four-game-llm-simbook-roadmap.md`
- `.trae/rules/project_rules.md`

Historical CS2-only plans and generated audit reports are not current product
authority.

## Requirements

| Tool | Minimum |
| --- | --- |
| Node.js | 20 |
| npm | 10 |
| Rust | 1.75 |

## Setup

```bash
git clone https://github.com/StrayShark/polyrader.git
cd polyrader
npm install
cp .env.example .env
npm run dev:all
```

For the desktop shell:

```bash
npm run tauri:dev
```

## Workspace Boundaries

```text
packages/core     Pure domain logic, schemas, prompts, metrics, policies
packages/infra    SQLite, repositories, source clients, crawlers, LLM transports
packages/server   Express sidecar, services, controllers, cron, WebSocket
packages/web      React UI, stores, browser and integration E2E
src-tauri         Tauri lifecycle, sidecar startup, desktop packaging
docs              Canonical product, contract, design and roadmap documents
```

Core must not import filesystem, HTTP, database, Express, React, or Tauri code.

## Common Commands

| Task | Command |
| --- | --- |
| Web and API development | `npm run dev:all` |
| Web only | `npm run dev:web` |
| Tauri development | `npm run tauri:dev` |
| Type check | `npm run typecheck` |
| Unit tests | `npm run test` |
| Browser E2E | `npm run test:e2e` |
| Integration E2E | `npm run test:e2e:integration` |
| Web build | `npm run build:web` |
| Server bundle | `npm run build:server` |
| Lint | `npm run lint` |

The current full-test baseline is green: Core 342, Infra 135 passed with 13
configuration-dependent tests skipped, Server 233, and Web 52. Type checking also
passes in all four workspaces. The deterministic browser baseline is also green with
217 passed and 1 skipped. Integration, current real-source, and desktop E2E remain
separate release evidence and must be run when the changed scope requires them.

## Engineering Rules

### TypeScript

- Keep strict mode enabled.
- Prefer `interface` for object shapes and `type` for unions.
- Avoid `any`; use `unknown` plus explicit validation.
- Public contracts require concise JSDoc.

### Core

- Keep engines pure and deterministic.
- Pass external facts through arguments.
- Add focused Vitest coverage for every engine and schema.
- Version serialized contracts and deterministic policies.

### React

- Use function components and hooks.
- Use the existing UI primitives and `cn()`.
- Use theme variables; structural UI remains black, white, and gray.
- Reserve green, yellow, red, and limited blue for semantic states and data.
- Do not put cards inside cards or recreate marketing layouts in the workbench.

### Database

- Every schema change requires a numbered migration and registration in
  `packages/infra/src/database/migrate.ts`.
- Raw source, prompt, and response artifacts are append-only.
- Keep game/source identities explicit. Never merge records by display name alone.
- Settlement and simulated-order execution must be idempotent.

### LLM

- Follow `docs/contracts/llm-analysis-contract.md`.
- Prompt input and model response must be standard, versioned, and schema-valid.
- Do not request or persist hidden chain-of-thought.
- Invalid responses cannot be aggregated or converted to paper orders.
- The runtime determines edge, eligibility, stake, and exposure.

## E2E Policy

- Browser tests live in `packages/web/e2e-browser/`.
- Full-stack tests live in `packages/web/e2e-integration/`.
- Current product acceptance is defined by the roadmap, not generated HTML reports.
- Visual reports and screenshots produced by CI are build artifacts unless explicitly
  promoted into the canonical design docs.
- Each released game board needs a deterministic fixture E2E and a rate-limited
  real-source smoke test.

## Pull Requests

Use Conventional Commits:

```text
feat(analysis): persist standard prompt artifacts
fix(simulation): reject duplicate paper decisions
test(valorant): add board release-gate fixture
docs(product): update four-game acceptance matrix
```

Before opening a PR:

1. Run relevant unit tests and type checks.
2. Run the smallest meaningful E2E for changed user workflows.
3. Apply migrations to a temporary SQLite database.
4. Update canonical docs when a product, contract, or acceptance boundary changes.
5. Report verification, risk, completion boundary, and concrete follow-up work.

## Required Post-Change Planning

After every code, configuration, documentation, or migration change, record:

- Verification performed.
- Remaining risks and observation points.
- One to three executable next actions.
- What is complete now versus planned later.

Keep detailed historical task logs out of CONTRIBUTING. Persistent project decisions
belong in `.trae/rules/project_rules.md`; active delivery work belongs in the
four-game roadmap.
