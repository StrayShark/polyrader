# PolyRader — 开发路线图

## 当前状态

项目当前代码仍保留部分旧 IA：Dashboard、Daily、Match Detail、Whales、Signals、AI、Simulation、Allocation、Polymarket Account。

新的产品方向是 **CS2 模拟盘练习工具 + 本地数据库**。开发路线图以分阶段迁移为主，避免一次性重构造成大面积断层。

## 开发原则

- **模拟优先**：主路径不得调用真钱下单 API。
- **本地优先**：核心用户数据写入 SQLite。
- **垂直切片**：每个阶段都包含 UI、API、DB、测试。
- **兼容迁移**：旧页面保留到新页面能覆盖其核心价值。
- **可验证**：每个阶段至少有单元测试或 Playwright E2E。

## Phase 1：产品壳与导航迁移

### 目标

让用户一打开应用就知道这是 CS2 模拟盘练习工具。

### 任务

| # | 任务 | 范围 | 优先级 |
| --- | --- | --- | --- |
| 1.1 | 品牌文案统一为 PolyRader | README / i18n / sidebar | P0 |
| 1.2 | Sidebar 重排为新 IA：赛事大厅、模拟盘、我的账本、复盘中心、数据库、策略实验室、设置 | web | P0 |
| 1.3 | 新增 `VirtualBankrollBar` | web | P0 |
| 1.4 | 新增 `PracticeBetSlip` 壳和 Zustand store | web | P0 |
| 1.5 | 新增 `OddsButton` 基础组件 | web | P0 |
| 1.6 | 隐藏或降级主路径中的实盘交易入口 | web/server | P0 |
| 1.7 | 更新 E2E：导航、空投注单、模拟模式文案 | web/e2e | P1 |

### 验收

- 首页显示虚拟余额和模拟模式。
- 右侧或底部有投注单空状态。
- 主 UI 不出现充值/提现/奖金/VIP。
- 主 UI 不出现实盘买入主按钮。

## Phase 2：本地模拟下注数据模型

### 目标

让模拟下注真正写入本地数据库。

### 任务

| # | 任务 | 范围 | 优先级 |
| --- | --- | --- | --- |
| 2.1 | 新增 migration：`sim_accounts` | infra | P0 |
| 2.2 | 新增 migration：`sim_bets`、`sim_bet_legs` | infra | P0 |
| 2.3 | 新增 migration：`odds_snapshots`、`bet_reviews` | infra | P0 |
| 2.4 | 新增 repository：SimAccountRepository、SimBetRepository、ReviewRepository | infra | P0 |
| 2.5 | 新增 core helpers：implied probability、EV、risk fraction、settlement、Brier、CLV | core | P0 |
| 2.6 | 新增 API：`POST /api/sim/bets`、`GET /api/sim/bets`、`GET /api/sim/bankroll` | server | P0 |
| 2.7 | 测试证明 `POST /api/sim/bets` 不调用真实订单客户端 | server | P0 |

### 验收

- 提交模拟下注会写入本地 SQLite。
- 每笔下注至少保存 stake、odds、selection、reasoning、snapshot。
- 单测覆盖 EV、结算、Brier、CLV。

## Phase 3：赛事大厅 sportsbook 化

### 目标

将 Dashboard/Daily/Esports 整合为 CS2 Event Lobby。

### 任务

| # | 任务 | 范围 | 优先级 |
| --- | --- | --- | --- |
| 3.1 | 赛事大厅按 Live / Today / Upcoming / Tournament 分组 | web | P0 |
| 3.2 | 增加 BO1/BO3/BO5、Tier、Tournament 筛选 | web/server | P0 |
| 3.3 | `MatchOddsRow` 显示队伍、赛制、排名、主盘口按钮 | web | P0 |
| 3.4 | 点击赔率加入 `PracticeBetSlip` | web | P0 |
| 3.5 | 价格变化 flash 和固定尺寸盘口按钮 | web | P1 |
| 3.6 | 桌面三栏 + 移动投注单抽屉截图回归 | web/e2e | P1 |

### 验收

- 任意可见赛事可在 2 次点击内加入模拟单。
- 赛事行刷新不跳动。
- 移动端可打开/关闭投注单。

## Phase 4：比赛详情重构为模拟盘

### 目标

将 Match Detail 改为单场盘口工作台。

### 任务

| # | 任务 | 范围 | 优先级 |
| --- | --- | --- | --- |
| 4.1 | 第一屏重排：队伍/赛事信息 + 盘口矩阵 + 投注单 | web | P0 |
| 4.2 | Tabs：情报、市场、AI、复盘 | web | P0 |
| 4.3 | AI 区显示市场概率、模型概率、用户概率和置信度 | web/server | P1 |
| 4.4 | 提交模拟下注保存用户概率和理由 | web/server | P0 |
| 4.5 | 禁止主路径 live order 按钮 | web/server | P0 |

### 验收

- 用户可在比赛详情提交模拟下注。
- 每笔下注可回看下注时价格和理由。
- 页面显式显示“模拟练习”。

## Phase 5：我的账本

### 目标

把旧 Simulation/Allocation 重构为训练账户。

### 任务

| # | 任务 | 范围 | 优先级 |
| --- | --- | --- | --- |
| 5.1 | 虚拟余额、可用余额、未结算暴露 | web/server | P0 |
| 5.2 | 资产曲线 | web/server | P0 |
| 5.3 | Open/Settled/Voided bets 表 | web/server | P0 |
| 5.4 | 风险纪律：单笔风险、日亏损、Kelly 偏离 | core/server/web | P1 |
| 5.5 | 训练目标 | server/web | P2 |

### 验收

- 账本展示所有模拟下注状态。
- 资产曲线随结算变化。
- 风险超限有清晰提示。

## Phase 6：复盘中心

### 目标

建立赛后学习闭环。

### 任务

| # | 任务 | 范围 | 优先级 |
| --- | --- | --- | --- |
| 6.1 | Review summary：胜率、ROI、Brier、CLV、回撤 | core/server/web | P0 |
| 6.2 | 单笔复盘详情 | web/server | P0 |
| 6.3 | 错误标签和复盘笔记 | infra/server/web | P0 |
| 6.4 | 按赛制、盘口、赛事 Tier、策略过滤 | server/web | P1 |
| 6.5 | 复盘建议生成 | core/server | P2 |

### 验收

- 已结算下注可复盘。
- 用户可保存错误标签和笔记。
- 统计指标与注单数据一致。

## Phase 7：数据库页

### 目标

让用户看到本地数据资产。

### 任务

| # | 任务 | 范围 | 优先级 |
| --- | --- | --- | --- |
| 7.1 | 数据库 summary API | server/infra | P0 |
| 7.2 | 表列表、记录数、最近更新时间 | web | P0 |
| 7.3 | SQLite/CSV/JSON 导出 | server/web | P1 |
| 7.4 | 备份/恢复入口 | server/web/tauri | P1 |
| 7.5 | 只读 Polymarket 账户放入数据库/设置 | web/server | P2 |

### 验收

- 用户能看到本地数据库路径和表状态。
- 用户能导出数据。

## Phase 8：策略实验室

### 目标

把 AI、行为金融、市场价格、聪明钱信号变成可调参的训练辅助。

### 任务

| # | 任务 | 范围 | 优先级 |
| --- | --- | --- | --- |
| 8.1 | 策略 profile CRUD | infra/server/web | P0 |
| 8.2 | AI/行为/市场概率权重配置 | core/server/web | P0 |
| 8.3 | 回测和校准面板 | core/server/web | P0 |
| 8.4 | Prompt variants 下沉到策略实验室 | web/server | P1 |
| 8.5 | 聪明钱信号作为观察层 | web/server | P1 |

### 验收

- 策略参数可保存。
- 回测结果展示 Brier、ROI、回撤。
- 策略实验室不输出真钱下注建议。

## Phase 9：视觉审计和发布准备

### 目标

完成 Simbook 视觉规范落地。

### 任务

| # | 任务 | 范围 | 优先级 |
| --- | --- | --- | --- |
| 9.1 | 更新 Playwright 视觉审计标题和覆盖页面 | web/e2e | P0 |
| 9.2 | 更新截图 baseline | web/e2e | P1 |
| 9.3 | 增加禁用真钱词汇审计 | web/e2e | P0 |
| 9.4 | 更新发布文档和 Tauri 标题 | docs/src-tauri | P1 |
| 9.5 | 完整打包验证 | all | P1 |

### 验收

- E2E 视觉报告覆盖赛事大厅、投注单、账本、复盘、数据库。
- 主 UI 不出现禁用真钱词汇。
- README/PRD/design/overview/architecture/roadmap 一致。

## 验证矩阵

| 改动 | 必跑 |
| --- | --- |
| core 计算 | `npm --workspace @polyrader/core test` |
| infra migration/repo | `npm --workspace @polyrader/infra test` |
| server API | `npm --workspace @polyrader/server test` |
| web component/page | `npm --workspace @polyrader/web test` + relevant Playwright |
| docs only | `rg` 文档术语审查 |
| full release | `npm run typecheck && npm run lint && npm run build && npm run test:e2e` |

## 当前下一步

1. **P0** Phase 1：UI 壳、导航、虚拟余额条、模拟投注单。
2. **P0** Phase 2：sim 数据库 migration 和 server API。
3. **P1** 视觉 E2E：三栏桌面和移动投注单抽屉。
