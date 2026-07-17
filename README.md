# PolyRader

> Local-first CS2 sportsbook simulator and training database.
> 本地优先的 CS2 模拟盘练习工具与复盘数据库。

**No registration. No login. No deposits. No real-money wagering.**

PolyRader is a Tauri desktop app for practicing CS2 betting decisions with virtual bankrolls. It presents CS2 markets in a sportsbook-style interface, lets users submit simulated bets, and stores match context, odds snapshots, model signals, decisions, results, and review notes in a local SQLite database.

`Simbook` remains a feature concept for the simulated odds desk. The product direction is simulation-first: Polymarket and other market feeds are data sources, not the main product promise.

---

## Product Direction

| Area | Promise |
| --- | --- |
| **CS2 Event Lobby** | Browse live/upcoming CS2 matches, tournaments, formats, teams, and odds-like market prices |
| **Practice Bet Slip** | Build single or parlay-style simulated bets with stake, implied probability, model probability, edge, and risk checks |
| **Virtual Bankroll** | Track virtual balance, open exposure, daily PnL, ROI, drawdown, and bankroll discipline |
| **Review Center** | Review settled simulated bets with odds snapshots, model signals, CLV, Brier Score, PnL, and mistake tags |
| **Local Database** | Keep matches, markets, odds snapshots, simulated bets, reviews, and strategy runs in SQLite |
| **Strategy Lab** | Compare AI, behavioral finance, market pricing, and wallet/market signals as training aids |
| **Read-only Market Sources** | Use Polymarket/Gamma/CLOB/Data API data only as observable market inputs by default |

## Safety Boundary

The main UI must stay simulation-first.

- Use **virtual bankroll**, **simulated bet**, **practice**, and **review** language.
- Do not use deposit, withdraw, bonus, VIP, cashback, or real-money wagering language.
- No real Polymarket order is sent from the core practice flow.
- Any live trading code retained for advanced experiments must remain disabled by default and outside the primary navigation.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Desktop | Tauri 2.x (Rust shell + sidecar lifecycle) |
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui |
| State | Zustand |
| Routing | React Router v6 hash routing |
| Backend | Express.js 4 + WebSocket sidecar |
| Domain | Pure TypeScript engines |
| Database | SQLite via better-sqlite3, local file |
| Cache | In-process LRU cache |
| Charts | Recharts + Lightweight Charts |
| Data Sources | CS2 match data, Polymarket public/read-only APIs, Polygon observations, LLM providers |

## Quick Start

### Prerequisites

- Node.js >= 20
- npm >= 10
- Rust for Tauri builds: [rustup.rs](https://rustup.rs)

### Install

```bash
git clone https://github.com/StrayShark/polyrader.git
cd polyrader
npm install
```

### Web + API Development

```bash
npm run dev:all
```

### Tauri Development

```bash
npm run tauri:dev
```

### Build

```bash
npm run build
npm run tauri:build
```

## Current Documentation

| Document | Purpose |
| --- | --- |
| [Product redesign](docs/cs2-simbook-product-redesign.md) | Product positioning, IA, page design, data model, and phased rollout |
| [Product docs audit](docs/product-docs-audit.md) | Audit checklist for product docs and visual specs |
| [.trae PRD](.trae/documents/PRD.md) | Canonical product requirements |
| [.trae design spec](.trae/documents/design-spec.md) | Visual system and UI behavior rules |
| [.trae overview](.trae/documents/overview.md) | Architecture and module overview |
| [.trae roadmap](.trae/documents/DEVELOPMENT.md) | Phase plan for the simulation-first rebuild |
| [Tauri guide](docs/tauri-guide.md) | Desktop development and packaging notes |

## Target Information Architecture

| Navigation | Job |
| --- | --- |
| Event Lobby | Browse CS2 matches and market prices |
| Simbook | Open a match, select markets, and add simulated bets |
| Bet Slip | Manage pending simulated selections and risk |
| Bankroll | Track virtual balance, open exposure, PnL, ROI, and drawdown |
| Review Center | Review settled decisions and model calibration |
| Database | Inspect and export local data |
| Strategy Lab | Tune AI/behavior/market signal weights |
| Settings | Configure local storage, LLM keys, and read-only data sources |

## Project Structure

```text
polyrader/
├── packages/
│   ├── core/          # Pure TS engines, types, prompts, scoring
│   ├── infra/         # SQLite, repositories, external clients, crawlers
│   ├── server/        # Express sidecar, services, routes, websocket
│   └── web/           # React app, pages, components, stores, styles
├── src-tauri/         # Tauri desktop shell
├── docs/              # Product, release, and desktop docs
└── .trae/documents/   # Canonical PRD/design/architecture/roadmap docs
```

## Development Commands

| Task | Command |
| --- | --- |
| Type check | `npm run typecheck` |
| Lint | `npm run lint` |
| Unit tests | `npm run test` |
| Browser E2E | `npm run test:e2e` |
| Integration E2E | `npm run test:e2e:integration` |
| Account read-only E2E | `POLYMARKET_ACCOUNT_E2E=1 npm run test:e2e:account` |
| Real market + LLM E2E | `POLYRADER_REAL_LLM_E2E=1 npm run test:e2e:real-llm` |
| Web build | `npm run build:web` |
| Server bundle | `npm run build:server` |
| Tauri dev | `npm run tauri:dev` |
| Tauri build | `npm run tauri:build` |

## Visual Direction

PolyRader uses a dense sportsbook/workbench layout:

- Left rail for CS2 filters and navigation.
- Center workspace for event rows, odds grids, match detail, database views, and reviews.
- Right persistent practice bet slip on desktop, bottom drawer on mobile.
- Dark sportsbook theme as the primary design target, with light and matrix/terminal themes retained.
- Cards are used for repeated items and panels only; page sections stay unframed or full-width.
- Odds buttons have fixed dimensions, show price and implied probability, and flash on price movement.

See [.trae/documents/design-spec.md](.trae/documents/design-spec.md) for the canonical visual rules.

## License

MIT

---

**PolyRader** — Practice the market, keep the receipts.
