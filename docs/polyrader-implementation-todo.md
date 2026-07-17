# PolyRader 后续开发待办清单

生成日期：2026-07-06

## 1. 当前结论

当前项目已经具备较完整的旧版能力：Polymarket/CS2 市场数据、AI 分析、信号回测、巨鲸观察、只读账户统计、LLM provider 模拟收益曲线、SQLite 本地存储和 Playwright E2E 基础。

但新的产品定位是 **CS2 博彩模拟盘练习工具 + 本地复盘数据库**。从这个定位看，项目仍缺少核心主流程：

- 赛事大厅 sportsbook 化。
- 常驻模拟投注单。
- 虚拟本金和本地练习账户。
- 用户主动提交模拟下注。
- 每笔下注的赔率快照、模型快照、下注理由和赛后复盘。
- 复盘中心、我的账本、本地数据库页面。
- 主路径默认隐藏或移除真实下单入口。

因此后续开发重点不是继续堆分析面板，而是把旧分析能力重排进模拟练习闭环。

## 2. 目标信息架构

| 新模块 | 路由建议 | 来源/迁移 | 当前状态 | 优先级 |
| --- | --- | --- | --- | --- |
| 赛事大厅 | `/` | Dashboard + Daily + Esports | 待重构 | P0 |
| 模拟盘详情 | `/match/:slug` | Match Detail | 待重构 | P0 |
| 模拟投注单 | 全局右栏/移动抽屉 | 新增 | 未实现 | P0 |
| 我的账本 | `/bankroll` | Simulation + Allocation | 待重构 | P0 |
| 复盘中心 | `/review` | Signals + AI Stats | 已完成基础闭环 | P1 |
| 本地数据库 | `/database` | Backup + Repository 状态 | 已完成基础闭环 | P1 |
| 策略实验室 | `/strategy` | AI Config + Prompt Variants + Whales + Signals | 已完成 | P1 |
| 设置 | `/settings` | AI Config + 数据源 + 只读账户 | 已完成 | P2 |

## 3. P0 必须优先完成

### 3.1 移除主路径实盘下单入口

背景：当前 `MatchDetailPage` 在 `canLiveTrade` 为真时会显示真实下单按钮，并调用 `/api/market-orders`。这与模拟盘主路径冲突。

待办：

- [x] 前端从比赛详情主路径移除 `liveBet` 按钮。
- [x] `/api/market-orders` 保留为高级实验接口，但默认不在主导航和主页面暴露。
- [x] `POLYMARKET_LIVE_TRADING_ENABLED` 默认应为关闭或仅高级设置可见。
- [x] `ProductModeNotice` 中 `live-order` 只允许出现在高级设置或开发者区域（当前未在UI中引用该模式，保留类型定义仅作历史兼容）。
- [x] E2E 增加断言：赛事大厅、比赛详情不出现真实下单主按钮。

验收：

- 主路径不能出现“实盘下单”“Live bet”“真实限价单”等操作入口。
- 提交模拟下注不会调用 `MarketOrderService` 或 `PolymarketOrderClient`。

### 3.2 新增模拟盘核心数据模型

当前只有旧 `simulated_bets` 表，适合 LLM provider 回测，不适合用户练习账户。

新增 migration：

- [x] `sim_accounts`
- [x] `sim_bets`
- [x] `sim_bet_legs`
- [x] `odds_snapshots`
- [x] `bet_reviews`
- [x] `training_sessions`
- [x] `strategy_profiles`

建议字段：

```sql
CREATE TABLE sim_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  initial_bankroll REAL NOT NULL DEFAULT 10000,
  current_bankroll REAL NOT NULL DEFAULT 10000,
  available_bankroll REAL NOT NULL DEFAULT 10000,
  open_exposure REAL NOT NULL DEFAULT 0,
  max_single_risk_pct REAL NOT NULL DEFAULT 0.02,
  max_daily_risk_pct REAL NOT NULL DEFAULT 0.06,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sim_bets (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES sim_accounts(id),
  match_id TEXT,
  market_id TEXT,
  bet_type TEXT NOT NULL,
  stake REAL NOT NULL,
  total_odds REAL NOT NULL,
  implied_probability REAL,
  user_probability REAL,
  model_probability REAL,
  market_probability REAL,
  edge REAL,
  ev REAL,
  status TEXT NOT NULL DEFAULT 'open',
  pnl REAL NOT NULL DEFAULT 0,
  reasoning TEXT,
  placed_at TEXT NOT NULL,
  settled_at TEXT
);

CREATE TABLE sim_bet_legs (
  id TEXT PRIMARY KEY,
  bet_id TEXT NOT NULL REFERENCES sim_bets(id) ON DELETE CASCADE,
  match_id TEXT,
  market_id TEXT,
  selection TEXT NOT NULL,
  odds REAL NOT NULL,
  implied_probability REAL,
  source TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE odds_snapshots (
  id TEXT PRIMARY KEY,
  match_id TEXT,
  market_id TEXT,
  selection TEXT,
  odds REAL NOT NULL,
  implied_probability REAL,
  liquidity REAL,
  volume_24h REAL,
  source TEXT NOT NULL,
  captured_at TEXT NOT NULL
);

CREATE TABLE bet_reviews (
  id TEXT PRIMARY KEY,
  bet_id TEXT NOT NULL REFERENCES sim_bets(id) ON DELETE CASCADE,
  error_tags TEXT NOT NULL DEFAULT '[]',
  note TEXT,
  brier_score REAL,
  closing_line_value REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Repository 待办：

- [x] `SimAccountRepository`
- [x] `SimBetRepository`
- [x] `OddsSnapshotRepository`
- [x] `BetReviewRepository`
- [x] 对应 unit tests（新增 `packages/infra/src/database/repositories/__tests__/sim-repositories.test.ts`）。

验收：

- 新建本地练习账户后能读取余额、可用余额、未结算暴露。
- 提交模拟下注后写入 `sim_bets`、`sim_bet_legs`、`odds_snapshots`。
- 结算后能更新 bankroll、PnL、status。

### 3.3 新增模拟盘 API

新增接口：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/sim/account` | 获取默认练习账户 |
| PUT | `/api/sim/account` | 更新初始本金、风险参数 |
| GET | `/api/sim/bankroll` | 获取余额、今日 PnL、未结算暴露、资产曲线 |
| POST | `/api/sim/bets` | 提交模拟下注 |
| GET | `/api/sim/bets` | 查询 open/settled bets |
| GET | `/api/sim/bets/:id` | 查询单笔下注详情 |
| PATCH | `/api/sim/bets/:id/settle` | 结算模拟下注 |
| POST | `/api/sim/bets/:id/review` | 写入复盘笔记 |

服务待办：

- [x] `SimAccountService`
- [x] `SimBetService`
- [x] `BankrollService`
- [x] `ReviewService`
- [x] `SettlementService` 复用/扩展现有 settlement engine（新增 `packages/server/src/services/settlement-service.ts`，`SimBetService` 委托结算）。

测试：

- [x] `POST /api/sim/bets` 不调用真实订单客户端。
- [x] 风险超限时返回 400 和明确原因。
- [x] 下注成功后可从 `/api/sim/bankroll` 看到 open exposure。
- [x] 结算后资产曲线更新（`SettlementService` + `BankrollService` 单测/集成测试覆盖）。
- [x] `/api/sim/*` HTTP 路由集成测试（新增 `packages/server/src/__tests__/sim-api.test.ts`）。

### 3.4 实现前端全局 AppShell

当前布局是旧 sidebar + main。需要迁移到 sportsbook/workbench 三栏结构。

组件待办：

- [x] `VirtualBankrollBar`
- [x] `PracticeBetSlip`
- [x] `OddsButton`
- [x] `MatchOddsRow`
- [x] `RiskMeter`
- [x] `CS2Rail`
- [x] `MobileBetSlipDrawer`

状态管理：

- [x] 新增 `practice-slip-store.ts`
- [x] 新增 `bankroll-store.ts`
- [x] 新增 `review-store.ts`

验收：

- 桌面端：左 rail + 主工作区 + 右投注单常驻。
- 移动端：投注单底部抽屉。
- 顶部始终显示 Practice Mode / 虚拟本金。

## 4. P1 核心页面重构

### 4.1 赛事大厅

当前 Dashboard 是市场统计卡片、热力图、异常表、市场表。需要改成 CS2 sportsbook lobby。

待办：

- [x] 合并 Dashboard、Daily、Esports 的核心数据。
- [x] 分组：Live、Starting Soon、Today、Upcoming、Tournament。
- [x] 顶部/左侧筛选：BO1/BO3/BO5、时间。
- [x] 中间主列表使用 `MatchOddsRow`。
- [x] 每行至少显示 Match Winner 两个 `OddsButton`。
- [x] 支持 `+N` 展开更多盘口。
- [x] 点击赔率加入 `PracticeBetSlip`。
- [x] 点击行进入模拟盘详情。

验收：

- 首页第一屏能看出这是模拟盘练习工具。
- 任意赛事 2 次点击内可加入模拟投注单。
- 盘口刷新不导致布局跳动。

### 4.2 模拟盘详情

当前 Match Detail 偏 AI 分析，且 decision tab 里混入 live order。需要改为盘口工作台。

待办：

- [x] 第一屏展示队伍、赛事、赛制、主盘口矩阵、投注单（`overview` Tab 已加入 Match Winner 赔率矩阵）。
- [x] Tabs 调整为：情报、市场、AI、模拟（复盘移至赛后）。
- [x] AI 区域只做参考概率，不能独占决策。
- [x] 用户可输入自己的概率和下注理由（`PracticeBetSlip` 已加入用户概率输入，提交到 `sim_bets.user_probability`）。
- [x] 点击 OddsButton 加入投注单，而不是直接写 `/api/ai/stats/bet`。

验收：

- 不需要先触发 AI 分析也能加入模拟单。
- 提交前可看到 stake、EV、最大亏损、风险占本金比例。

### 4.3 我的账本

当前 Simulation 是 provider comparison，不是用户账本。

待办：

- [x] `/bankroll` 页面展示虚拟余额、可用余额、未结算暴露。
- [x] 资产曲线按日/周/月切换。
- [x] Open Bets 和 Settled Bets 表。
- [x] 风险纪律面板：最大回撤、连续亏损、胜率、ROI。
- [x] 训练目标：例如“本周只下注高置信度盘口”。

验收：

- 用户能看到自己的虚拟账户，而不是 LLM provider 账户。
- 所有 PnL 都来自本地模拟下注。

### 4.4 复盘中心

当前 Signals/AI Stats 有 Brier、ROI、校准等能力，但没有用户复盘闭环。

待办：

- [x] `/review` 页面展示已结算模拟下注。
- [ ] 单笔复盘详情包含下注时赔率、收盘线、模型概率、用户概率、市场概率。
- [ ] 支持错误标签：高估强队、忽视地图池、追涨、过信 AI、仓位过重、临场信息缺失。
- [ ] 支持复盘笔记。
- [ ] 展示 Brier Score、CLV、ROI、胜率、最大回撤。

验收：

- 每笔 settled bet 都能打开复盘详情。
- 写入复盘后能在 `bet_reviews` 查到记录。

### 4.5 本地数据库页

待办：

- [x] `/database` 页面显示 SQLite 路径。
- [x] 表列表：matches、markets、odds_snapshots、sim_bets、sim_bet_legs、signal_snapshots、bet_reviews。
- [x] 每张表显示记录数、最近更新时间、来源。
- [ ] 导出 CSV、JSON。
- [ ] 备份/恢复沿用现有 backup 能力。
- [x] 只读表数据预览：支持分页、搜索、列数限制和 SQLite 只读查询保护。

验收：

- 用户能明确知道哪些数据保存在本地。
- 导出操作不会破坏当前数据库。

### 4.6 策略实验室

待办：

- [x] `/strategy` 整合 Signals 权重、AI 配置、Prompt variants、Whales smart money。
- [x] 展示 AI / 行为金融 / 市场价格三类概率。
- [x] 支持权重配置和历史回测。
- [x] 输出训练建议，不输出真钱下注建议。

验收：

- 策略实验室能复用现有 Signals backtest 能力。
- 权重调整后能立即看到 Brier/ROI/CLV 变化。

## 5. P2 清理与整合

### 5.1 品牌和文案统一

待办：

- [x] 运行代码（web 布局、Tauri 配置、Cargo 元数据）主界面产品名统一为 `PolyRader`。
- [x] 当前产品文档统一使用 `PolyRader`；`Simbook` 只保留为模拟盘功能概念。
- [ ] 更新 README、PRD、overview、technical-architecture、release guide 中的品牌表述（历史文档可保留说明）。
- [x] i18n 导航已按新 IA 组织（Practice/Data/Advanced）。
- [x] `/api/market-orders` 已默认隐藏，仅在 `CS2_SIMBOOK_ENABLE_MARKET_ORDERS=true` 时注册。

### 5.2 视觉审计更新

当前 Playwright 视觉审计已覆盖新 routes。

待办：

- [x] `fixtures/routes.ts` 改为赛事大厅、模拟盘详情、账本、复盘、数据库、策略实验室。
- [x] `design-audit.spec.ts` 增加三栏布局、投注单抽屉、OddsButton 状态。
- [x] 禁用真钱词汇扫描（已集中到 `design-audit.spec.ts`，覆盖 lobby/bankroll/review/database/strategy-lab/signals/ai-config）。
- [x] 更新 screenshot baseline。
- [x] 重写 `prd-audit.spec.ts` 覆盖新 IA（Lobby / Match Detail / Bankroll / Review / Database / Strategy Lab）。
- [x] 重生成 `docs/report/e2e-design-audit.html` 和 `docs/report/e2e-prd-audit.html`。

### 5.3 旧模块降级策略

| 旧模块 | 处理方式 |
| --- | --- |
| Dashboard | 改为赛事大厅 |
| Daily | 合入赛事大厅筛选 |
| Esports | 合入赛事大厅和模拟盘详情情报 tab |
| Match Detail | 改为模拟盘详情 |
| Simulation | 改为我的账本 |
| Allocation | 合入投注单风险和账本 |
| Signals | 合入复盘中心和策略实验室 |
| Whales | 下沉到策略实验室的聪明钱观察 |
| Polymarket Account | 下沉到本地数据库/设置，只读 |
| AI Config / Prompt Variants | 下沉到设置/策略实验室 |

## 6. UI 改进清单

### 6.1 结构

- [ ] 从“分析仪表盘”改为“练习工作台”。
- [ ] 桌面三栏：左筛选、中赛事/盘口、右投注单。
- [ ] 移动端底部投注单抽屉。
- [ ] 顶部虚拟余额条固定可见。

### 6.2 组件

- [x] `OddsButton` 固定尺寸，显示 odds + implied probability。
- [x] `PracticeBetSlip` 支持 single/parlay practice。
- [x] `RiskMeter` 显示 stake/bankroll、今日风险、open exposure。
- [x] `ReviewTimeline` 串起下注、赔率变化、收盘线、赛果、复盘。
- [x] `LocalDatabaseInspector` 展示表状态和只读数据预览。

### 6.3 状态

- [x] loading skeleton 不改变布局尺寸。
- [ ] empty state 不出现营销文案。
- [x] error state 提供重试。
- [x] disabled state 必须说明原因。
- [ ] price up/down flash 不改变按钮尺寸。

### 6.4 主题

- [ ] 沿用 Dark+ / Light+ / Matrix token。
- [ ] 保持 Cursor-like：8px 圆角、hairline border、无重阴影。
- [ ] 禁止大面积渐变、装饰光球、营销 hero。

## 7. 建议开发里程碑

### Milestone 1：主路径安全和 UI 壳

范围：

- 移除主路径 live order。
- 新导航。
- `VirtualBankrollBar`。
- `PracticeBetSlip` 壳。
- `OddsButton`。

完成标准：

- 首页第一屏显示模拟练习状态。
- 主路径无真实下单入口。
- 能把 mock odds 加入投注单。

### Milestone 2：本地模拟下注闭环

范围：

- sim 数据库 migration。
- `/api/sim/*`。
- 提交模拟下注。
- 账本 open bets。

完成标准：

- 一笔模拟下注可从赛事大厅提交并写入 SQLite。
- 账本能显示未结算风险。

### Milestone 3：赛事大厅和比赛详情

范围：

- Dashboard/Daily/Esports 合并为赛事大厅。
- Match Detail 改为盘口工作台。
- OddsButton 与 PracticeBetSlip 联动。

完成标准：

- 2 次点击内加入模拟投注单。
- 比赛详情不依赖 AI 分析即可练习下注。

### Milestone 4：复盘和数据库 ✅

范围：

- [x] 结算模拟下注。
- [x] 复盘中心。
- [x] 数据库页。
- [x] 导出/备份。

完成标准：

- [x] settled bet 有 PnL、Brier、CLV、错误标签和复盘笔记。
- [x] 数据库页显示核心表记录数。

### Milestone 5：策略实验室和视觉审计 ✅

范围：

- [x] Signals/AI/Whales 整合。
- [x] 策略权重配置。
- [x] E2E 视觉审计更新。

完成标准：

- [x] 策略实验室可以比较 AI/行为金融/市场价格概率。
- [x] E2E 覆盖新主路径和三主题截图。

## 8. 风险清单

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 主路径仍暴露真实下单 | 破坏模拟盘定位 | P0 移除 live order 按钮和入口 |
| 旧 `simulated_bets` 与新 `sim_bets` 混用 | 数据语义混乱 | 明确迁移计划，旧表只保留给 LLM provider 历史 |
| 文档品牌名不统一 | 交付和设计沟通混乱 | 统一为 PolyRader |
| 视觉审计仍跑旧页面 | UI 改版无保障 | 更新 routes 和 baseline |
| 未保存 odds snapshot | 复盘无法还原下注时场景 | 提交下注时强制写快照 |
| AI 信号过强 | 用户误以为是下注建议 | UI 中标注参考概率，必须显示用户概率和市场概率 |

## 9. 近期建议执行顺序

1. **P1** 为复盘中心补充单笔详情里的下注时 odds snapshot、收盘线和错误标签编辑。
2. **P1** 为本地数据库页补充 CSV/JSON 导出，并保留 SQLite 备份/恢复的确认流程。
3. **P2** 拆分 `@polyrader/core` browser-safe exports，消除 web build 中 `fs` / `path` / `node:crypto` externalize warning。
4. **P2** 为 visual-regression 的 `/api/health`、WS 噪声补统一 mock/block，降低 E2E 日志干扰。
5. **P2** 在 Polymarket 网络可达环境复跑 `POLYMARKET_ACCOUNT_E2E=1 npm --workspace @polyrader/web run test:e2e:integration -- polymarket-account-readonly.spec.ts`，确认 diagnostics 全绿。

## 10. 2026-07-11 阶段 1-6 完成记录

本轮按“1-6”完成以下收口：

- [x] `ReviewTimeline`：复盘中心增加下注、赔率快照、结算、复盘时间线，并纳入 E2E。
- [x] `LocalDatabaseInspector`：数据库页增加只读表数据预览；服务端新增 `/api/backup/tables/:tableName`，支持搜索、分页、列识别和 SQL identifier 白名单保护。
- [x] Settings：新增 `/settings` 页面，接入系统健康、功能开关、数据源、AI、Polymarket 只读账户状态，并加入侧栏、命令面板、快捷键。
- [x] UI 状态：账本/复盘 loading skeleton、错误重试、投注单禁用原因提示、Polymarket 账户禁用说明已补齐。
- [x] Real data health：外部依赖失败不再把整体健康标为 unhealthy；本地 DB/WS 保持核心健康判定，外部 Data API/Grid/stream 进入 degraded。
- [x] Release verification：完成类型检查、单元测试、全量 E2E、Integration E2E、Polymarket 只读账户 E2E、web/server build、Tauri build。

验证命令：

- `npm --workspace @polyrader/web run typecheck`
- `npm --workspace @polyrader/server run typecheck`
- `npm --workspace @polyrader/server test`
- `npm --workspace @polyrader/web test`
- `npm --workspace @polyrader/web run test:e2e`
- `npm --workspace @polyrader/web run test:e2e:integration`
- `POLYMARKET_ACCOUNT_E2E=1 npm --workspace @polyrader/web run test:e2e:integration -- polymarket-account-readonly.spec.ts`
- `npm run build:web`
- `npm run build:server`
- `npm run tauri:build`

风险与观察：

- 当前本机访问 `data-api.polymarket.com` 和 `clob.polymarket.com` 会 timeout 或 connection reset；只读账户 E2E 已验证 `.env` 地址与 L2 凭证识别、统计结构和 degraded diagnostics，但实时余额/交易数据需在网络可达环境复测。
- Web build 仍有既有 Node-only core 模块 externalize warning，未阻断构建。
- Tauri build 成功产出 `.app` 与 `.dmg`，但 updater artifacts 提示未启用 updater-enabled target。
