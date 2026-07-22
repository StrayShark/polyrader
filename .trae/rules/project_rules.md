# PolyRader — 项目规范

## 产品定位

PolyRader 是 **四游戏电竞概率分析、模拟盘练习工具 + 本地数据库**。当前覆盖
CS2、LoL、Dota 2 与 Valorant，主路径必须保持 simulation-first：

- 使用虚拟本金、模拟下注、练习、复盘、本地数据库等语言。
- 不在主 UI 暴露充值、提现、奖金、VIP、返现、真钱下注等概念。
- 不从赛事大厅、比赛详情、投注单、账本、复盘中心触发真实订单。
- Polymarket 和链上数据默认作为只读数据源；实盘相关能力如保留，必须放在高级设置并默认关闭。

## 技术栈

- **Monorepo**: npm workspaces + turbo
- **前端**: React 18 + TypeScript + Vite + Tailwind CSS + Tauri 2
- **后端**: Express + TypeScript + better-sqlite3
- **核心引擎**: 纯 TypeScript（无外部依赖），packages/core
- **测试**: vitest（单元/集成）+ Playwright（E2E）
- **桌面打包**: Tauri 2（Rust + esbuild sidecar bundle）

## 包结构

```
packages/
  core/    — 纯 TS 引擎（预测、评分、分析、状态机等）
  infra/   — API 客户端、DB 仓库、迁移、本地数据库
  server/  — Express API、模拟下注/复盘服务、cron 定时任务、WebSocket、SSE
  web/     — React SPA + Tauri 前端、赛事大厅、投注单、账本、复盘
src-tauri/ — Rust 桌面壳
```

## 产品文档

| 文档 | 用途 |
|------|------|
| `README.md` | 仓库入口与产品定位 |
| `docs/README.md` | 当前产品文档唯一入口与完成边界 |
| `docs/product/four-game-product-plan.md` | 四游戏产品范围、流程、统计和非目标 |
| `docs/contracts/llm-analysis-contract.md` | 标准 Prompt、响应、校验与审计契约 |
| `docs/design/four-game-llm-simbook-prototype.html` | 当前交互与视觉原型 |
| `docs/roadmap/four-game-llm-simbook-roadmap.md` | 研发阶段、依赖、测试矩阵与发布门槛 |
| `.trae/rules/project_rules.md` | 持久工程约束与变更后规划记录 |
| `CONTRIBUTING.md` | 贡献规范和验证命令 |

## 开发规范

### 命令

| 任务 | 命令 |
|------|------|
| 运行全部单元测试 | `npm run test` |
| 运行单个包测试 | `cd packages/<pkg> && npx vitest run` |
| 运行 E2E 测试 | `cd packages/web && npx playwright test` |
| 类型检查 | `npm run typecheck` |
| Lint | `npm run lint` |
| 构建前端 | `npm run build:web` |
| 构建 server bundle | `npm run build:server` |
| Tauri 开发模式 | `npm run tauri:dev` |
| Tauri 打包 | `npm run tauri:build` |

### 代码规范

- **strict TypeScript**: `tsconfig.base.json` 开启 `strict`、`noUnusedLocals`、`noUnusedParameters`，禁止 `any`（warn）
- **错误处理**: 所有 async 边界必须 try/catch；不得吞掉错误（空 catch 必须有注释说明原因）
- **DB 查询**: 必须使用参数化查询（`?` 占位符），禁止字符串拼接 SQL
- **null 安全**: 使用 `??` 处理 null/undefined；用 `Number.isFinite()` 守卫 NaN；不要用 `?? 0` 兜底可能为 NaN 的 parseFloat 结果
- **前端防御性渲染**: 对可选字段使用 `?.` + `?? '--'`；不要对可能为 undefined 的数值直接调 `.toFixed()`
- **i18n**: 所有用户可见文本必须通过 `t('key')` 调用，zh + en 字典同步维护
- **模拟边界**: `POST /api/sim/bets` 等模拟接口不得调用 Polymarket 下单/撤单客户端
- **视觉规范**: 新页面遵循 canonical UI 原型与现有 Cursor 风格 token，优先紧凑的 sportsbook/workbench 布局

### 提交规范

- 仅在用户明确要求时才创建 commit
- 不要 commit `.env`、`credentials.json` 等敏感文件
- 不要执行 `git push --force`（除非用户明确要求）

---

## 强制：任务完成后自动审查与下一步建议

**每次完成开发任务后，必须执行以下流程：**

### 1. 运行验证

完成代码修改后，必须运行以下命令验证（根据改动范围选择）：

```bash
# 改动了 core/infra/server
cd packages/<pkg> && npx vitest run

# 改动了 web（单元测试）
cd packages/web && npx vitest run

# 改动了 web 页面/组件
cd packages/web && npx playwright test --reporter=line

# 改动了 Rust 代码
cd src-tauri && cargo check

# 全量验证
npm run test && cd packages/web && npx playwright test --reporter=line
```

### 2. 生成进度审查

验证通过后，输出一份简明的进度审查报告，格式如下：

```
## 任务完成审查

### 本次完成
- [简述完成的任务]

### 测试状态
| 测试类型 | 数量 | 状态 |
|----------|------|------|
| core vitest | N | ✅/❌ |
| infra vitest | N | ✅/❌ |
| server vitest | N | ✅/❌ |
| web vitest | N | ✅/❌ |
| Playwright E2E | N | ✅/❌ |
| Rust cargo check | — | ✅/❌ |

### 修改的文件
- file1.ts — 简述改动
- file2.rs — 简述改动
```

### 3. 给出下一步建议

在进度审查报告之后，必须基于当前项目状态给出下一步建议。建议格式：

```
### 下一步建议

按优先级排列：

1. **[优先级]** [任务名] — [简述原因]
2. **[优先级]** [任务名] — [简述原因]
3. **[优先级]** [任务名] — [简述原因]
```

判断下一步建议时，检查以下维度：

- **确定性缺陷**: tsc 编译错误、ESLint error、运行时崩溃
- **测试缺口**: 无测试的核心模块、E2E 未覆盖的关键页面
- **数据正确性**: 数据丢失、ID 不匹配、NaN 传播
- **资源泄漏**: 定时器/连接/内存未清理
- **安全**: 信息泄漏、输入未验证
- **分发就绪**: Tauri 打包完整性、CI 配置
- **功能完整度**: PRD 中标注但未实现的功能

优先级标记：
- **P0-必须**: 编译失败、运行时崩溃、数据丢失
- **P1-高**: 测试缺口（核心模块无测试）、安全问题
- **P2-中**: E2E 覆盖不足、体验优化、lint 违规
- **P3-低**: 增强功能、未来规划

---

## 当前规划记录：HLTV / Liquipedia 队伍数据分工

### 已执行

- Polymarket/HLTV/Liquipedia/GRID/CS API 外部 ID 统一落库到 `team_source_links` 与 `match_source_links`。
- Liquipedia 作为队伍身份与 roster 事实源，通过 MediaWiki API 同步，不直接爬 HTML。
- Liquipedia roster 写入 `players`、`team_rosters` 与 `roster_source_snapshots`，用于形成阵容版本历史。
- HLTV 作为实时竞技状态源，保留排名、赛程、社区投票、延期检测，并新增 match lineup 刷新写入。
- Cron 中 Liquipedia 自动同步默认关闭，需设置 `POLYRADER_ENABLE_LIQUIPEDIA_SYNC=1`；HLTV lineup 刷新有 `POLYRADER_HLTV_LINEUP_MAX_MATCHES` 上限。
- 2026-07-13：比赛详情页已接入 Source reconciliation UI，展示 match/team source links、置信度、最近更新时间、roster snapshot 与 lineup confirmed/fallback 状态。
- 2026-07-13：数据库页已增加 `team_source_links`、`match_source_links`、`roster_source_snapshots` 的数据源对齐摘要。
- 2026-07-13：新增手动 alias/source mapping 写接口 `PUT /api/esports/teams/:teamId/sources/:source`，前端可确认 `NAVI/Natus Vincere`、`FaZe/FaZe Clan` 等跨源映射。
- 2026-07-13：新增可开关真实 Liquipedia fixture 测试（`LIQUIPEDIA_REAL_FIXTURE=1`），已用 NAVI/Vitality/FaZe/MOUZ live MediaWiki 页面验证 roster parser；parser 已兼容 `slots.main.content` 与 `{{Squad|status=active}}` / `{{Person|...}}` 结构。

### 后续建议

1. **P1-高** Source alignment health job — 增加后台健康检查，标记 source link 冲突、重复 ID、低置信度映射和超过 7 天未更新的 roster snapshot。
2. **P1-高** Alias review queue — 将手动映射从比赛页扩展为集中审核列表，支持批量确认、撤销和冲突合并。
3. **P2-中** Real-data E2E smoke — 用本地 dev server + 真实 Polymarket public data + 只读 HLTV/Liquipedia 同步跑一条端到端冒烟，验证 source panel 在非 mock 数据下的渲染。
4. **P2-中** Lineup confidence in AI prompts — 将 confirmed/fallback/stale 状态写入 LLM prompt 和 signal snapshot，避免模型把 fallback roster 当作本场首发。

---

## 当前规划记录：今日比赛分析闭环

### 已执行

- 2026-07-13：禁止 Polymarket Gamma 拉取逻辑用 `closed=true` 盘口补位；`getMarkets()` 只返回 active、未 resolved、未超过 `endDate` 的 CS2 市场。
- 2026-07-13：服务层 DB fallback 增加相同有效性过滤，防止 SQLite 中的历史盘口重新污染今日看板。
- 2026-07-13：每日看板新增 `local-sim` fallback：当当天没有有效 Polymarket CS2 盘口时，优先把本地 DB 今日赛程、实时 HLTV 候选赛程转换为本地模拟盘，并写入 `markets` / `matches`，确保 `刷新分析 -> 生成市场 -> 规则/LLM 预测 -> 看板展示` 闭环可执行。
- 2026-07-13：本地模拟盘仅用于练习与分析，不调用 Polymarket 下单/撤单接口；相关市场必须带 `practice`、`local-sim` tag。

### 后续建议

1. **P1-高** Daily real-data smoke E2E — 增加不 mock `/api/daily` 的 Playwright 用例，断言刷新后至少出现一条 `local-sim` 今日比赛，避免真实数据为空时主路径回归为空白。
2. **P1-高** 数据源状态说明 — 在每日看板 UI 显示当前数据来源：`Polymarket live`、`HLTV local-sim`、`seed fallback`，让用户知道概率是实盘盘口还是模拟练习盘口。
3. **P2-中** HLTV 时间解析增强 — 修复 HLTV fallback parser 中 date 为空的问题，优先从页面 `data-unix` / countdown 节点解析真实开赛时间。
4. **P2-中** 模拟盘口校准 — 用历史比赛结果校准 `local-sim` 初始赔率，替代当前 deterministic practice price。

---

## 当前规划记录：Tauri LLM 分析闭环

### 已执行

- 2026-07-13：Tauri 开发版使用 13001 sidecar 与 `/Users/dutongxue/localdb/polyrader.db` 完成真实启动验证。
- 2026-07-13：将 `.env` 中已配置的 Doubao、MiniMax Key 通过本地 API 加密写入 Tauri 数据库；两家提供商连通性测试均通过。
- 2026-07-13：用 `ENCE vs sparta european` 完成双模型真实分析，验证 Prompt、概率解析、多模型聚合、token/成本统计和 `llm_analyses` 持久化链路。
- 2026-07-13：修复比赛详情页没有解包 `{ data: LLMAggregation }`，导致接口成功但 UI 不展示模型结果的问题；同步修正 E2E mock 契约并补充回归用例。

### 后续建议

1. **P1-高** LLM 输入数据门槛 — 队伍排名、近期战绩、阵容和地图池不足时，在调用前显示数据质量告警，并允许跳过低信息量分析，减少无效 token 消耗。
2. **P1-高** Tauri App E2E 驱动 — 为可打包 macOS `.app` 增加桌面窗口自动化冒烟，覆盖 App 启动、sidecar ready、AI 配置和比赛详情分析。
3. **P2-中** 历史分析回载 — 比赛详情首次打开时读取最近一次聚合结果，而不仅显示时间线，避免页面重载后模型概率回到空状态。
4. **P2-中** 本地模拟盘市场接口 — 对 `local-sim` 盘口禁用真实 CLOB orderbook 轮询，改读本地赔率快照，消除预期内的 404 日志。

---

## 当前规划记录：HLTV 完整分析数据获取

### 已执行

- 2026-07-13：HLTV matches parser 已切换到当前 `data-match-wrapper` 契约，直接读取 `team1` / `team2`、`data-match-id`、`data-stars`、`lan` 与毫秒级比赛时间；禁止再从 URL 截断猜测队名。
- 2026-07-13：比赛详情必须使用 matches 页返回的完整 slug URL；已解析 canonical team ID、世界排名、比赛时间、地图和双方确认首发。
- 2026-07-13：比赛页 `data-team1-players-data` / `data-team2-players-data` 内嵌近三个月评分作为首发选手 rating 事实源；没有来源的数据必须保留 0，不使用默认评分或虚构场次。
- 2026-07-13：队伍页负责现役 roster、世界排名和近三个月地图池，results 页负责最近 10 场赛果；原始 Team JSON 与 `players`、`team_rosters`、`roster_source_snapshots`、`team_match_history`、`map_pool_stats` 同步落库。
- 2026-07-13：LLM 普通与 SSE 流式分析在数据不完整且存在 `hltv_match_id` 时自动补全，并在调用模型前重新加载 canonical team ID；`matches` 冲突更新允许将 `local-team-*` 替换为真实 HLTV ID。
- 2026-07-13：真实 ENCE vs SPARTA 验证通过：ID `4869 / 13214`、排名 `#163 / #103`、双方各 5 名确认首发、最近 10 场、地图池 `7 / 8` 张，`has_team_data=1`。
- 2026-07-13：MiniMax 分析开启 `reasoning_split` 并提高 completion 上限，避免思考内容耗尽 token 后截断 JSON；Doubao 分析超时提高到 90 秒，服务层上限同步为 100 秒。
- 2026-07-13：Tauri/13001 真实双模型闭环通过。完整数据输入下最终聚合为 ENCE 48% / SPARTA 52%，Doubao 61% 置信、MiniMax 55% 置信，论据已实际引用排名、近 10 场、地图池和首发评分。

### 数据完整性门槛

一次 HLTV 分析输入仅在以下条件同时满足时视为完整：双方 rank 为有效世界排名、双方 roster 至少 5 人、双方 recent form 非空、双方 map pool 非空、比赛级 lineup 双方至少 5 人。未满足时分析服务应先尝试补全；补全失败可以降级继续，但必须记录结构化 warning，禁止静默伪造数据。

### 后续建议

1. **P1-高** Parser contract monitor — 每日用一场未来比赛运行只读契约检查，发现队伍 ID、时间、lineup、rank 或 map pool 为空时创建本地任务告警。
2. **P1-高** 数据新鲜度策略 — 为 team overview、results、lineup 分别增加 TTL；临近开赛时只刷新 lineup，避免完整数据已有时重复抓取并降低 HLTV 访问压力。
3. **P2-中** 角色与选手高级指标 — 接入可靠来源补全真实 player role、K/D、ADR、KAST；在来源未接入前保持 0/空值，不从昵称或默认模板推断。
4. **P2-中** 历史校准 — 把数据完整度、来源时间和最终赛果写入 signal snapshot，按完整度分层计算 Brier Score，验证数据补全对预测质量的真实提升。

---

## 当前规划记录：Tauri 赛事大厅本地数据回退

### 已执行

- 2026-07-13：定位 Tauri 首页空白的根因：赛事大厅读取 `/api/markets`，Polymarket 成功返回空数组时服务端未进入 DB fallback，而 `/api/daily` 与 SQLite 中实际已有本地赛事。
- 2026-07-13：`MarketService.getMarkets()` 在外部结果为空或过滤后无 open market 时，必须回退到 SQLite 本地模拟盘，并将非空结果写入当前分页 cache。
- 2026-07-13：`MarketService.refreshMarkets()` 禁止用外部空数组覆盖 `markets:50:0`；刷新为空时保留本地练习市场。
- 2026-07-13：Tauri 已使用 `/Users/dutongxue/localdb/polyrader.db` 重启验证；首页接口 `limit=20` 返回 20 场 CS2 赛事，数据库包含 141 场比赛。
- 2026-07-13：roster hash 增加 team ID 命名空间，避免同一选手组合在 placeholder/canonical 队伍之间触发 `team_rosters.roster_hash` 主键冲突并中断阵容刷新。

### 后续建议

1. **P1-高** Lobby real-data E2E — 增加 Tauri sidecar 冒烟用例：Gamma 返回空时首页必须至少展示一条 `local-sim` 赛事。
2. **P1-高** 来源合并策略 — 当 Polymarket 与本地赛事同时存在时按 canonical match ID 合并，而不是只显示单一来源，避免重复或漏盘。
3. **P2-中** 空态诊断 — 大厅空态显示 API、DB、筛选器三个分层计数，便于区分“没有数据”和“当前筛选无结果”。

---

## 当前规划记录：比赛发现即补全队伍与选手情报

### 已执行

- 2026-07-14：新增 `MatchInfo.teamDetails`，比赛详情接口从 SQLite 一次返回双方完整 `Team`：canonical team ID、队徽、世界排名、地区、选手、最近 10 场和地图池；大厅仍使用轻量 `TeamBrief` 与比赛级 lineup，禁止前端逐队 N+1 抓取。
- 2026-07-14：`fetch-upcoming` 与每日 HLTV fallback 在发现赛程时先落库，再主动补全距离开赛最近的比赛；默认每轮 3 场，可用 `POLYRADER_HLTV_DISCOVERY_ENRICH_LIMIT` 调整。
- 2026-07-14：完整队伍资料按 `POLYRADER_HLTV_TEAM_TTL_HOURS=6` 复用；只缺 lineup 时只刷新比赛页，不重复抓双方 overview/results；单轮主动补全超时由 `POLYRADER_HLTV_DISCOVERY_TIMEOUT_MS=120000` 控制。
- 2026-07-14：比赛详情增加自愈机制。旧比赛不再依赖当前 HLTV matches 列表，而是优先使用 `match_source_links.source_url` 直接重抓，恢复被占位 ID 污染的 canonical team ID；同一比赛失败后 10 分钟内不重复尝试。
- 2026-07-14：HLTV 队徽 parser 兼容 `data-cookieblock-src`，保存绝对 CDN URL；Tauri CSP 仅新增 `www.hltv.org` 与 `img-cdn.hltv.org` 图片白名单。
- 2026-07-14：大厅赛事行改为 sportsbook 两行队伍/赔率结构，增加排名、近 5 场结果条和 lineup ready 状态；比赛情报页按 HLTV 信息层级展示双队身份、五人阵容、评分、近期赛果和地图池对比，同时沿用 BC.Game 风格的深色高对比、紧凑边框和橙色主操作。
- 2026-07-14：移动端修复顶部账户栏逐字换行、比赛头部队名挤压和筛选区过高问题；390px 视口下大厅与比赛详情均无横向溢出。
- 2026-07-14：真实 Tauri sidecar 验证 `local-hltv-2395534` 自愈成功：ENCE/SPARTA canonical ID `4869/13214`、双方 5 人、最近 10 场、地图池 `7/8`、队徽可加载，`teamDetails.isComplete=true`。
- 2026-07-14：全量 `npm run typecheck`、`npm test` 和 `npm run build:web` 通过；总计 647 tests passed，13 个依赖真实外部环境的测试按配置 skipped。

### 后续步骤

1. **P1-高** Discovery 队列可视化 — 在任务中心显示待补全/抓取中/已复用/失败数量，并允许只重试失败比赛，避免刷新按钮长时间仅显示 loading。
2. **P1-高** Match status 对齐 — 用 HLTV match page 校正 finished/delayed/cancelled，禁止已结束比赛继续显示“进行中”。
3. **P1-高** Canonical 市场合并 — 将 Polymarket、HLTV local-sim 与本地 DB 市场按双方 canonical team ID、赛事和开赛时间合并，解决同场重复以及错误队名分词。
4. **P2-中** Player 高级指标 — 从可靠事实源补充选手 ADR、KAST、K/D 与角色；来源缺失时继续显示 `-`，禁止默认值或昵称推断。
5. **P2-中** 历史数据质量回测 — 把本场资料完整度和抓取时间写入 signal snapshot，按完整/部分数据分组比较 Brier Score、CLV 与模拟收益。

---

## 当前规划记录：Canonical 比赛、HLTV 赛果与模拟盘自动结算

### 已执行

- 2026-07-15：新增 migration 029，为 `matches` 与 `markets` 增加 `canonical_match_id` 和索引；HLTV 比赛统一使用 `hltv:<matchId>`，无权威 ID 时使用双方队伍、赛事与 30 分钟时间桶生成稳定身份。开发库与 Tauri `/Users/dutongxue/localdb/polyrader.db` 均已执行 migration。
- 2026-07-15：市场大厅同时读取 Polymarket 与本地市场，按 canonical 比赛身份合并系列胜者盘；真实 Polymarket 盘优先保留真实价格/CLOB token，本地记录优先提供完整 MatchInfo。Map Winner、让分、总局数和 Correct Score 等盘口必须保持独立，禁止被系列胜者盘合并。
- 2026-07-15：HLTV match page parser 新增结构化赛果，输出状态、双方 canonical team ID、系列比分和胜者。`finished/cancelled/postponed/live` 只能依据 `.countdown`、`.timeAndEvent`、`.teamsBox` 等比赛头部状态容器；禁止扫描评论区关键词判定取消或延期。
- 2026-07-15：每 10 分钟执行 HLTV 状态与赛果调和。HLTV-backed 比赛不再由开赛时间推断 live；finished 写入 `score/winner_id`，cancelled 写入终态，抓取 unavailable 时保持原状态，不允许降级覆盖。
- 2026-07-15：本地模拟赔率由世界排名、近况胜率、地图池与确认首发 rating 加权生成；事实输入不足时固定回到 50/50、confidence=0。禁止 hash 赔率、虚构排名、虚构地图和伪造 volume/liquidity；每次价格变化写入 `price_history`。
- 2026-07-15：新增 `GET /api/markets/:conditionId/local-odds`。local-sim 详情页继续读取本地 `/prices` 快照，但不得请求或轮询真实 `/orderbook`；UI 必须明确说明本地模拟盘没有 CLOB 订单簿。
- 2026-07-15：HLTV finished 自动 resolve canonical 本地系列胜者盘，并跨账户结算 `sim_bets/sim_bet_legs`。自动模式只允许结算系列胜者盘；地图、让分、总局数等盘口必须保持 pending。cancelled 比赛相关腿记为 push，单关整单 void；串关 push 腿按赔率 1.0 重新计算有效赔率。
- 2026-07-15：真实 Tauri sidecar E2E 使用 `local-hltv-2395534` 验证成功：ENCE 0:2 SPARTA、状态 finished、winner ID 13214、本地 outcomes 修复为 ENCE/SPARTA、市场 resolved、价格快照为 0/1；详情页显示“已结束”和 0:2，连续观察 12 秒无 local-sim orderbook 请求。
- 2026-07-15：全量 typecheck、661 tests passed（13 个真实外部环境测试 skipped）、Web build 与 sidecar binary build 通过。

### 后续步骤

1. **P1-高** 历史赔率校准 — 将 local odds 开盘概率、最终赛果、数据完整度与抓取时间写入 signal snapshot，按赛事等级计算 Brier Score、CLV 和模拟 ROI，替换当前固定因子权重。
2. **P1-高** 状态任务可视化 — 在任务中心展示 HLTV reconcile 的 checked/unavailable/updated/settled 数量，并提供单场手动重试和失败原因，避免外部源异常静默积累。
3. **P1-高** Canonical 冲突审核 — 增加同队同赛事近时间重复、一个 HLTV ID 对应多个本地比赛、低置信度模糊合并的审核队列，支持人工拆分与确认。
4. **P2-中** 扩展盘口结算器 — 为 Map Winner、Handicap、Total Rounds 与 Correct Score 分别引入结构化赛果输入和独立 settlement adapter；在适配完成前继续禁止自动结算。
5. **P2-中** Tauri 桌面自动化 — 将 sidecar ready、finished 比分、local price snapshot、无 CLOB 轮询和 bankroll 更新固化为可重复的 macOS App smoke 测试。

---

## 当前规划记录：项目与远端仓库更名

### 已执行

- 2026-07-17：正式产品名统一为 `PolyRader`；对外展示使用首字母大写形式，npm 根包、Cargo package 和目标 GitHub 仓库名使用小写 `polyrader`。
- Web 标题、品牌常量、Tauri productName/window/tray、Cargo 元数据、备份导出文件名、更新器 endpoint、release workflow、README、贡献指南、设计稿和当前产品文档均已同步。
- 内部 npm workspace 作用域继续使用 `@polyrader/*`，无需迁移。
- 为兼容现有用户数据，Tauri bundle identifier `com.polyrader.cs2`、配置目录 `polyrader-cs2`、SQLite 文件名 `polyrader.db` 和设计稿主题存储 key 暂不迁移；这些是持久化身份，不是对外品牌。
- 活跃 TODO 已从 `docs/polyrader-cs2-implementation-todo.md` 更名为 `docs/polyrader-implementation-todo.md`。
- 2026-07-17：通过内置浏览器的 `StrayShark` 管理员会话，将 GitHub 仓库从 `StrayShark/polyrader_cs2` 重命名为 `StrayShark/polyrader`；本地 `origin` 已同步为 `git@github-strayshark:StrayShark/polyrader.git`。

### 验证

- `npm run typecheck`：通过，6/6 tasks successful。
- `npm test`：通过，661 tests passed，13 个依赖真实外部环境的测试 skipped。
- `npm run build:web`、`npm run build:server`：通过；Web 仍有既有的 Node-only core exports externalize warning，不阻断构建。
- `cargo check --manifest-path src-tauri/Cargo.toml`：通过，Rust package 已以 `polyrader v0.3.0` 编译。
- Playwright 改名专项：侧栏 `PolyRader` 品牌和 `polyrader-backup-*` 导出文件名 2/2 passed。
- 远端验证：`gh repo view StrayShark/polyrader` 返回新仓库名、URL 与默认分支 `main`；`git ls-remote --symref origin HEAD` 返回 `refs/heads/main` 和提交 `e593c0d`。

### 风险

- GitHub 通常会保留旧仓库 URL 的重定向，但所有新文档、自动更新器和本地 remote 必须继续使用 `StrayShark/polyrader`，避免长期依赖重定向。
- 如果未来迁移 bundle identifier 或配置目录，必须提供旧目录探测和数据库搬迁逻辑，不能直接替换字符串。

### 后续步骤

1. **P1-高** 在新仓库名下跑一次 tag/release dry run，确认 Tauri updater 的 `latest.json` 与安装包命名正确。
2. **P2-中** 检查仓库 About、社交预览和 release 描述中的历史品牌文案，统一为 PolyRader。
3. **P2-中** 后续如需迁移 bundle identifier/配置目录，先设计一次性兼容迁移并覆盖已有本地数据库回归测试。

---

## 当前规划记录：PolyRader 阶段基线提交

### 提交范围

- 2026-07-17：以 `feat: 完成 PolyRader 模拟盘与 CS2 数据闭环` 作为阶段基线提交信息，目标分支为 `origin/main`。
- 提交包含 PolyRader 产品与远端仓库更名、simulation-first 信息架构、模拟账户/下注/账本/复盘/数据库/策略实验室、migration 021-029、HLTV/Liquipedia 数据补全、canonical 市场合并与自动结算。
- 同步提交相关单元测试、集成测试、Playwright E2E、三主题视觉基线、产品文档、发布配置和 Tauri 元数据。
- `.env`、本地 SQLite、Turbo 日志、构建目录和测试临时文件保持忽略，不得进入 Git 历史。

### 验证

- `npm run typecheck`：6/6 tasks successful。
- `npm test`：661 tests passed，13 个真实外部环境测试 skipped。
- `npm run build:web`、`npm run build:server`、`cargo check --manifest-path src-tauri/Cargo.toml`：通过。
- PolyRader 品牌与备份文件名专项 Playwright：2/2 passed。
- 提交前 `git diff --check` 和敏感凭据模式扫描：通过；新增文件最大为 248 KB，无异常大文件。

### 风险

- 这是跨产品、数据、服务、UI 和文档的阶段基线提交，变更面较大；后续应恢复按垂直功能切片的小提交节奏。
- migration 021-029 会在旧数据库首次启动时连续执行，发布前仍需用数据库副本做升级冒烟。
- Web build 仍有 Node-only core exports externalize warning，当前不阻断构建，但应拆分 browser-safe exports。

### 后续步骤

1. **P0-必须** 推送后检查 GitHub Actions，确认 typecheck、Vitest、Playwright、Web build 和 Cargo check 全部通过。
2. **P1-高** 使用旧版数据库副本验证 migration 021-029、模拟余额和历史分析记录均无丢失。
3. **P1-高** 在 `StrayShark/polyrader` 做一次无正式发布副作用的 release 构建验证，检查安装包名称和 updater endpoint。

### 推送后 CI 修复

- 首次推送提交 `6ffff3b` 已成功到达 `origin/main`，但 GitHub Actions run `29564418447` 在创建 jobs 前失败，且无 job 日志。
- 原因是 `jobs.live-trading-smoke.if` 直接引用 `secrets.POLYMARKET_PRIVATE_KEY`；GitHub Actions 不允许在该 job 条件位置直接使用 secrets context。
- 修复方式：job 条件改用非敏感仓库变量 `vars.POLYMARKET_LIVE_SMOKE_ENABLED == 'true'`；默认未配置时整项跳过，只有管理员显式启用后才在最终 smoke 步骤注入 secrets。
- 修复提交 `79baf62` 触发的 run `29564713257` 已正常创建 jobs；Lint、Type Check、Vitest、Cargo Check 和三平台 Bun Compile 通过，`Live Trading Smoke` 按默认策略 skipped。
- 该 run 的 Browser E2E 进一步暴露 `real-llm-analysis.spec.ts` 套件归属错误：测试位于只启动 Vite 的 mock browser suite，却直接请求真实 `/api/esports/fetch-upcoming`，导致 201 passed、1 skipped、1 failed，Integration E2E 随后被跳过。
- 修复方式：将真实 LLM 用例移至 `e2e-integration`，增加 `POLYRADER_REAL_LLM_E2E=1` 显式开关与 `test:e2e:real-llm` 独立脚本；标准 Browser E2E 不再依赖本地 API 或外部网络，Integration E2E 默认安全跳过真实用例。
- 本地验证：标准 Browser E2E 201 passed / 1 skipped；Integration E2E 8 passed / 4 个显式外部环境用例 skipped，real LLM 用例按预期未连接真实数据源。
- 后续验证：推送后确认新 GitHub Actions run 全部通过；需要真实数据时再显式运行 `POLYRADER_REAL_LLM_E2E=1 npm run test:e2e:real-llm`。

---

## 当前规划记录：可审计的队伍情报分析快照

### 已执行

- 2026-07-19：复用现有 HLTV 主动补全链路，在普通与 SSE 流式 LLM 分析前检查双方队伍资料；排名、近期赛果、现役 roster、地图池、比赛首发不完整时主动补全，完整但超过 `POLYRADER_HLTV_TEAM_TTL_HOURS` 时也重新抓取。
- Prompt 不再只提供近期胜率和前三名选手。双方最近最多 10 场的日期、胜负、比分、对手、赛事，以及五人 roster 的 rating、K/D、HS%、maps、role 均作为结构化文本输入模型。
- 缺少事实来源时排名和个人指标统一写为 `N/A`，分析 fallback 排名使用 `999` 并在数据质量中标记缺失；禁止继续用 `#10`、`1.00 rating` 等默认值伪装真实数据。
- `LLMAggregation.analysisData` 保存本次模型实际使用的双方 Team、比赛级 lineups、来源、抓取时间、完整度和缺失字段；快照创建时深拷贝，后续内存对象变化不得改写历史结果。
- 比赛详情的 AI 页新增“本次分析采用的数据”，展示覆盖率、来源时间、双方排名、近期场次/胜率、首发确认状态和五人个人指标。概览页的 Team Intelligence 表示当前最新资料，AI 页快照表示某次分析实际输入，两者职责不得混用。
- Playwright 本地端口支持 `PLAYWRIGHT_PORT` 覆盖，避免 5174 被其他项目占用时误把另一个应用当成 PolyRader 执行 E2E。

### 数据完整性契约

- 完整快照共 10 个检查项：双方有效世界排名、双方至少一场近期赛果、双方至少五名 roster、双方非空地图池、双方至少五名比赛首发。
- `completeness` 为已满足检查项比例，`missingFields` 必须保留结构化字段名；`lineupConfirmed` 独立表达 HLTV 是否已确认双方首发。
- 外部抓取失败允许使用本地旧数据继续分析，但结果必须携带实际来源和缺失项，不得静默填充虚构数据。

### 验证

- `npm run typecheck`：6/6 tasks successful。
- `npm test`：666 passed，13 个依赖真实外部环境的测试 skipped；全仓 8/8 tasks successful。
- Core Vitest：302 passed；Server Vitest：196 passed。
- Prompt/快照专项：37 passed，覆盖逐场赛果、完整个人指标、N/A 降级、完整度和不可变快照。
- 比赛详情 Playwright：独立端口运行 4/4 passed，已断言分析完成后显示 HLTV 数据快照。
- `npm run build:web`：通过；保留既有 Node-only core exports externalize warning，不阻断构建。
- ESLint：0 errors；15 个 warnings 均为本次改动前已存在的测试 `any` 或未使用 catch 参数。

### 后续步骤

1. **P1-高** 持久化分析输入快照 — 为 `llm_analyses` 或独立 `analysis_data_snapshots` 增加 JSON 快照、数据版本和 source timestamp；当前聚合快照只保存在 10 分钟 cache，应用重启后无法审计历史输入。
2. **P1-高** 个人高级指标事实源 — 接入可靠来源补齐 ADR、KAST、真实 K/D、HS% 和角色；当前 HLTV match page 稳定提供近三个月 rating，其余缺失指标继续显示 `-`/`N/A`。
3. **P1-高** 数据质量约束模型置信度 — 对不完整快照设置最高 confidence 上限，并在低于阈值时允许用户先刷新数据再消耗 LLM token。
4. **P2-中** 拆分新鲜度 TTL — 分别记录 team overview、results 和 lineup 更新时间；临近开赛只高频刷新 lineup，避免因单一 `teams.updated_at` 触发双方完整重抓。
5. **P2-中** 质量分层回测 — 将 completeness、missingFields 与最终赛果写入 signal snapshot，比较完整/部分数据下的 Brier Score、CLV 和模拟收益。

---

## 当前规划记录：赛事大厅刷新与真实 HLTV 盘口

### 已执行

- 2026-07-19：确认赛事大厅刷新卡死的根因是 `/api/esports/fetch-upcoming` 在一个同步请求中串行等待 HLTV 赛程、阵容、队伍资料、GRID 与 Polymarket；真实请求曾耗时 63.8 秒，外部源 403/超时时会长期禁用刷新按钮。
- 快速刷新阶段改为并行请求 HLTV、GRID 和 Polymarket，单源上限由 `POLYRADER_ESPORTS_REFRESH_TIMEOUT_MS` 控制，默认 10 秒；赛程摘要立即写入数据库，近期战绩、排名、阵容、选手和地图池进入去重的 `hltv-discovery-enrichment` 后台任务。
- HLTV 赛程摘要现在会生成标准 `local-hltv-*` 本地模拟盘口，使用稳定 canonical ID，保留已有模拟赔率，并清理赛事/队伍名称中的换行和多余空白；没有合法时间或已经过期的赛事不得重新进入大厅。
- 已有队伍排名、近期战绩、地图池或阵容证据会在快速落库阶段立即调用 `estimateLocalOdds` 重估本地盘口；后台深度补全结束后再次重估、写入价格历史并重新预热大厅缓存。
- 手动刷新完成后预热 50/100 条本地市场缓存，前端无需再等待一次外部 Gamma 请求即可看到新增赛事。
- 前端刷新请求增加 15 秒调用方超时；加载或刷新失败时已有赛事继续显示，只显示非阻断的本地数据提示，禁止用全屏错误状态覆盖仍可用的市场数据。
- 大厅成功刷新后显示“队伍和选手详细情报正在后台补全”，按钮恢复可用；刷新中的按钮使用独立文案和禁用状态。

### 数据与交互契约

- “赛事刷新完成”表示可用赛程与模拟盘口已经落库并可操作，不表示所有详细情报已经抓取完成；深度数据进度与失败原因属于后台任务中心。
- 新发现且没有任何本地证据的 HLTV 赛事初始模拟概率允许为 50%/50%；一旦存在本地证据必须即时重估。两种情况都必须标记 `local-sim` 与 `local-odds-v1`，不得伪装成 Polymarket 实盘赔率。
- 已有本地盘口再次发现时保留已校准的 `outcomePrices`、成交量和流动性字段；已 resolved 的同 ID 市场不得被刷新重新打开。
- 外部刷新失败不得清空 Zustand 中已有 markets；只有首次加载且本地也没有任何数据时才显示阻断错误状态。

### 验证

- Tauri sidecar 真实刷新：4.69 秒返回 200，获得 40 场 HLTV 赛程，35 个仍开放的 `local-hltv-*` 盘口成功写入；`/api/markets?limit=100` 立即返回 38 场（35 场真实赛程 + 3 场练习种子）。
- 本地证据重估：35 个开放 HLTV 盘口中 32 个由 50%/50% 占位概率更新为差异化概率；无证据的 3 个盘口继续保持中性价格。
- 页面回归：HopLan 2026 Playoffs、G2 Ares、BLAST Bounty 等真实赛事可见；刷新结束后按钮恢复、后台补全提示可见、无 `Request failed`。
- 赛事大厅 Playwright：5/5 passed，覆盖刷新失败时保留现有比赛和重新启用按钮。
- 全仓 `npm run typecheck`：6/6 tasks successful；`npm test`：669 passed，13 个真实外部环境测试 skipped。
- `npm run lint`：0 errors，16 个既有 warning；`npm run build:web` 与 `npm run build:server` 通过，sidecar 可执行文件构建成功。

### 风险

- HLTV 详细页仍可能返回 403；快速刷新不受影响，但后台补全可能保留不完整排名、阵容或地图池，必须继续通过数据完整度和任务日志如实展示。
- `withTimeout` 当前只让调用方停止等待，底层浏览器抓取未必被真正取消；连续高频刷新仍可能留下短时后台 I/O。
- 完全没有队伍证据的新赛事仍会使用 50%/50% 初始本地赔率，适合模拟盘占位，不应作为经过校准的预测结论。

### 后续步骤

1. **P1-高** 实时推送重估结果 — 后台补全每完成一场即通过 WebSocket 推送最新本地赔率和数据完整度，避免前端等待下一次 markets 拉取；同时记录从占位概率到证据概率的 CLV 轨迹。
2. **P1-高** 情报状态可视化 — 在赛事行展示 `pending / partial / complete / failed`、数据更新时间和失败原因，并提供单场重试入口；任务中心与大厅状态使用同一数据源。
3. **P1-高** 可取消外部抓取 — 为 `fetchWithBrowser`、HLTV/GRID 客户端传递 `AbortSignal`，让控制器超时能释放浏览器页和网络连接，同时限制手动刷新频率。
4. **P2-中** 本地盘口生命周期 — 定时关闭已过期 `local-hltv-*` 盘口、清理长期无赛果记录，并确保结算任务优先处理 finished 赛事而非仅按 endDate 关闭。
5. **P2-中** Tauri 自动回归 — 固化“启动 sidecar → 刷新 → 至少一场真实 HLTV 赛事可见 → 按钮恢复 → 失败时旧数据保留”的桌面 smoke 测试。

---

## 当前规划记录：统一设置中心与侧栏收敛

### 已执行

- 2026-07-20：主题、语言、LLM 和本地数据库统一收敛到 `/settings`，设置中心固定为 `general / llm / database / system` 四个查询参数分区；分区链接必须可复制、可刷新，并支持浏览器前进和后退。
- 侧栏移除左上角 PolyRader 产品标题、主题快捷按钮、语言切换器以及重复的数据库/LLM 主导航；设置入口固定在侧栏左下角，桌面和移动布局遵循同一信息架构。
- `/ai/config` 与 `/database` 保留为兼容地址，但只允许重定向到 `/settings?section=llm` 和 `/settings?section=database`，不得重新形成平行设置页面。
- 常规设置包含主题、语言、模拟盘风控与高级账户入口；LLM 分区复用模型配置能力；数据库分区集中数据库状态、路径、备份导入导出和清理操作；系统分区集中服务健康度与后台任务。
- LLM 与数据库页面支持 `embedded` 模式，作为设置中心子页面时不得重复渲染一级页面标题或后台任务；数据库工具栏在窄容器中必须换行，标题不得被操作按钮压缩。

### 产品与交互约束

- 全局主题和语言控制只允许出现在设置中心；其他页面可以展示当前状态，但不得提供第二套可编辑入口。
- 侧栏底部设置入口必须独立于可滚动业务导航，始终保持可发现；左上角不得恢复产品标题或品牌占位区。
- 新增全局配置时应先判断归属：用户偏好进入常规设置，模型与密钥进入 LLM，本地存储与备份进入数据库，运行状态与后台任务进入系统。
- 设置分区切换应保留 URL 契约；未知 `section` 值回退常规设置，不得显示空白页。

### 验证

- Web TypeScript typecheck、48 个 Web 单元测试与 Web production build 通过。
- ESLint 为 0 errors；保留一个本次变更前已存在的 `wallet-follow-store.ts` warning。
- Playwright 覆盖桌面/移动侧栏、四个设置分区、旧地址重定向、数据库备份入口与模拟风控保存；视觉检查确认左上角无产品标题、设置固定在左下角，LLM/数据库真实内容可加载。
- 数据库分区已在桌面 Tauri WebView 对应尺寸检查标题与工具栏，不再出现纵向挤压或按钮裁切。

### 风险

- 设置页当前直接加载 LLM 与数据库模块，首个设置分包约 38 KB；功能可用，但后续配置项继续增长时需要按分区懒加载。
- 分区切换会卸载当前面板，尚未保存的 LLM 密钥输入会丢失；现阶段沿用显式保存语义，后续应增加脏状态保护。
- 主题和语言仍主要依赖浏览器本地持久化；多窗口 Tauri 场景下尚未建立统一配置同步协议。

### 后续步骤

1. **P1-高** 设置分区懒加载与状态保护 — 按 query section 动态加载 LLM/数据库模块，并在存在未保存配置时拦截切换或明确提示。
2. **P1-高** Tauri 配置统一持久化 — 将主题、语言和非敏感偏好同步到桌面配置层，支持多窗口实时更新；密钥继续使用受保护存储，不得写入普通配置或日志。
3. **P2-中** 设置搜索与深链 — 配置项增加关键词索引，搜索结果直接定位到分区和控件，保持 `/settings?section=...` 契约稳定。
4. **P2-中** 可访问性回归 — 补齐设置 tabs 的方向键导航、焦点恢复、未保存提示和移动端滚动定位测试。

### 顶部栏分隔线补充

- 2026-07-20：应用内容区顶部工具栏必须使用 1px `border-bottom` 与下方虚拟资金栏分层，颜色使用 `foreground 28% + background 72%` 的实色混合，确保 Dark+、Light+ 与 Matrix 三套主题下都可辨识，同时保持 Cursor 风格的克制层级。
- 顶部栏使用稳定的 `app-topbar` 测试标识；后续调整高度、背景或吸顶行为时不得移除底部分隔线。
- **后续步骤 P2**：在三套主题的桌面和移动视觉回归中加入顶部栏边界检查；如果未来启用 Tauri overlay title bar，应让原生拖拽区与当前 Web 顶部栏共用同一条视觉分隔线，避免双线。

---

## 当前规划记录：Tauri 本地 API 跨域契约

### 已执行

- 2026-07-20：修复开发态 Tauri 使用 `127.0.0.1` origin 时，大部分页面统一显示 `Load failed` 的问题。根因是 sidecar CORS 只允许 `localhost`，WKWebView 拒绝读取来自 `http://127.0.0.1:<port>` 到 `http://localhost:13001` 的响应。
- sidecar 仅放行本机 `localhost`、`127.0.0.1`、IPv6 loopback、`tauri://localhost` 与 `tauri.localhost` origin；相似前缀域名和外部网站必须继续拒绝，不得为了调试改成通配符 CORS。
- CORS methods 必须覆盖前端 API 客户端实际使用的 `GET / POST / PUT / PATCH / DELETE`，否则带预检的更新接口会表现为 405 或通用加载失败。

### 验证

- Tauri 使用 `http://127.0.0.1:5196` 重启后，WKWebView 对 `/api/sim/bankroll`、`/api/markets`、`/api/health` 和 `/api/esports/fetch-upcoming` 的真实请求均返回 200/304，窗口保持运行。
- 带 `Origin: http://127.0.0.1:5196` 的 GET 响应包含精确的 `Access-Control-Allow-Origin`；PATCH 预检返回 204，并声明 `GET,POST,PUT,PATCH,DELETE`。
- `/api/system/features`、`/api/health`、`/api/markets`、`/api/daily`、`/api/sim/bankroll`、`/api/sim/bets`、`/api/backup/info` 与 `/api/ai/config/keys` 真实本地冒烟均返回 200。
- Server typecheck 与 bundle build 通过；Server Vitest 27 files / 211 tests passed；ESLint 0 errors，保留 9 个既有 warning。

### 后续步骤

1. **P1-高** Tauri 启动冒烟 — CI 中使用随机空闲端口和 `127.0.0.1` dev URL 启动 App，验证 `/api/health`、`/api/markets`、`/api/daily` 与 `/api/backup/info` 均返回允许当前 origin 的 CORS 头。
2. **P2-中** 错误提示分层 — 前端公共请求层将网络失败、CORS/sidecar 不可达、HTTP 业务错误与超时转换成可操作的中文提示，禁止所有场景只显示浏览器原始 `Load failed`。
3. **P2-中** 启动诊断页 — 系统设置展示 WebView origin、sidecar 地址、CORS 自检与最近一次请求失败原因，便于桌面环境快速定位端口和安全策略问题。

---

## 当前规划记录：Cursor 黑白灰主题

### 已执行

- 2026-07-20：Dark+、Light+ 和原 Matrix 三套结构 token 全部改为低色度黑白灰；默认 Dark+ 使用 `#181818` 页面背景、`#1f1f1f` 面板、`#333333` 边框与浅灰反色 primary，移除暖棕背景和橙色主操作。
- 原 `matrix` 主题 ID 为兼容本地偏好继续保留，设置界面名称改为“高对比 / High Contrast”，其背景、卡片、主操作与焦点环均改为黑白灰，不再保留霓虹绿色 primary 例外。
- 绿、红、黄、蓝等颜色只允许表达盈亏、风险、警告、数据源和图表序列；侧栏、顶部栏、页面、卡片、默认按钮、导航 active 与普通 hover 必须使用结构灰阶。
- Playwright Cursor token 审计与视觉规范同步到新色值，三主题统一校验 primary，不再跳过高对比主题。

### 验证

- Web typecheck、14 个布局单测与 production build 通过；ESLint 0 errors，保留一个既有未使用参数 warning。
- Playwright 三主题 token 审计 3/3 passed，Dark+、Light+ 与高对比的 background、foreground、primary、border 均命中新灰阶基线。
- 真实数据界面视觉检查覆盖赛事大厅壳层与设置中心：默认深色无暖棕或橙色结构面，浅色为纯灰白，高对比为纯黑白；主题分段控件的 macOS 默认橙色焦点轮廓已替换为灰色主题 ring。
- `.trae/documents/design-spec.md` 与交互设计稿 `ui-design.html` 已同步，禁止继续以旧橙色和 Matrix 绿色作为 primary。

### 后续步骤

1. **P1-高** 三主题视觉基线 — 更新赛事大厅、比赛详情、设置中心与模拟投注单的 Dark+ / Light+ / 高对比截图，检查文本、边框、选中态与 disabled 对比度。
2. **P1-高** 图表色板收敛 — 将多序列图表限制为灰阶主序列加最多两种语义色，统一 AI、行为金融、市场概率的跨页面映射。
3. **P2-中** 硬编码颜色审计 — 移除非语义场景中的 Tailwind 固定色阶和历史橙色，新增结构区域色度阈值检查，防止后续页面重新彩色化。

---

## 当前规划记录：统一账本工作台

### 已执行

- 2026-07-20：侧栏将“我的账本”“模拟盘”“复盘中心”收敛为唯一“我的账本”入口；三项能力必须在同一页面内通过 Tab 切换，不得恢复平行侧栏入口。
- 统一 URL 契约为 `/bankroll?section=ledger|simulation|review`。默认账本允许省略 `section`；未知值回退账本；`/simulation` 与 `/review` 仅作为旧书签兼容地址，分别重定向到对应 Tab。
- 账本、模拟盘和复盘页面支持 `embedded` 模式，在工作台中不得重复渲染一级标题；页面只挂载当前激活模块，避免首次进入时并发请求三套接口。
- 全局命令面板保留三个可搜索目标，但模拟盘和复盘中心必须使用工作台深链；侧栏只显示一个 `/bankroll` 链接。

### 产品与交互约束

- 三个 Tab 共享“我的账本”一级标题，Tab 本身表达当前任务上下文；切换必须同步查询参数，以支持刷新、复制链接、前进和后退。
- 模拟盘表单、回测、账本统计和复盘筛选继续使用各自数据 store；不得为了统一界面合并业务状态或同时预取全部接口。
- 旧地址兼容属于路由契约，不得在侧栏、面包屑或主操作中重新暴露为独立页面。

### 验证

- Web TypeScript typecheck、49 个 Web 单元测试与 production build 通过；ESLint 0 errors，保留一个本次变更前已存在的 `wallet-follow-store.ts` warning。
- 22 项针对性 Playwright E2E 通过，覆盖三个 Tab 的选中状态、查询参数、按需数据请求、两个旧地址重定向、原模拟盘/复盘交互以及桌面/移动侧栏。
- 真实 sidecar 健康接口返回 200；本地真实数据界面确认侧栏只有一个账本入口，三个 Tab 共享一级标题且可正常切换，账本、模拟盘和复盘模块均无重复标题或布局遮挡。

### 风险

- Tab 切换会卸载当前模块；模拟盘存在未保存的配置修改时，当前实现不会拦截离开。
- 原有外部链接虽然会自动重定向，但自动化或埋点若严格匹配旧 pathname，需要改用统一工作台 URL。

### 后续步骤

1. **P1-高** 未保存状态保护 — 模拟盘配置变脏时，在切换 Tab、离开工作台或关闭窗口前提供明确确认，并支持保存后继续。
2. **P1-高** 跨 Tab 摘要 — 在 Tab 标签旁展示未结算模拟注单数、待复盘数和最近回测状态，数据沿用已有 store，不新增重复接口。
3. **P2-中** 空闲预加载 — 首屏稳定后仅预加载相邻 Tab 的代码分包，不提前触发其业务数据请求。
4. **P2-中** 键盘与移动回归 — 补齐方向键切换、焦点恢复、窄屏 Tab 横向滚动和返回历史状态测试。

---

## 当前规划记录：高胜率钱包与纸面跟单策略

### 已执行

- 2026-07-20：巨鲸刷新改为真实采集闭环。`POST /api/whales/refresh` 优先读取无需用户密钥的 Polymarket 公开 Data API，同时采集大额成交、PnL 排行钱包及其最近 50 个已结算仓位；Data API 不可用时才降级 Polygon RPC。
- 高胜率钱包统计必须保存胜率、PnL、ROI、已结算样本数和总投入。默认候选资格为至少 10 个样本、胜率不低于 60%、ROI 不低于 2%；不得把高胜率但长期负收益的钱包标记为合格跟随对象。
- 跟随策略内置“高胜率”“大额动量”“保守跟随”“分散跟随”四个预设，统一保持 `paper` 模式。任何预设、自动复制开关或信号执行都不得绕过模拟盘边界发送真实订单。
- 风控配置增加 `minLeaderRoi`，由 migration `030_copy_leader_roi_filter.sql` 持久化；迁移文件必须同步登记到 `migrate.ts` 显式清单，禁止只新增 SQL 文件而不执行。
- 刷新接口必须返回扫描来源、写入交易数、发现钱包数、合格钱包数、失败数和降级警告；前端刷新必须调用该接口并清理排行榜缓存，不得仅重复读取 SQLite。

### 验证基线

- Core 复制风控覆盖负 ROI 拒绝和四个 paper 预设；Infra 覆盖公开成交、排行榜和最新已结算仓位映射；Server 覆盖 Data API 优先、Polygon 降级、钱包指标计算、迁移和排行榜字段保留。
- E2E 必须覆盖刷新请求、真实结果渲染、高胜率筛选、四个预设写回和最低 ROI 配置。每次改动巨鲸页或钱包配置字段时同时更新 API fixture 与输入控件数量断言。
- 2026-07-20 实测：真实刷新发现 12 个头部钱包，3 个同时满足候选门槛，失败 0，采集源为 `data-api`；页面显示 4 个胜率不低于 60% 的观察钱包，其中负 ROI 钱包继续展示但无法通过默认跟随风控。
- 全量测试通过：Core 304、Infra 123、Server 215、Web 49；巨鲸刷新与跟随 Playwright 11/11 通过，四个 workspace typecheck、Web production build、Server bundle 与 lint（0 error）通过。
- Tauri 真实库已执行 migration 030；实机界面确认高胜率表、四策略卡、最低 ROI 字段、连接状态和纸面模式提示完整，无布局遮挡。巨鲸模块不得再展示切换实盘的入口或文案。

### 风险

- PnL 排行用于发现成熟钱包，天然偏向历史头部，并不代表全市场钱包全集。
- 当前钱包绩效基于最近 50 个全市场已结算仓位，复制信号仍限制为 CS2；CS2 专属样本不足时必须在界面说明口径，禁止误称为 CS2 专项胜率。
- 浏览器网络回退首次请求可能较慢；公开 API 的可用性和字段变更必须通过健康状态与刷新警告暴露。
- `whale_trades` 目前以交易哈希为主键，同一链上交易包含多个 fill 时存在合并风险，后续增量采集需升级复合唯一键。

### 后续步骤

1. **P1-高** CS2 专项钱包评分 — 积累足够的已结算 CS2 市场后，按赛事、盘口和时间窗口计算收缩后的胜率与 ROI，并与全市场指标并列展示。
2. **P1-高** 策略历史回测 — 对四个预设分别计算模拟收益、最大回撤、Brier Score、成交延迟和滑点敏感性，禁止仅依据钱包历史胜率推荐策略。
3. **P1-高** 增量采集可靠性 — 引入 cursor/offset checkpoint，并将大额成交唯一键升级为交易哈希、资产、钱包和成交序号组合，避免漏写同交易多笔 fill。
4. **P2-中** 小样本校准 — 使用 Beta-Binomial/Bayesian shrinkage 与置信区间降低 10 至 30 个样本钱包的胜率偏差，在界面展示校准后评分。

---

## 当前规划记录：多盘口分析与低流动性警告

### 已执行

- 2026-07-21：比赛级 LLM 聚合结果扩展为逐盘口分析，支持比赛胜负、地图胜负、地图让分、总地图数大小分和正确比分；普通分析与 SSE 流式分析必须返回一致的 `marketAnalyses` 契约。
- 衍生盘口统一从 LLM 系列赛胜率反推单图胜率，再按 BO1/BO3/BO5 枚举终局比分分布；盘口价格先归一化去除 overround，再计算模型概率与市场概率偏差。
- 同场盘口关联优先使用 condition ID、slug 和 `canonicalMatchId`；历史记录缺少稳定 ID 时才允许按规范化后的双方队名精确配对，禁止仅按赛事名或单个队名合并盘口。
- 外部盘口 `liquidity < 1000 USD` 必须标记为 `low`、信号降级为 `observe_only`，分析置信度乘以 0.55，并在赛事大厅、比赛详情赔率区和多盘口分析区显示黄色警告。该规则不得禁用模拟投注按钮。
- `local-sim` 与 `local-seed` 属于合成练习盘口，0 美元流动性不得误报为外部低流动性；其状态使用 `synthetic`。
- 总回合数盘口需要地图、常规回合、加时和 veto 输入；在独立模型完成前必须标记为 `unsupported / model_limited`，禁止套用总地图数公式生成虚假概率。
- 多盘口分析只用于模拟练习、概率偏差观察和复盘，不构成真实投注建议，也不得触发 Polymarket 订单接口。

### UI 与数据契约

- 多盘口面板必须展示盘口类型、问题、流动性状态、分析置信度、信号、各结果的市场概率、模型概率与百分点偏差。
- 黑白灰继续作为结构主色；黄色只用于低流动性等警告，绿色/红色只用于正负偏差等语义状态。
- `MarketScenarioAnalysis` 新增字段时必须同步 Core 类型、Server 聚合、Web fixture、zh/en i18n 和 Playwright E2E。
- 低流动性阈值当前统一由 `LOW_LIQUIDITY_THRESHOLD_USD = 1000` 定义，禁止各页面硬编码不同阈值。

### 验证

- Core 多盘口专项 5/5 通过，覆盖 BO3 胜负/让分/总地图数、价格归一化、1000 美元边界、合成盘口豁免和总回合数拒绝推导；Core 全量 316 项通过。
- Infra 全量 124 项通过；Core、Infra、Server、Web TypeScript 检查通过；本次相关 Core/Server/Web 文件 ESLint 0 error。
- Playwright 多盘口专项 2/2 通过，覆盖让分、大小分、模型偏差、650 美元“仅观察”警告、模拟按钮继续可用，以及 390px 窄屏面板无横向溢出。
- Web production build 与 Server sidecar bundle 成功；真实本地库 62 个活跃盘口中没有外部低流动性样本，现有 0 美元盘口均为 `local-sim/local-seed`，实测未误报。
- 全量 `npm run test` 当前有 5 个既有 Server 失败：4 个 MarketService 测试仍使用引用相等断言，1 个 WhaleService 测试的缓存键期望未同步新增筛选参数；与本次多盘口实现无关，但必须作为 P1 回归修复。

### 风险

- 让分、总地图数和正确比分仍由同一系列赛胜率衍生，假设各地图独立同分布；地图池、veto、选边和阵容变化可能让实际分布明显偏离。
- 当前使用盘口汇总 `liquidity`，不能表达单侧深度、目标金额滑点和撤单风险；低流动性警告是粗粒度保护，不等同于可成交性判断。
- 真实库目前没有外部低流动性活跃样本，外部真实数据验证仍依赖后续 Polymarket 出现对应 CS2 盘口。
- 比赛详情的既有战队情报表格在 390px 窄屏仍有内部横向滚动；新增多盘口面板本身无溢出。

### 后续步骤

1. **P1-高** 修复 Server 全量测试基线 — 将 MarketService 引用相等断言改为行为/深度相等契约，并同步 WhaleService 缓存键筛选参数，恢复 `npm run test` 全绿。
2. **P1-高** 地图级独立模型 — 使用地图池、veto 顺序、选边、近期地图胜率和阵容状态分别预测每张地图，再卷积得到让分、总地图数与正确比分概率。
3. **P1-高** 分盘口历史校准 — 按 `match_winner / map_winner / handicap / total_maps / correct_score` 分别记录 Brier Score、ROI、命中率与置信区间，校准当前衍生权重。
4. **P2-中** 深度与滑点风险 — 接入 CLOB 双边深度，以目标模拟金额计算预期均价和滑点；将 1000 美元汇总阈值升级为“流动性 + 深度 + 价差”的联合警告。
5. **P2-中** 窄屏情报表格收敛 — 修复战队情报区内部 480px 固定内容宽度，避免移动端出现横向滚动，并纳入详情页整体响应式回归。

---

## 当前规划记录：四游戏数据源接入与完成边界

### 本次已完成

- 2026-07-21：新增 `cs2 / lol / dota2 / valorant` 统一数据源契约、访问级别、配置状态、同步结果和比赛/队伍/选手/事件/版本/内容六类快照实体。
- migration `032_multigame_esports_sources.sql` 新增隔离的 `esports_source_snapshots` 与 `esports_source_sync_runs`。新游戏原始数据必须先写入该层，不得直接污染现有 CS2 `matches / teams / players` 事实表。
- 新增数据源 API：目录、按游戏同步、快照查询、Liquipedia 队伍搜索和指定队伍阵容同步。设置中心系统 Tab 展示四游戏数据源矩阵、配置状态、最近同步和手动同步入口。
- LoL：Riot Data Dragon 公开版本数据已接入；Liquipedia League of Legends wiki 的队伍检索与动态 `ActiveSquadAuto` 阵容展开已接入。
- Dota 2：OpenDota 的最近职业比赛、队伍排名/胜负记录和职业选手归属已接入；Liquipedia Dota 2 wiki 阵容已接入。
- Valorant：Liquipedia Valorant wiki 的队伍检索与动态阵容展开已接入；Riot VAL Content 接口已实现，但仅在 `RIOT_API_KEY` 配置后执行。
- GRID 客户端支持按游戏 title ID 查询，并在真实请求失败时返回失败状态；LoL、Dota 2、Valorant 不得复用 CS2 默认 title ID。VLR、Oracle's Elixir、STRATZ 在没有受支持 API/许可适配器时只标记为人工参考，禁止伪装成自动数据源。
- `.env.example` 必须保留每游戏 Liquipedia URL、GRID title ID、OpenDota、Riot、Steam 和 STRATZ 的配置说明；密钥缺失时同步应返回 `skipped/partial`，不得用 401/403/405 伪装成空数据。

### 真实验证

- migration 032 已在开发库执行。真实 OpenDota 同步写入 250 条实体：50 场职业比赛、100 支队伍、100 名职业选手；快照查询 API 可按游戏和实体类型读取。
- 真实 Liquipedia 阵容同步：LoL T1 返回 5 人，Dota 2 Team Liquid 返回 5 人，Valorant Sentinels 返回 6 人（包含 stand-in）；跨游戏模板不得继续只使用 CS2 roster parser。
- Riot Data Dragon 返回版本 `16.14.1`；当前开发环境的 LoL/Valorant GRID title ID 与 Riot API key 未配置，因此相关授权源正确显示未配置。CS2 GRID 已配置但当前 upcoming 查询为 0 条，状态为部分同步而不是报错。
- 四工作区 TypeScript 检查、Web production build、Server sidecar bundle、19 个数据源专项测试、相关文件 ESLint 与设置页 Playwright 5/5 均通过。
- 全仓 `npm run test` 中 Core 316 项和 Infra 135 项通过；Server 219 项通过、5 项失败。失败仍是既有的 4 个 MarketService 引用相等断言与 1 个 WhaleService 缓存键期望，数据源新增测试无失败。

### 完成边界

- **已完成：数据源接入层**。统一契约、连接器、配置状态、手动同步、快照落库、队伍搜索、阵容同步和设置页可观测性可用。
- **部分完成：各游戏自动采集**。Dota 2 已有比赛/队伍/选手；LoL 目前只有版本和按队伍阵容；Valorant 目前只有按队伍阵容，授权源未配置；三者均未形成稳定的未来赛程自动发现闭环。
- **未完成：产品业务消费层**。赛事大厅、模拟盘口、比赛详情和 LLM 聚合仍读取现有 CS2 `matches / teams` 与 HLTV 数据，没有消费 `esports_source_snapshots`。不得宣称 LoL、Dota 2、Valorant 已支持比赛分析或模拟下注。
- `Player.role` 仍是 CS2 角色枚举；跨游戏阵容额外保存原始 `position`。在建立游戏特定领域模型前，不得把 LoL/Dota 2/Valorant 的位置字段直接作为 CS2 role 参与模型推理。

### 后续步骤

1. **P1-高** 多游戏事实层与赛程发现 — 为 LoL、Dota 2、Valorant 建立规范化 match/team/player/roster 模型、外部 ID 对齐和未来赛程增量任务；先完成可稳定生成比赛详情的事实层，再开放大厅游戏切换。
2. **P1-高** 分游戏分析适配器 — 将快照转换为 LLM 输入，并分别实现 LoL 版本/阵容/位置、Dota 2 队伍 rating/选手/版本、Valorant 阵容/map/agent 数据质量评分；分析结果必须记录来源时间和缺失字段。
3. **P1-高** 盘口与模拟闭环 — 只有在赛事与 Polymarket 市场完成 canonical identity 对齐后，才为新游戏启用胜负、让分和大小分模拟盘口，并按游戏分开回测 Brier Score/ROI。
4. **P2-中** 授权源配置与健康监控 — 获得 GRID 对应 title ID、Riot production key 或其他正式许可后再启用自动同步；增加过期、限流、数据陈旧和连续失败告警。
5. **P2-中** 数据浏览与人工对齐 UI — 在设置或本地数据库中增加快照浏览、队伍搜索、阵容同步及外部 ID 合并操作，所有自动匹配必须展示置信度并允许人工纠正。

---

## 当前规划记录：四游戏 LLM Simbook 产品与文档基线

### 当前权威文档

- 2026-07-21 起，`docs/README.md` 是产品文档唯一入口；当前权威文档仅包括四游戏产品计划、`analysis.v1` LLM 契约、四游戏 UI 原型、研发路线和本项目规则。
- 已删除的 `.trae/documents/*`、旧 CS2 Simbook 计划、旧产品审计、旧 HTML 审计报告和旧 Tauri 指南不得继续被 README、CONTRIBUTING 或新代码注释引用。项目规则中的旧记录仅表示历史决策，不代表当前产品规范。
- 生成型 E2E/视觉报告必须作为 CI artifact 输出，不得重新成为手工维护的产品文档。

### LLM 标准化约束

- 每次分析必须使用 `runId + contractVersion + promptVersion + responseSchemaVersion + dataSnapshotHash + promptHash` 形成可复现身份。
- 提供给 LLM 的用户内容必须是标准 JSON envelope；模型响应必须通过严格 JSON Schema/Zod 校验。禁止继续用贪婪 `{...}` 正则和静默 `0.5` 默认值把无效响应伪装成有效预测。
- 模型只输出概率、置信度、factId 证据引用、风险和简短 `rationaleSummary`；不得要求或保存隐藏思维链，不得允许模型直接决定模拟下注金额。
- 模拟下注由确定性 `PaperDecisionEngine` 根据数据完整度、新鲜度、市场对齐、置信度、edge、流动性和账户暴露计算；无效响应、未对齐市场或未发布板块不得创建模拟订单。
- Prompt、原始响应、规范化响应、校验错误、修复尝试、报告、策略决策、订单和结算必须通过同一 `runId` 形成 append-only 审计链。

### 产品验收边界

- 四游戏板块必须依次通过数据源、事实规范化、市场对齐、标准 Prompt、响应校验、报告、模拟决策、权威结算和统计更新九个阶段，才可标记 `verified` 并进入主赛事大厅。
- 胜率不得独立作为模型排名依据。绩效最少同时展示已结算样本数、Wilson 区间、Brier Score、校准误差、CLV、ROI 和最大回撤；少于 10 个样本隐藏排名，少于 30 个样本显示小样本警告。
- 账本统一为 `Portfolio / Paper Orders / Performance / Review` 四个任务 Tab；现有独立 AI 胜率、LLM 详情和模拟配置能力后续迁入统一工作台，避免重复统计口径。

### 验证与风险

- 本次为产品、LLM 契约、UI 原型、研发路线和文档治理，不修改运行时分析或模拟下注逻辑；不得宣称标准化契约和四游戏模拟下注已经实现。
- 新文档集本地链接检查 0 死链，`git diff --check` 通过；交互原型已在桌面和 390px 窄窗口验证，四游戏切换、Prompt/Response 审计标签、模拟订单与绩效视图可用，页面无全局横向溢出。
- 当前运行时已有 CS2 LLM 分析后自动模拟下注、基础 provider 胜率/ROI/权益统计和全局账本资产曲线，但缺少 run artifact、严格响应校验、跨游戏适配、市场/结算对齐和分维度统计。
- 当前四游戏数据源面板在已运行的旧 Vite 会话中出现翻译 key 原样显示；源代码字典已存在，后续运行时阶段需重启并纳入真实页面 E2E，避免仅靠 mock 掩盖资源加载问题。

### 后续步骤

1. **P1-高** 修复现有 5 个 Server 测试并实施 roadmap Phase 1：migration 033、Core contract、严格 validator、artifact repository 和标准报告 UI。
2. **P1-高** 实施四游戏规范事实层与 Validation Lab；每个板块至少生成一个稳定 `dataSnapshotHash`。
3. **P1-高** 实施确定性 PaperDecisionEngine、市场/结算适配和绩效归因，再按四游戏 E2E release gate 开放主大厅。

---

## 当前执行记录：四游戏真实数据链与运行时隔离

### 本轮已完成

- 2026-07-21：Validation Lab 和四游戏事实归一化的 fixture 回退改为显式 opt-in；生产环境禁止通过接口写入 fixture，正常刷新不得再用演示数据生成 `paper_ready` 假阳性。
- `analysis-response.v1` 已扩展为嵌套严格校验：拒绝未知字段、重复 outcome、非法 direction/impact/severity、空 reason/risk code、未知 factId 及任意层级的 stake/wallet/order 等禁用字段；实际系统消息必须内嵌冻结后的 OUTPUT_SCHEMA，并与用户 envelope 一起持久化和计算 prompt hash。
- 新增标准执行链 `POST /api/analysis/execute`：只能从已归一化真实事实选择比赛，读取设置页中已启用且持有密钥的 provider，发送冻结 Prompt，保存原始响应并进入严格校验、报告和确定性模拟决策；禁止继续将 legacy PromptEngine 的转换结果视为标准 Prompt 已执行。
- 默认本地练习盘口流动性为 0，不得伪造深度；LoL、Dota 2、Valorant 的自动结算规则在真正接入运行时 settler 前统一标记为 unsupported，不能仅凭 registry 占位条目创建模拟订单。
- 标准执行链必须有服务级测试证明“冻结 Prompt 实际发送、动态 runId 回答、严格校验、报告、确定性决策、`sim_bets` 关联”是同一事务审计链；仅测试 fixture ingest 不算真实执行链覆盖。
- Prompt 的稳定 JSON 序列化必须遵守 JSON 语义：对象中的 `undefined` 可选字段省略，数组中的 `undefined` 规范化为 `null`；禁止生成包含裸 `undefined` 的不可解析 provider 请求。
- Validation Lab 禁止为缺失盘口的比赛合成 5000 美元流动性；没有市场输入时 `market_align` 必须为 `missing_market` 且 board 不得进入 `paper_ready`。ingest 未显式提供结算能力时，必须由游戏/盘口 settlement registry 与未来赛程状态共同推导。
- legacy LLM 分析不得同时写入 `simulated_bets` 与 `sim_bets`；自动模拟决策统一由 `analysis.v1 -> PaperDecisionEngine -> sim_bets` 产生，旧 `simulated_bets` 仅作为历史兼容数据读取，禁止新增双写。
- `sim_bets` Performance 统一输出已结算样本数、胜率及 95% Wilson 区间、总下注额、ROI、PnL、Brier、ECE、权益曲线和最大回撤；少于 10 个样本标记 insufficient，10-29 个标记 caution。CLV 在缺少 closing price 快照时必须显示不可用，禁止用 entry edge 冒充。
- “我的账本”统一工作区固定为 `Portfolio / Paper Orders / Performance / Review` 四个任务 Tab；Paper Orders 和 Performance 只消费 canonical `sim_bets`，旧 provider 模拟配置页不再作为账本统计入口。
- Validation Lab 的主验收操作必须按顺序调用真实数据源同步、事实归一化，再允许运行标准 LLM；同步状态、各源 records/message 和分析报告 runId 必须可见。分析报告页的“运行”入口只调用 `/analysis/execute`，fixture 仅保留为显式开发预览。
- Web Vitest 必须排除 `dist`、E2E 目录与 `node_modules`；production build 产物不得被全量单测二次发现和重复执行。
- Server 启动必须在注册可接收流量前完成全部 migration；不得先 `listen()` 再异步升级 schema，避免 Tauri 首屏请求命中新旧表结构竞态。
- 仓储单测的内存 schema 必须与最新 migration 同步，尤其是 `sim_bets` 的 run/report/policy/game/market/edge 审计字段；settlement registry 测试必须验证 runtime settler 的真实支持状态，不得为占位规则维持绿色断言。
- Web 运行时代码与类型统一从 `@polyrader/core/browser` 导入；Core 根入口保留 Node 专用 PromptEngine/KeyManager，浏览器入口不得重新导出 `fs/path/node:crypto` 依赖，production build 不应再出现 browser externalization 警告。
- 单场规范事实的 `sourceLinks` 只能包含目标比赛、同 canonical identity/同队伍同时间窗口的跨源比赛记录，以及双方关联队伍/阵容和全局版本；禁止把同游戏的全部比赛/队伍快照挂到单场，制造 identity/schedule 假冲突或污染 freshness/hash。
- Validation Lab 市场阶段必须从本地 `markets.canonical_match_id` 精确读取实际或明确标识的 local-sim 盘口；CS2 HLTV 事实使用 `hltv:<externalMatchId>` 对齐。0 美元 synthetic 盘口可用于练习概率比较，但必须保留真实 0 流动性并显示相应风险。
- 标准 LLM 执行未显式传 market 时必须优先复用规范比赛对应的 active canonical market，并按 outcome label 对齐 participantId、归一化实际价格；只有没有任何对齐盘口时才可生成 `local-practice:*` 等概率盘口。
- 四游戏源快照按 `match / team / player / event / patch / content` 分实体完整读取并去重，禁止使用单个 200 行窗口造成 Dota 2 比赛快照被队伍/选手快照挤出。
- OpenDota 适配器兼容仓储序列化后的 camelCase 字段，并可从队伍快照补入 rating；CS2 同步接回现有 HLTV 比赛、队伍、阵容、近期状态和地图池数据。
- CS2 `analysis.v1` 事实必须实际包含双方世界排名、近 10 场记录、地图池和可用的阵容个人指标；仅有队名与阵容昵称时不得标记 100% 完整。排名、近期状态、地图池和个人指标分别进入 completeness gate，并在 Prompt 中保留独立 factId。
- 指定 CS2 比赛执行标准分析前必须经过目标比赛自愈：按需抓取 HLTV 比赛详情与双方队伍，回写 legacy 数据，刷新 source snapshots，再只规范化目标比赛后冻结 Prompt；外部抓取失败时可使用已持久化事实继续，但不得虚构缺失字段。
- CS2 facts 回归测试必须同时覆盖降级样本与完整样本：缺少排名/近况/地图池/有效个人指标时 completeness 低于 1；字段齐全时必须生成稳定的 ranking、recent-form、map-pool、player-stats 与 head-to-head factId。标准分析服务测试必须断言指定 matchId 已先传入事实准备器。
- 本轮 CS2 丰富事实、目标比赛准备器及相关测试已按仓库 Prettier 规范格式化；后续若扩展事实字段，继续使用结构化对象与稳定 factId，禁止把整段网页文本直接塞入 Prompt。
- migration 036 为 `esports_fact_matches` 增加 `adapter_version`；FactRepository 必须原样持久化和读取适配器版本，禁止再按 game 硬编码 v1，否则 analysis run 的可复现审计身份会与真实 snapshot hash 不一致。
- 所有新增 migration 除创建 SQL 文件外，必须同步注册到 `packages/infra/src/database/migrate.ts` 的顺序清单，并由空库测试确认实际执行；仅存在于 migrations 目录不等于可发布。
- migration 036、FactRepository 与 MiniMax client 改动已按仓库格式规范整理；后续迁移清单继续保持单一有序数组，避免运行时与测试环境采用不同发现逻辑。
- MiniMax 标准 JSON completion 的 `max_tokens` 固定提高到 8192，并保留 `reasoning_split`；严格校验出现短响应末尾截断时应先检查 completion token 预算，禁止把截断 JSON 交给宽松解析器冒充有效报告。
- Tauri sidecar 环境变量透传范围扩展到 GRID、Riot、Liquipedia、OpenDota、Steam 以及各数据源 feature flag；桌面应用和浏览器开发服务器必须使用同一数据源配置语义。
- Tauri v2 的 Vite `beforeDevCommand` 必须识别 `TAURI_ENV_PLATFORM`（兼容 `TAURI_ENV` / `TAURI_DEV`），并将 `/api`、`/ws` 代理到 13001；否则浏览器调试页会误连独立 3001 服务，与原生窗口显示不同数据库结果。
- 顶部 VirtualBankrollBar 位于左右固定栏之间，响应式断点不能代表中央栏实际宽度；各资产指标必须 `shrink-0`，由外层 `overflow-hidden` 处理不足空间，禁止 flex 收缩造成标签与数值文字重叠。
- 实际 Tauri 数据库 `/Users/dutongxue/localdb/polyrader.db` 已在备份 `polyrader.db.backup-20260721-221554` 后完成 migration 031-035；四游戏源快照、analysis artifacts、规范事实与 paper policy 表已进入真实桌面运行库。
- 2026-07-21：实际 Tauri 数据库已继续完成 migration 036，`esports_fact_matches.adapter_version` 可供后续真实 run 审计；升级由 Server 启动前迁移流程执行成功。
- 2026-07-21：实际数据库中的 Doubao 密钥已通过 `PUT /api/ai/config/keys/doubao` 使用当前运行环境的 `ENCRYPTION_KEY` 重新加密；桌面端与手动 sidecar 必须共享同一加密键，遇到 `Unsupported state or unable to authenticate data` 时应判定为本地密文上下文不一致，而不是误报为 provider 401。
- 2026-07-21：Doubao 真实标准分析已到达供应商但返回 `InvalidSubscription`（CodingPlan 未开通或已过期）；这是外部账户订阅阻断，不是本地 401/405 或分析接口错误。MiniMax 密钥已用当前加密键重写，真实 LLM 验收改由 MiniMax 继续，报告中必须保留 Doubao 不可用原因。
- 2026-07-21：真实 CS2 + MiniMax 标准闭环通过，run `ar_cs2_2396006_local-hltv-2396006_20260721T145043Z_zkn1` 记录 `cs2.facts.v2` 且严格校验为 valid；模型基于排名、近 10 场和地图池给出 Spirit 0.82，对市场 0.7174 的 edge 为 0.1026。PaperDecisionEngine 因 0 美元流动性应用 `LOW_LIQUIDITY_STAKE_REDUCED`，创建 12.5 的 open `sim_bet`。个人指标与 H2H 仍作为真实缺失项保留。
- 本轮全量自动化验收：Core 340/340、Infra 135 通过且 13 个真实连接测试按配置跳过、Server 233/233、Web 52/52；四工作区 typecheck、production build 和 lint 均退出 0，lint 仅保留 `hltv-crawler.ts` 一条既有 unused `err` warning。
- 本轮基础验证：四工作区 TypeScript 检查通过，Core 337/337 测试通过，四游戏 bridge/facts 定向测试 3/3 通过。

### 强制约束

- fixture 只能由测试或明确标记的开发操作使用；任何生产 API、自动刷新、后台同步和 E2E 真实数据验收都不得隐式回退 fixture。
- 验证台的 `paper_ready / verified` 必须由真实来源、规范事实、真实或明确标识的本地练习盘口、可执行 LLM、确定性策略与可结算性共同决定；缺失任一阶段时必须显示阻断原因。
- 数据源返回 `skipped / partial / failed` 时必须保留原因和最后同步时间，不得将空数组等价为成功，也不得以合成 5000 美元流动性掩盖未对齐盘口。

### 紧接后续步骤

1. **P1-高** 为标准执行 API 补充 provider mock 集成测试与真实密钥 E2E，并将分析报告页运行入口迁移到该 API。
2. **P1-高** 将真实或明确标识的本地练习盘口接入 Validation Lab，统一 `sim_bets` 账本与 Performance 统计口径。
3. **P1-高** 补齐 Validation Lab 的真实同步、归一化、LLM、模拟决策阶段展示，并完成四游戏真实数据 release gate。
4. **P1-高** 运行全量自动化、真实数据/LLM 验证、Tauri E2E 和设计稿桌面/窄屏视觉对照。
5. **P1-高** 记录四游戏真实 release gate：CS2 必须完成报告与模拟决策闭环；Dota 2、LoL、Valorant 必须分别列出真实来源覆盖、缺失配置与不可发布原因，禁止用 fixture 补齐验收。
6. **P1-高** 增加 CS2 丰富事实与分析前自愈的回归测试，重新运行真实 HLTV + MiniMax 分析，确认报告不再错误声明缺少已落库的近期状态、排名和地图池。
7. **P1-高** 执行 migration 036、Infra/Server 全量回归和第二次真实 MiniMax 分析；验收 run 必须记录 `cs2.facts.v2` 且响应通过严格 JSON 校验。
8. **已完成并修正** Tauri 与 `localhost:5173` 已统一读取 13001；60 场、86% 完整度只有在 freshness 不超过活动策略上限时才允许 `paper_ready`，当前 38 小时旧事实必须显示 `needs_data`。

---

## 当前执行记录：真实闭环与 UI 最终验收

### 本轮验收结论

- 2026-07-21：Tauri 原生开发应用、Vite `localhost:5173` 与 sidecar 13001 已统一读取 `/Users/dutongxue/localdb/polyrader.db`，不再出现浏览器和原生窗口数据不一致。CS2 当前有 60 场、86% 完整度，但事实年龄 38.2 小时超过 60 分钟上限，正确状态为 `needs_data`。
- 四板块 UI 已逐项交互验证：CS2 曾完成真实事实、市场对齐、标准 MiniMax 分析、严格校验、报告和模拟订单的历史闭环，但当前新分析被 freshness gate 阻断；Dota 2 为 50 场、71% 完整度，但因缺少可对齐盘口、第二队 rating、patch、双方 roster 与 draft 保持 `needs_data`；LoL 与 Valorant 无可用比赛，保持 `needs_data`，不得进入模拟决策。
- 标准报告的 `报告 / Prompt / Response / Timeline` 四个标签已通过真实 run 验证；Prompt 与响应均展示冻结后的 `analysis.v1` JSON，Timeline 可追踪 provider、validator、decision 与 paper order。
- 真实 CS2 run `ar_cs2_2396006_local-hltv-2396006_20260721T145043Z_zkn1` 的报告、12.5 美元低流动性模拟订单、账本和 Performance 工作台已在桌面 UI 验证，无全局横向溢出或顶部资产栏文字重叠；该订单保留为 `paper.v1.0.0` 历史审计记录，不代表当前过期事实仍可新建订单。
- 设计稿对照结论：实际应用符合 Cursor 风格的黑白灰主色、低圆角、紧凑间距、明确状态色和单层工具面板；固定左右栏下的资产指标必须继续保持 `shrink-0`。浏览器插件的临时 390px viewport 覆盖未生效并始终返回 1280x720，因此本轮窄屏结论只沿用既有 390px 原型验收，不能把本次尝试记录为新的移动端运行时通过。
- migration 037 已将活动模拟策略升级为 `paper.v1.1.0`，新增可配置 `maximumFreshnessSeconds=3600`。验证台、标准 Prompt policy 与 `PaperDecisionEngine` 必须共享同一 freshness gate；过期或无限 freshness 分别阻断 Prompt ready 与模拟订单，决策 reason code 为 `INPUT_STALE`。
- 设置中的 Paper Policy 面板必须以分钟展示并持久化最大数据年龄；旧策略 JSON 由 repository 默认值和 migration 双重兼容，禁止因缺字段退回无 freshness gate 的行为。
- 最终全量回归通过：Core 342/342、Infra 135 通过且 13 skipped、Server 233/233、Web 52/52；四工作区 TypeScript、production build 和 lint 均退出 0。现有 lint warning 仅位于未改动的既有测试和 controller/crawler 文件。

### 后续步骤

1. **P1-高** 恢复合规的 CS2 新鲜数据刷新能力，使排名、近况和地图池在 60 分钟策略窗口内重新归一化；未刷新成功前 Validation Lab 必须保持 `needs_data`。
2. **P1-高** 接入可发布的 Dota 2 盘口与权威结算器，并补齐 patch、双方 roster、draft 和第二队 rating 后，再执行 Dota 2 的真实 LLM 与模拟订单验收。
3. **P1-高** 配置 GRID title ID / Riot schedule key，分别为 LoL 与 Valorant 生成首个真实规范比赛快照、市场映射和可结算样本；在此之前继续隐藏发布入口。
4. **P1-高** 为 CS2 增加 HLTV 403 时的合规备用个人数据源或缓存导入，补齐 player rating/ADR 与 H2H；缺失时继续降低 completeness，不得让模型自行补全。
5. **P2-中** 在支持可控 viewport 的 Tauri/Web E2E 环境补做 390px、768px 和 1440px 视觉回归，并将截图作为 CI artifact，覆盖验证台、报告、订单与绩效页。
6. **P2-中** 累积至少 10/30 个权威结算样本后启用 Wilson/Brier/ECE/CLV 排名和校准调参；当前 1 个 open 模拟单只能验证链路，不能代表策略胜率。

---

## 当前执行记录：P0 可回滚基线

### 已完成

- 2026-07-22：仓库产品文档收敛为 `docs/README.md` 索引的五份 canonical 文档；旧 `.trae/documents/*`、旧 CS2 计划、手工审计报告和生成型报告从 Git 跟踪中移除。历史记录可保留在本地忽略目录，但不得作为当前规范引用。
- canonical 文档已按真实实现同步：`analysis.v1` 严格审计链、Validation Lab、确定性 PaperDecisionEngine、统一账本和 Performance 核心指标已实现；四板块完整 release gate 仍为 0/4，不得写成已发布。
- 当前自动化基线为 Core 342、Infra 135 passed / 13 skipped、Server 233、Web 52；四 workspace typecheck 通过。后续测试数量可增长，但不得继续引用“5 个 Server 失败”的旧状态。
- Browser fixture E2E 基线为 Playwright 217 passed / 1 skipped / 0 failed；分析报告与 Validation Lab 的 dark/light/matrix 六张新增视觉基线已完成目视检查和快照回归。该结果只证明确定性浏览器链路，不得替代 integration、current real-source 或 Tauri release gate。
- P0 提交必须包含 migration 030-037、对应运行时、UI、测试与 canonical 文档，形成后续 P1 可回滚起点；`.env`、本地数据库、密钥和终端录屏等本机产物禁止进入提交。

### 强制边界

- 旧规划记录用于解释历史决策；当其完成度、测试数量或后续步骤与 `docs/README.md` 和当前 roadmap 冲突时，以最新 P0 记录和 canonical 文档为准。
- 完成某一板块的数据源连接、事实归一化或 UI 展示不等于通过发布。只有 source、facts、market、prompt、response、report、decision、settlement、statistics 全链路的 fixture 与真实源证据都通过，板块才可标记 verified。
- 当前历史 CS2 模拟单只证明审计链可用。事实超过 `paper.v1.1.0` 的一小时 freshness 上限时必须阻断新订单，禁止为演示改写时间或降低数据年龄。

### 后续步骤

1. **P1-高** CS2 当前闭环 — 恢复合规的新鲜事实刷新，新增 `cs2-paper-loop.spec.ts`，同时锁定 deterministic fixture 与 current real-source smoke 证据。
2. **P1-高** Dota 2 发布切片 — 补齐 patch、双方 rating/roster/draft、可对齐市场与权威 settler，完成首个非 CS2 的标准报告、模拟决策和结算统计。
3. **P1-高** LoL / Valorant 事实入口 — 配置受支持的 schedule 数据源，为每个板块生成首个规范未来比赛、稳定 snapshot hash、市场映射和明确的不可发布原因。
4. **P1-高** 风险与绩效收口 — 增加每日、分游戏、分 provider、盘口白名单和总敞口限制；补齐 closing price、CLV、log loss、Sharpe 及可筛选归因。
5. **P2-中** 四板块发布矩阵 — 完成 Playwright、Tauri、迁移重放与 390/768/1440 视觉回归，所有截图和生成报告仅作为 CI artifact。
