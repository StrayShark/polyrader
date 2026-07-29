# PolyRader

> Local-first four-game esports analysis, simulated betting, and review database.
> 本地优先的四游戏电竞分析、模拟下注与复盘数据库。

**No registration. No login. No deposits. No real-money wagering.**

PolyRader is a Tauri desktop app for practicing esports probability and betting decisions with virtual bankrolls. The product targets Counter-Strike 2, League of Legends, Dota 2, and Valorant. It stores source snapshots, versioned LLM analyses, simulated orders, results, and review notes in local SQLite.

CS2 currently has the most complete event and analysis workflow. The other boards are released only after their data-to-settlement validation gates pass. `Simbook` remains the simulated odds desk; Polymarket and other market feeds are read-only inputs, not the main product promise.

---

## Product Direction

| Area | Promise |
| --- | --- |
| **总览 / Overview** | Browse released CS2, LoL, Dota 2, and Valorant matches with explicit board readiness |
| **Practice Bet Slip** | Build single or parlay-style simulated bets with stake, implied probability, model probability, edge, and risk checks |
| **模拟盘 / Simbook** | Track virtual cash, equity, exposure, PnL, ROI, drawdown, and bankroll discipline |
| **巨鲸追踪 / Whale Tracking** | Inspect high-volume wallets, recent trades, positions, and esports market context |
| **日历 / Calendar** | Review upcoming matches, source freshness, settlement windows, and scheduled checks |
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
| Data Sources | HLTV, Liquipedia, GRID, Riot, OpenDota, Polymarket public/read-only APIs, LLM providers |

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
| [Documentation index](docs/README.md) | Canonical document set, status, and source-of-truth order |
| [Four-game product plan](docs/product/four-game-product-plan.md) | Product workflows, performance design, and completion boundaries |
| [LLM analysis contract](docs/contracts/llm-analysis-contract.md) | Standard prompt, response, report, audit, and paper-order contract |
| [Interactive UI prototype](docs/design/four-game-llm-simbook-prototype.html) | Validation, report, paper-order, and performance designs |
| [Implementation roadmap](docs/roadmap/four-game-llm-simbook-roadmap.md) | Phases, dependencies, migrations, E2E matrix, and release gates |

## Target Information Architecture

| Navigation | Job |
| --- | --- |
| 总览 | Browse matches and markets for boards that passed release gates |
| 模拟盘 | Track portfolio, paper orders, performance attribution, and review |
| 巨鲸追踪 | Inspect wallet leaders, positions, trades, and market context |
| 日历 | Plan upcoming matches, source checks, and settlement review windows |
| 设置 | Configure local storage, LLM providers, odds display, and read-only data sources |

## Project Structure

```text
polyrader/
├── packages/
│   ├── core/          # Pure TS engines, types, prompts, scoring
│   ├── infra/         # SQLite, repositories, external clients, crawlers
│   ├── server/        # Express sidecar, services, routes, websocket
│   └── web/           # React app, pages, components, stores, styles
├── src-tauri/         # Tauri desktop shell
├── docs/              # Canonical product, contract, design, and roadmap docs
└── .trae/rules/       # Persistent implementation and planning rules
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

- Left rail for game context and task navigation.
- Center workspace for event rows, odds grids, match detail, database views, and reviews.
- Right persistent practice bet slip on desktop, bottom drawer on mobile.
- Cursor-like black/white/gray structure, with color reserved for status, risk, and PnL.
- Cards are used for repeated items and panels only; page sections stay unframed or full-width.
- Odds buttons have fixed dimensions, show price and implied probability, and flash on price movement.

See the [interactive UI prototype](docs/design/four-game-llm-simbook-prototype.html) and [product plan](docs/product/four-game-product-plan.md) for current UI rules.

## License

MIT

---

**PolyRader** — Practice the market, keep the receipts.
