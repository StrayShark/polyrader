# PolyRader — 项目总览

## 1. 项目定位

PolyRader 是本地优先的 CS2 模拟盘练习工具。它使用 Tauri 桌面应用承载 React 前端和 Express sidecar，使用 SQLite 保存本地练习账户、模拟下注、盘口快照、赛事数据、AI/行为金融/市场信号和复盘笔记。

项目曾使用 PolyRader CS2 和 CS2 Simbook 等阶段性名称，现统一为 PolyRader。现有代码仍包含 Polymarket、LLM、巨鲸、信号对比等模块；这些能力作为数据源和策略实验室能力，主路径保持赛事大厅、模拟投注单、我的账本和复盘中心。

## 2. 产品模块总览

```text
┌──────────────────────────────────────────────────────────────┐
│                           PolyRader                          │
├──────────────────────┬─────────────────────┬─────────────────┤
│ CS2 Event Rail       │ Main Workspace        │ Practice Slip   │
│ - Live / Today       │ - Event Lobby         │ - Virtual Bank  │
│ - BO1 / BO3 / BO5    │ - Odds Matrix         │ - Selected Legs │
│ - Tournament / Tier  │ - Review Center       │ - Risk Meter    │
│ - Strategy / DB      │ - Local Database      │ - Submit Sim    │
└──────────────────────┴─────────────────────┴─────────────────┘
```

| 模块 | 目标 | 当前来源 |
| --- | --- | --- |
| 赛事大厅 | 浏览 CS2 Live/Upcoming 比赛和盘口 | Dashboard + Daily + Esports |
| 模拟盘 | 单场盘口矩阵和加入模拟单 | Match Detail |
| 投注单 | 常驻 PracticeBetSlip，提交虚拟下注 | 新增 |
| 我的账本 | 虚拟余额、open/settled bets、资产曲线 | Simulation + Allocation |
| 复盘中心 | Brier、CLV、ROI、错误标签、复盘笔记 | Signals + AI Stats |
| 数据库 | 本地表、记录数、导出、备份 | SQLite + Account views |
| 策略实验室 | AI/行为/市场/聪明钱信号调参 | AI Config + Prompt Variants + Whales |
| 设置 | 数据源、LLM key、只读账户、桌面配置 | Setup + config |

## 3. 架构分层

```text
Tauri Shell
  └─ Presentation: React + Vite + Tailwind
       └─ Application: Express sidecar + WebSocket
            └─ Domain: pure TypeScript engines
                 └─ Infrastructure: SQLite, cache, API clients, crawlers
                      └─ External data sources
```

### 3.1 Presentation Layer (`packages/web`)

职责：

- 提供 sportsbook/workbench 风格 UI。
- 管理全局 PracticeBetSlip、VirtualBankrollBar 和页面路由。
- 通过 REST/WS 读取本地 sidecar 数据。
- 不直接调用外部 API。
- 不在主路径暴露真钱交易操作。

目标页面：

| 页面 | 职责 |
| --- | --- |
| `EventLobbyPage` | CS2 赛事大厅 |
| `MatchSimbookPage` | 单场模拟盘详情 |
| `BankrollPage` | 虚拟账本 |
| `ReviewCenterPage` | 复盘中心 |
| `DatabasePage` | 本地数据库 |
| `StrategyLabPage` | 策略实验室 |
| `SettingsPage` | 设置 |

当前页面会分阶段迁移，不要求一次性改名。

### 3.2 Application Layer (`packages/server`)

职责：

- 编排赛事、盘口、模拟下注、结算、复盘和策略实验 API。
- 将外部数据源结果规范化后写入本地数据库。
- 通过 WebSocket 推送价格、同步状态和复盘/结算事件。
- 保证模拟下注接口不调用真钱交易 API。

目标服务：

| Service | 职责 |
| --- | --- |
| `SimAccountService` | 虚拟账户、余额、风险参数 |
| `SimBetService` | 创建模拟下注、下注 leg、open/settled 状态 |
| `OddsSnapshotService` | 记录盘口快照 |
| `ReviewService` | 复盘笔记、错误标签、统计 |
| `StrategyLabService` | 权重配置、回测、概率校准 |
| `MarketService` | 市场/赔率数据读取 |
| `EsportsService` | CS2 比赛、队伍、地图池 |

### 3.3 Domain Layer (`packages/core`)

职责：

- 保持纯 TypeScript、无 IO。
- 提供概率、风险、下注、复盘和校准计算。

核心引擎：

| Engine | 用途 |
| --- | --- |
| `PredictionEngine` | CS2 基本面概率 |
| `MarketBehaviorEngine` | 行为金融/盘口偏移 |
| `SignalComparisonEngine` | 市场/AI/行为概率对比 |
| `BetSizingEngine` | 固定注、Kelly、风险限制 |
| `SimSettlementEngine` | 模拟下注结算 |
| `ReviewScoringEngine` | Brier、CLV、ROI、错误归因 |
| `PromptEngine` | LLM 提示词渲染 |
| `ResultAggregator` | 多 LLM 聚合 |

### 3.4 Infrastructure Layer (`packages/infra`)

职责：

- SQLite migration 和 repository。
- 外部数据客户端和本地缓存。
- 不包含 UI 逻辑。

主要数据源：

| Source | 用途 |
| --- | --- |
| Polymarket Gamma/Data/CLOB | 市场、价格、只读账户、成交观察 |
| HLTV/GRID/FACEIT 等 | CS2 赛事、战队、地图、阵容 |
| Polygon RPC | 聪明钱观察和链上事件 |
| LLM Providers | 策略实验室和参考概率 |

## 4. 本地数据库角色

本地 SQLite 是产品的核心资产，而不是缓存。

核心数据：

- Matches / Teams
- Markets
- Odds Snapshots
- Signal Snapshots
- Sim Accounts
- Sim Bets
- Sim Bet Legs
- Bet Reviews
- Training Sessions
- Strategy Profiles

## 5. 主用户路径

### 5.1 赛前模拟

```text
赛事大厅 → 选择 CS2 比赛 → 点击赔率 → 加入投注单
→ 输入 stake/用户概率/理由 → 风险检查 → 提交模拟下注
→ 本地保存下注和盘口快照
```

### 5.2 赛后复盘

```text
结算赛果 → 更新 PnL → 打开复盘中心
→ 对比下注价/收盘价/AI概率/赛果 → 标记错误类型
→ 写复盘笔记 → 更新 Brier/CLV/ROI/训练建议
```

## 6. 安全边界

- 主流程不发送真实订单。
- 主 UI 不出现充值、提现、奖金、VIP、返现。
- Polymarket private key 不应成为常规使用前提。
- 如果保留 live trading 代码，只能在高级设置中启用，并需要独立 E2E 覆盖。
- 默认文案使用模拟、虚拟、练习、复盘。

## 7. 当前迁移状态

| 项 | 状态 |
| --- | --- |
| 产品规划 | 已完成 `docs/cs2-simbook-product-redesign.md` |
| PRD | 已更新为 simulation-first |
| 视觉规范 | 已更新为 sportsbook/workbench |
| 运行代码 | 仍处于旧 IA，待 Phase 1 迁移 |
| Polymarket 账户 | 只读账户能力存在，应降级到数据库/设置 |
| 实盘交易入口 | 后续需从主路径移除或默认隐藏 |

## 8. 下一步

1. 实现 `VirtualBankrollBar`。
2. 实现 `PracticeBetSlip` 壳和前端 store。
3. 将 Sidebar 导航按新 IA 重排。
4. 新增 sim database migration。
