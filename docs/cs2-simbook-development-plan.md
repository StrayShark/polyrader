# PolyRader — 项目进展审查与后续开发规划

> 审查日期：2026-07-09
> 基于：README、PRD、design-spec、overview、DEVELOPMENT、product-docs-audit、polyrader-implementation-todo

---

## 1. 执行摘要

项目已完成向 **PolyRader：CS2 模拟盘练习工具 + 本地复盘数据库** 的产品重定位，且核心模拟下注闭环的代码已经落地。但部分 TODO 项存在“标了完成、实际未完全到位”的情况；部分 P1/P2 收尾工作与文档、E2E、品牌一致性仍未完成。

**当前最紧迫的任务不是新增大功能，而是把已建的模拟盘闭环补全、补测、补文档，确保主路径稳定可用。**

---

## 2. 文档审查结论

| 文档 | 状态 | 说明 |
| --- | --- | --- |
| `README.md` | ✅ 已更新 | 清晰表达 simulation-first、本地数据库、安全边界 |
| `.trae/documents/PRD.md` | ✅ 已更新 | 模拟盘需求完整 |
| `.trae/documents/design-spec.md` | ✅ 已更新 | sportsbook/workbench 视觉规范完整 |
| `.trae/documents/overview.md` | ✅ 已更新 | 架构迁移说明完整 |
| `.trae/documents/technical-architecture.md` | ✅ 已更新 | 目标 API/数据表/领域计算已定义 |
| `.trae/documents/DEVELOPMENT.md` | ✅ 已更新 | Phase 1-9 路线图清晰 |
| `docs/product-docs-audit.md` | ✅ 已更新 | 列出文档层已完成项与运行代码不一致项 |
| `docs/polyrader-implementation-todo.md` | ⚠️ 需校准 | 部分 `[x]` 与代码实际状态不符 |

**文档层已统一为 `PolyRader` 品牌和 simulation-first 定位，不存在方向性分歧。**

---

## 3. 运行代码实际状态

### 3.1 数据层（packages/infra）

| 项 | 计划状态 | 实际状态 |
| --- | --- | --- |
| `sim_accounts` migration + repo | `[x]` | ✅ 完成 |
| `sim_bets` / `sim_bet_legs` migration + repo | `[x]` | ✅ 完成 |
| `odds_snapshots` migration + repo | `[x]` | ✅ 完成 |
| `bet_reviews` migration + repo | `[x]` | ✅ 完成 |
| `training_sessions` | `[ ]` | ❌ 未实现 |
| `strategy_profiles` | `[ ]` | ❌ 未实现 |
| 新 repo 的单元测试 | `[x]` | ⚠️ **未实现**，仅旧 `simulation-repository.test.ts` 存在 |

### 3.2 服务层（packages/server）

| 项 | 计划状态 | 实际状态 |
| --- | --- | --- |
| `/api/sim/account` | `[x]` | ✅ 完成 |
| `/api/sim/bankroll` | `[x]` | ✅ 完成 |
| `/api/sim/bets` CRUD + settle | `[x]` | ✅ 完成 |
| `/api/sim/bets/:id/review` | `[x]` | ✅ 完成 |
| `SettlementService` 复用/扩展 | `[ ]` | ⚠️ 结算逻辑内联在 `SimBetService`，旧 `SettlementEngine` 仍基于 `SimulatedBet` LLM 模型 |
| `POST /api/sim/bets` 不调用真实订单客户端 | `[x]` | ✅ 有测试覆盖 |
| `/api/sim/*` HTTP 路由集成测试 | 未标注 | ❌ 缺失 |

### 3.3 领域层（packages/core）

| 项 | 状态 |
| --- | --- |
| `bet-math.ts`：赔率转概率、EV、Kelly、风险、Brier、CLV | ✅ 完成并测试 |
| 适配 `sim_bets` 的结算引擎 | ⚠️ 未从旧模型迁移 |

### 3.4 前端（packages/web）

| 项 | 计划状态 | 实际状态 |
| --- | --- | --- |
| `VirtualBankrollBar` | `[x]` | ✅ 完成 |
| `PracticeBetSlip` | `[x]` | ✅ 完成（桌面右栏 + 移动抽屉） |
| `OddsButton` | `[x]` | ✅ 完成 |
| `MatchOddsRow` | `[x]` | ✅ 完成（仅 Match Winner） |
| `MobileBetSlipDrawer` | `[x]` | ✅ 完成 |
| `RiskMeter` | `[ ]` | ❌ 未实现 |
| `CS2Rail` | `[ ]` | ❌ 未实现 |
| `practice-slip-store` | `[x]` | ✅ 完成 |
| `bankroll-store` | `[x]` | ✅ 完成 |
| `review-store` | `[ ]` | ✅ **已实现**，TODO 标错 |
| 比赛详情首屏盘口矩阵 | `[ ]` | ⚠️ 需在“模拟/Practice”Tab 中操作，首屏未直接展示 |
| 用户概率输入与保存 | `[ ]` | ⚠️ API 支持 `userProbability`，前端未发送 |

### 3.5 页面

| 页面 | 状态 | 缺口 |
| --- | --- | --- |
| `/` 赛事大厅 | ✅ 基本完成 | 缺少 `+N` 展开更多盘口、Tournament 分组/筛选 |
| `/match/:slug` 模拟盘详情 | ⚠️ 部分完成 | 首屏应为盘口矩阵+投注单；AI 区需展示用户概率；复盘 Tab 赛后才显示 |
| `/bankroll` 我的账本 | ✅ 基本完成 | 缺少训练目标 |
| `/review` 复盘中心 | ✅ 基本完成 | 缺少按赛制/Tier/盘口/策略过滤 |
| `/database` 本地数据库 | ⚠️ 部分完成 | 仅支持 SQLite 导出，缺少 CSV/JSON 导出、最近更新时间/来源 |
| `/strategy` 策略实验室 | ✅ 基本完成 | 策略权重在内存中，未持久化到 `strategy_profiles` |

### 3.6 E2E 与视觉审计

| 项 | 状态 |
| --- | --- |
| 新页面视觉回归截图 | ✅ 已覆盖 lobby / bankroll / review / strategy-lab |
| `design-audit.spec.ts` 主题/布局/组件审计 | ⚠️ 禁用真钱词汇扫描分散在多个 page spec，未集中 |
| `prd-audit.spec.ts` | ❌ **仍是旧 IA**（Dashboard/Daily/Whales/Esports），未更新到 Event Lobby / Bankroll / Review / Database |
| `e2e-design-audit.html/json`、`e2e-prd-audit.html/json` 重生成 | `[ ]` | ❌ 未做 |

### 3.7 品牌与文案

| 项 | 状态 |
| --- | --- |
| README/PRD/视觉规范已统一为 `PolyRader` | ✅ |
| 运行代码中产品名仍混合 `PolyRader CS2` / `CS2 Simbook` | ✅ 已统一为 `PolyRader`（web 布局、Tauri 配置、Cargo 元数据）；历史文档保留旧名说明 |
| `live-order` ProductMode 仍可在组件/i18n 中切换 | ⚠️ 未限制到高级设置 |
| `.env.example` 中 `POLYMARKET_LIVE_TRADING_ENABLED=false` | ✅ 默认关闭 |

---

## 4. 待办清单校准（关键差异）

原 `docs/polyrader-implementation-todo.md` 以下条目与实际代码不符，建议修正：

| 原条目 | 原标记 | 建议标记 | 原因 |
| --- | --- | --- | --- |
| 新 repo 单元测试 | `[x]` | `[ ]` | `sim_*` repository 无单测 |
| `review-store.ts` | `[ ]` | `[x]` | 文件已存在 |
| `design-audit.spec.ts` 禁用真钱词汇扫描 | `[x]` | `[ ]` | 真钱词汇检查分散在 page spec |
| `prd-audit.spec.ts` 更新 | 未单独列出 | `[ ]` | 仍是旧 IA |
| 比赛详情首屏盘口矩阵 | 未单独列出 | `[ ]` | PRD 要求首屏可见 |
| 前端用户概率输入 | 未单独列出 | `[ ]` | 复盘依赖用户概率 |

---

## 5. 后续开发路线图

按“先闭环、后打磨、再扩展”原则，建议分为 4 个阶段。

### Phase A：核心闭环补全（P0，1-2 周）

目标：让模拟盘主路径真正可用、可测、无歧义。

1. **比赛详情首屏改造**
   - 进入 `/match/:slug` 第一屏直接展示队伍信息 + 盘口矩阵 + 投注单。
   - Tabs 调整为：情报、市场、AI、复盘（赛后才显示复盘）。
   - 当前“模拟/Practice”Tab 的内容上提到首屏。

2. **投注单补齐用户概率**
   - `PracticeBetSlip` 每个 leg 增加“用户概率”输入。
   - `practice-slip-store` 保存并提交 `userProbability`。
   - 前端校验：用户概率必须在 0-1 之间，与模型概率、市场概率同时展示。

3. **结算服务重构**
   - 将 `SimBetService.settleBet()` 中的结算逻辑提取为 `SettlementService`。
   - 清理或迁移旧 `SettlementEngine`，使其基于 `sim_bets`/`sim_bet_legs`。
   - 增加 settlement 单测。

4. **新 Repository 单元测试**
   - `SimAccountRepository`、`SimBetRepository`、`OddsSnapshotRepository`、`BetReviewRepository` 各补单元测试。

5. **真钱词汇扫描集中化**
   - 在 `design-audit.spec.ts` 中统一扫描主要页面禁止词汇：deposit / withdraw / bonus / VIP / cashback / cashout / real balance / 充值 / 提现 / 奖金 等。

### Phase B：P1 页面与体验打磨（1-2 周）

目标：补齐 PRD 中 P1 页面细节，提升可复盘性。

1. **赛事大厅增强**
   - `+N` 展开更多盘口。
   - Tournament 分组/筛选。
   - 赔率格式切换（Decimal / Probability / American）。

2. **复盘中心过滤**
   - 按 BO1/BO3/BO5、赛事 Tier、盘口类型、策略、时间过滤。

3. **本地数据库页增强**
   - 显示每张表的最近更新时间、数据来源。
   - 增加 CSV/JSON 导出（保留 SQLite 导出）。

4. **RiskMeter 组件**
   - 在投注单和账本中展示 stake/bankroll、今日风险、open exposure、Kelly 偏离。

5. **CS2Rail 组件**
   - 将左侧筛选重构成独立的 `CS2Rail`，支持 Live / Today / BO1/BO3/BO5 / Tier S/A/B 等。

### Phase C：策略与训练系统（P2，2-3 周）

目标：把策略实验室从内存调参升级为可持久化的训练系统。

1. **`strategy_profiles` 表与 repo**
   - 保存 AI/行为/市场权重、资金参数。

2. **`training_sessions` 表与 repo**
   - 保存训练目标、周期、完成情况。

3. **策略实验室持久化**
   - 权重调整可保存为 profile。
   - 回测结果可关联到 profile。

4. **我的账本训练目标**
   - 展示并追踪训练目标：连续 N 笔记录理由、单笔风险<2%、本周只下高置信度盘口等。

### Phase D：发布准备与品牌统一（P2-P3，1-2 周）

目标：文档、E2E、品牌一致，达到可发布状态。

1. **品牌文案统一**
   - 运行代码中产品名统一为 `PolyRader`；`PolyRader CS2` 与 `CS2 Simbook` 仅作为历史名保留。
   - i18n 导航、空状态、错误状态全部按新 IA 审查。

2. **PRD 审计更新**
   - 重写 `prd-audit.spec.ts` 覆盖 Event Lobby / Match Simbook / Bankroll / Review / Database / Strategy Lab。

3. **报告重生成**
   - 运行 E2E 后重生成 `docs/report/e2e-design-audit.html/json` 和 `e2e-prd-audit.html/json`。

4. **Tauri 配置**
   - 检查 `src-tauri` bundle 名称、窗口标题是否与新品牌一致。

5. **实盘入口最终清理**
   - `live-order` ProductMode 限制到高级设置，默认不可见。
   - `/api/market-orders` 增加明确的“高级实验接口”标识或仅在有配置时注册。

---

## 6. 下一阶段详细任务（Phase A 拆解）

建议从 Phase A 开始，按以下顺序执行：

| # | 任务 | 范围 | 验收标准 |
| --- | --- | --- | --- |
| A1 | 比赛详情首屏展示盘口矩阵 + 投注单 | web | 进入 `/match/:slug` 可在首屏 2 次点击内加入模拟单 |
| A2 | PracticeBetSlip 增加用户概率输入 | web | 提交后 `sim_bets.user_probability` 非空 |
| A3 | 提取 SettlementService 并适配 sim_bets | server/core | `SimBetService` 调用 `SettlementService`；单测覆盖结算逻辑 |
| A4 | 新 sim repository 单元测试 | infra | `sim-account/bet/odds/review` repo 单测通过 |
| A5 | `/api/sim/*` HTTP 路由集成测试 | server | 覆盖 account/bankroll/bets/review/snapshots 接口 |
| A6 | design-audit 集中禁用真钱词汇扫描 | e2e | 一页 spec 扫描所有主要页面，失败时给出具体词汇和 URL |
| A7 | 更新 `polyrader-implementation-todo.md` 状态 | docs | 与代码实际状态一致 |

---

## 7. 验收标准

完成 Phase A 后应满足：

- [ ] 任意比赛从进入页面到加入模拟单 ≤ 2 次点击。
- [ ] 提交模拟下注时保存用户概率、理由、赔率快照。
- [ ] 结算后 `sim_accounts` 余额、`sim_bets.pnl`、资产曲线一致。
- [ ] 新 repository 单测全部通过。
- [ ] `npm run typecheck && npm run lint && npm run test` 全绿。
- [ ] E2E 禁用真钱词汇扫描覆盖首页、比赛详情、账本、复盘、数据库、策略实验室。
- [ ] 主 UI 不出现实盘买入主按钮。

---

## 8. 风险与缓解

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| TODO 与实际状态不一致 | 团队对进度误判 | 每次迭代前对照代码校准 TODO |
| 旧 `simulated_bets` 与新 `sim_bets` 并存 | 数据语义混乱 | 明确旧表仅保留 LLM provider 历史，新功能不再写入旧表 |
| 比赛详情仍依赖 Tab 切换 | 违反 PRD 2 次点击原则 | Phase A 首屏改造 |
| 用户概率未采集 | 复盘中心 Brier/校准指标缺失 | Phase A 补齐前端输入 |
| `/api/market-orders` 仍可达 | 合规风险 | Phase D 限制到高级设置，默认不注册或明确标识 |
| PRD 审计仍是旧 IA | 发布时功能验收失效 | Phase D 重写 prd-audit.spec.ts |

---

## 9. 立即行动项

1. **本周内**：完成 A1、A2（比赛详情首屏 + 用户概率输入）。
2. **本周内**：完成 A4（新 repository 单元测试）。
3. **下周**：完成 A3（SettlementService 提取）和 A5（集成测试）。
4. **持续**：每次提交前运行 `npm run typecheck && npm run test`。
5. **后续**：进入 Phase B 页面打磨前，先召开一次 30 分钟对齐会，确认 Phase A 验收通过。


---

## 附录：Phase A 执行结果（2026-07-09）

Phase A 6 项任务已全部完成，并通过 `npm run typecheck`、`npm run lint`、`npm run test` 全量检查。

| 任务 | 状态 | 关键改动 |
| --- | --- | --- |
| A1 比赛详情首屏盘口矩阵 | ✅ | `packages/web/src/pages/match-detail-page.tsx` 在 `overview` Tab 首屏新增 Match Winner 赔率矩阵，进入页面即可 2 次点击内加入模拟单。 |
| A2 PracticeBetSlip 用户概率 | ✅ | `practice-slip-store.ts` / `PracticeBetSlip.tsx` 新增用户概率输入；`i18n.ts` 新增文案；提交后写入 `sim_bets.user_probability`；Edge/EV 按用户概率计算。 |
| A3 SettlementService 提取 | ✅ | 新增 `packages/server/src/services/settlement-service.ts`，支持单笔下注结算与按比赛/leg 结算；`SimBetService.settleBet` 委托给 `SettlementService`；新增 `SimBetRepository.settleLeg`。 |
| A4 新 sim repository 单元测试 | ✅ | 新增 `packages/infra/src/database/repositories/__tests__/sim-repositories.test.ts`，覆盖 `SimAccountRepository`、`SimBetRepository`、`OddsSnapshotRepository`、`BetReviewRepository`。 |
| A5 `/api/sim/*` 集成测试 | ✅ | 新增 `packages/server/src/__tests__/sim-api.test.ts`，覆盖 account/bankroll/bets/settle/review/snapshots 接口。 |
| A6 禁用真钱词汇扫描集中化 | ✅ | `packages/web/e2e-browser/design-audit.spec.ts` 新增 `forbidden real-money text` 测试，覆盖 `DESIGN_AUDIT_PAGES` 全部页面。 |

### 新增/修改文件清单

- `packages/web/src/pages/match-detail-page.tsx`
- `packages/web/src/components/PracticeBetSlip.tsx`
- `packages/web/src/stores/practice-slip-store.ts`
- `packages/web/src/utils/bet-math.ts`
- `packages/web/src/utils/i18n.ts`
- `packages/web/e2e-browser/design-audit.spec.ts`
- `packages/server/src/services/settlement-service.ts`
- `packages/server/src/services/sim-bet-service.ts`
- `packages/server/src/__tests__/settlement-service.test.ts`
- `packages/server/src/__tests__/sim-api.test.ts`
- `packages/infra/src/database/repositories/sim-bet-repository.ts`
- `packages/infra/src/database/repositories/__tests__/sim-repositories.test.ts`
- `docs/polyrader-implementation-todo.md`

### 验证结果

- `npm run typecheck`：✅ 通过
- `npm run lint`：✅ 通过（仅既有 warning，无新增 error）
- `npm run test`：✅ 通过
  - core: 291 passed
  - infra: 103 passed | 12 skipped
  - server: 177 passed
  - web: 47 passed
