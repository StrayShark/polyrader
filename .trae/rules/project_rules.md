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

| 文档                                               | 用途                               |
| -------------------------------------------------- | ---------------------------------- |
| `README.md`                                        | 仓库入口与产品定位                 |
| `docs/README.md`                                   | 当前产品文档唯一入口与完成边界     |
| `docs/product/four-game-product-plan.md`           | 四游戏产品范围、流程、统计和非目标 |
| `docs/contracts/llm-analysis-contract.md`          | 标准 Prompt、响应、校验与审计契约  |
| `docs/design/four-game-llm-simbook-prototype.html` | 当前交互与视觉原型                 |
| `docs/roadmap/four-game-llm-simbook-roadmap.md`    | 研发阶段、依赖、测试矩阵与发布门槛 |
| `.trae/rules/project_rules.md`                     | 持久工程约束与变更后规划记录       |
| `CONTRIBUTING.md`                                  | 贡献规范和验证命令                 |

## 开发规范

### 命令

| 任务               | 命令                                     |
| ------------------ | ---------------------------------------- |
| 运行全部单元测试   | `npm run test`                           |
| 运行单个包测试     | `cd packages/<pkg> && npx vitest run`    |
| 运行 E2E 测试      | `cd packages/web && npx playwright test` |
| 类型检查           | `npm run typecheck`                      |
| Lint               | `npm run lint`                           |
| 构建前端           | `npm run build:web`                      |
| 构建 server bundle | `npm run build:server`                   |
| Tauri 开发模式     | `npm run tauri:dev`                      |
| Tauri 打包         | `npm run tauri:build`                    |

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
3. **P1-高** 可取消外部抓取 — 为 `fetchTextPolitely`、HLTV/GRID 客户端传递调用方 `AbortSignal`，让控制器超时能释放网络连接，同时限制手动刷新频率。
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
- Valorant：Liquipedia Valorant wiki 的公开赛程、近期赛果、队伍检索与动态阵容已接入；静态版本/角色/地图使用无需 key 的 Valorant API，Riot Developer API 默认政策禁用。
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

---

## 当前执行记录：Sprint 1～2（CS2 新鲜事实 + Dota 2 首个闭环）

### 已完成

- 2026-07-22：Sprint 1 已完成开发验收。CS2 fixture 改为相对当前时间生成，包含双方排名、近 10 场、地图池、完整阵容和个人指标；`cs2-paper-loop.spec.ts` 通过标准 Prompt、严格响应、确定性决策、`sim_bet`、结算和 Performance 闭环。
- 2026-07-22：当前 HLTV 冒烟已通过。事实候选按最新 `observedAt` 优先，同批未来比赛按最近开赛时间排序；SQLite `YYYY-MM-DD HH:mm:ss` 更新时间必须在 legacy CS2 快照边界按 UTC 解析，禁止再因本地时区产生虚假的 8 小时过期。
- 2026-07-22：Sprint 2 已完成开发验收。Dota 2 `match_winner` 已进入 market/settlement registry；OpenDota 单局结果与 GRID 系列状态均可权威结算，后台每 10 分钟扫描 Dota 2 open bets，手动 API 和 Validation Lab 均可触发只读赛果对齐。
- OpenDota 同步现读取近期比赛详情、双方 10 个 player slot、K/D/A、GPM/XPM、draft、当前补丁及本批比赛引用的历史补丁。缺失 `account_id` 的选手必须保留实际 slot 数据并使用 `<matchId>-slot-<slot>` 明确标识，不得丢弃或伪造账户身份。
- Dota 2 facts 已升级为 `dota2.facts.v2`，完整 fixture 包含 patch、双方 roster、team record、player stats 与 pre-match draft context；本地练习盘口固定为 0 流动性并触发 `LOW_LIQUIDITY_STAKE_REDUCED`，禁止合成成交量。
- `Dota2MatchReconciliationService` 只结算 registry 支持的 `match_winner`，重复调用不得重复结算订单或解析已 resolved 市场。当前真实 OpenDota 样本 UI 显示 10 名选手，权威结算反馈已验证为 `settled / opendota`。
- 新增确定性 Integration E2E：`cs2-paper-loop.spec.ts`、`dota2-paper-loop.spec.ts`；新增显式开关真实源冒烟：`cs2-real-source-smoke.spec.ts`、`dota2-real-source-smoke.spec.ts`。真实源测试必须使用 `POLYRADER_REAL_SOURCE_E2E=1`，默认 CI 不因外部网络波动失败。
- 最终回归基线：Core 343/343、Infra 136 passed / 13 skipped、Server 238/238、Web 52/52；四工作区 TypeScript 检查和 CS2/Dota 2 确定性 Integration E2E 2/2 通过，HLTV/OpenDota opt-in 真实源冒烟通过。

### 强制边界

- Sprint 开发完成不等于板块发布。CS2/Dota 2 fixture 与真实源 smoke 可以通过，但只要真实样本缺少完整事实、对齐盘口、可执行 provider 或完整 source-to-statistics 证据，release gate 仍保持未通过；当前总发布状态仍为 0/4。
- Dota 2 已结束比赛必须按 match payload 的 patch ID 匹配历史补丁；仅在未来比赛没有 patch ID 时才可使用当前补丁。禁止用当前版本覆盖历史比赛版本。
- 事实样本选择必须区分未来和已结束比赛：同一同步批次中，未来赛程取最近即将开赛，历史赛果取最近结束；任何旧快照不得仅因开赛时间更远而挤掉刚同步样本。
- OpenDota `/proMatches` 表示单局，默认格式为 BO1；GRID series 才按系列格式和比分结算。禁止把 OpenDota 单局结果误当 BO3 系列冠军。
- Validation Lab 的 Dota 2 权威结算按钮只对已结束样本显示；UI 必须展示 source、status、winner、settled bets 与 resolved markets，不得把 0 笔结算显示成失败。
- 非 production 环境显式提交 `fixture: true` 时必须强制使用确定性 fixture，即使同一数据库已存在真实源快照；production 必须继续拒绝 fixture，防止测试数据进入真实分析。

### 自动规划的后续步骤

1. **P1-高 / Sprint 3** 接入 LoL 与 Valorant 受支持的未来赛程、规范比赛、市场 identity 和权威 settlement adapter，各完成首个确定性 paper loop 与真实源 smoke。
2. **P1-高** 为真实 Dota 2 样本补齐稳定的双方 team rating 与可对齐盘口，运行真实 provider 标准分析；缺失时继续保持 `needs_data`。
3. **P1-高** 扩展 paper policy 的每日、分游戏、分 provider、分 market-kind 和总 open exposure 限制，并补 closing price / CLV。
4. **P2-中** 增加 GRID Dota 2 series 的 API 集成测试、服务重启/SQLite replay、Tauri smoke，以及 390/768/1440 Validation Lab 和报告视觉回归。
5. **P2-中** 累积至少 10/30 个权威结算样本后再启用策略排名与校准调参；在此之前 Wilson/Brier/ECE 必须继续显示样本不足。

---

## 当前执行记录：Sprint 3（LoL + Valorant 首个闭环）

### 已完成

- 2026-07-22：LoL 与 Valorant `match_winner` 已进入 settlement registry，权威来源限定为 GRID；`GridMatchReconciliationService` 只结算已完成系列的胜负盘口，后台每 10 分钟扫描 open bets，重复执行不得重复结算订单或解析本地盘口。
- GRID title ID 支持从 `titles` API 自动发现，`GRID_TITLE_ID_LOL / GRID_TITLE_ID_VALORANT` 仅作为覆盖项。未来赛程同步在 `POLYRADER_GRID_ROSTER_TEAM_LIMIT` 上限内补充近期阵容；阵容不可用不得破坏赛程同步。
- LoL 与 Valorant fixture 改为相对当前时间生成，事实版本升级为 `lol.facts.v2 / valorant.facts.v2`。Valorant 赛程未携带地图池时允许读取 Riot content maps；draft 与 agent/map veto 继续以显式 placeholder 表示。
- 四游戏 fixture API、标准 Prompt/响应、低流动性降额、`sim_bet`、手动结算和 Performance Integration E2E 4/4 通过；LoL/Valorant GRID 权威结算单测覆盖赢单、盘口解析、绩效归因和重复调用幂等。
- 该 Sprint 当时 GRID 对 LoL/Valorant 返回 0 场；此历史阻断已在 2026-07-23 被合规的 Liquipedia 公共赛程回退替代。Data Dragon 与 Valorant API 静态内容无需账户 key；发布门禁仍取决于完整事实、盘口和结算。
- 最终回归基线：Core 346/346、Infra 137 passed / 13 skipped、Server 247/247、Web 52/52；四工作区 TypeScript、production build 与 lint 均通过，lint 只保留既有 warning。

### 强制边界

- GRID 返回空数组必须记录 `No upcoming GRID <game> series are available for this account`，不得把 0 条记录包装成可发布状态；API 成功只代表请求成功，不代表赛事板块可用。
- LoL/Valorant 权威结算只能使用 normalized facts 中同 match ID 的 GRID match link 和 `finished=true` series state。未完赛、无链接、无规则或外部失败必须保持 pending/unavailable。
- 自动发现 title ID 不代表账号拥有对应赛事权限。发布验收仍必须取得当前未来赛程、完整事实、对齐盘口、真实 provider 报告与权威结算证据。
- 本地练习盘口继续固定为 0 流动性并触发 `LOW_LIQUIDITY_STAKE_REDUCED`；禁止为了让四板块显示 ready 而合成交易量、未来赛程或 Riot content。

### 自动规划的后续步骤

1. **P1-高 / Sprint 4** 扩展 paper policy：每日下注、分游戏、分 provider、分 market-kind 与总 open exposure 上限；订单创建必须在同一事务边界内执行限制检查。
2. **P1-高 / Sprint 4** 在开赛/关盘边界保存 closing price，结算后计算 CLV，并把缺失 closing price 明确显示为不可计算。
3. **P1-高** 基于已接入的公共 LoL/Valorant 未来系列补齐完整事实、对齐盘口和获准的权威结算源，各执行一次非 fixture 标准 LLM、模拟订单与绩效验收。
4. **P1-高** 为真实 Dota 2 补齐双方 rating 和对齐盘口，完成真实 provider 闭环；缺失时继续保持 `needs_data`。
5. **P2-中** 增加 GRID GraphQL contract fixture、服务重启/SQLite replay、Tauri smoke 与 390/768/1440 四板块视觉回归。

---

## 当前执行记录：Sprint 4（事务化模拟风控 + Closing Price / CLV）

### 已完成

- 2026-07-22：活动策略升级为 `paper.v1.2.0`，新增每日下注、总开放暴露、单游戏、单 provider 和单盘口类型开放暴露上限。`sim_bet` 创建、额度检查与账户暴露更新必须在同一个 SQLite 事务内完成；任一维度超限时整笔回滚。
- migration 038 为 `sim_bets` 增加 provider、closing odds/probability/source/time、CLV 与 `clv_status`，并为风控维度和待捕获 CLV 建立索引。目标环境必须先完成迁移再启用 Sprint 4 API。
- 自动分析触发风控拒绝时，`paper_decision` 必须变为 `rejected` 并记录明确的 `*_LIMIT` reason code；不得保留为已下注状态，也不得创建部分订单。
- closing price 在开赛/市场关闭边界由后台轮询捕获；若到结算仍缺失，则最后尝试读取未解析盘口并写入 CLV。显式 API 只用于测试或人工补录可审计的 closing source。
- 账本 `模拟盘` Tab 已展示策略额度、今日下注、总暴露及 game/provider/market-kind 分解；`绩效` Tab 展示 CLV、捕获样本和不可计算样本，并在归因表中统一使用标准 decimal-odds CLV：`entryOdds / closingOdds - 1`。
- Sprint 4 回归基线：Core 346/346、Infra 137 passed / 13 skipped、Server 255/255、Web 52/52；新增 Sprint D Server 8/8 和 API Integration E2E 1/1。桌面 1280×720 与移动 390×844 已实测风险面板和绩效页无页面级横向溢出。

### 强制边界

- 禁止使用已解析市场的 1/0 赛果价格计算 CLV。只有开赛或关盘前最后一个可靠价格可以作为 closing price；缺失时必须写 `unavailable`，不得使用 entry price、模型概率或赛果价格补造。
- 每日下注限额统计当日全部已创建订单，包括已经结算或 void 的订单；开放暴露限额只统计 open 仓位。两者不得混用。
- 历史订单缺少 provider 时保留 `unknown` 归因，禁止从模型、游戏或当前配置反向猜测历史 provider。
- `PaperRiskLimitError` 的 code 是 API、分析事件和 UI 解释层的稳定契约；修改名称时必须提供迁移或兼容映射。
- migration 038、风险状态 API、closing 捕获与 CLV 统计属于同一发布单元，禁止只部署 UI 或只迁移数据库。

### 自动规划的后续步骤

1. **P1-高 / Sprint 5** 从 canonical `sim_bets` 增加 log loss、收益波动率与 Sharpe，并为少于 10/30 个已结算样本保持排名隐藏和显式警告。
2. **P1-高 / Sprint 5** 为 Performance 增加 game、provider、market kind、policy version、prompt version 与日期范围筛选；筛选后的 KPI、权益曲线和归因表必须使用同一查询口径。
3. **P1-高 / Sprint 5** 增加 closing source 覆盖率、捕获延迟、重试次数和 unavailable 原因指标，按游戏/provider/盘口定位真实源缺口。
4. **P1-高** 基于公共 LoL/Valorant 赛程完成非 fixture 标准分析、模拟订单、closing、获准的权威结算和绩效证据；事实或市场缺失时继续保持 `needs_data`。
5. **P1-高** 为真实 Dota 2 补齐双方 rating 和对齐盘口，完成 real-provider 闭环；缺失时不得用本地练习盘口冒充发布证据。
6. **P2-中 / Sprint 6** 完成迁移重放、服务重启持久化、Tauri smoke、四板块 Playwright release gate，以及 390/768/1440 视觉矩阵，再评估 0/4 发布状态是否可提升。

---

## 当前执行记录：Sprint 5（绩效校准 + 统一筛选 + Closing 可观测性）

### 已完成

- 2026-07-22：Performance 从 canonical `sim_bets` 计算 Log Loss、单笔收益波动率与 Sharpe；Log Loss 对概率截断到 `[1e-15, 1-1e-15]` 后使用二元交叉熵，Sharpe 使用单笔 `pnl/stake` 的样本标准差与 `sqrt(n)` 缩放，不按时间年化。
- game、provider、market kind、policy version、prompt version 与 placed-date 筛选已进入同一 API 查询范围；KPI、筛选资产曲线、风险指标和五类归因表必须共享同一批订单，禁止在前端各自过滤造成口径漂移。
- migration 039 为 closing 捕获增加 boundary、延迟、attempt count、last attempt 和 unavailable reason。每次合格捕获均记录 attempt；成功记录 source/latency，失败只使用稳定 reason code，禁止把赛果价或 entry price 伪装为关盘价。
- Performance UI 已展示 Log Loss、Sharpe/波动率、closing 覆盖率、来源覆盖、平均延迟、平均尝试次数与不可计算原因；少于 10 个结算样本保持“不足”，少于 30 个保持“谨慎”，归因行继续显示低样本标签。
- 筛选后权益是“初始本金 + 筛选样本已结算 PnL”，必须明确标为“筛选权益/筛选资产曲线”，不得与账户顶部的全局当前权益混称。
- Sprint E Integration E2E 覆盖两个 CS2 模拟单、关盘捕获/缺失、输赢结算、公式、来源与原因、筛选和非法日期范围；浏览器实测 CS2 筛选由 8 条收窄为 2 条，1280px 与 390px 均无页面级横向溢出、控制台错误或 `Load failed`。
- Sprint 5 最终回归基线：Core 346/346、Infra 138 passed / 13 skipped、Server 255/255、Web 52/52；四工作区 typecheck、production build、lint 与 Sprint E Integration E2E 1/1 通过。Lint 仅保留既有 15 条 warning，无 error。
- Integration E2E 固定使用独立 `13101/15174` 端口，且每次 Playwright 进程创建独立 `/tmp/polyrader-e2e-integration-<pid>.db`；Vite 通过显式 proxy target 连接测试后端，本地和 CI 均禁止 `reuseExistingServer`。禁止复用固定测试库，否则累计模拟注单会触发策略限额并让 release-gate 回归产生假失败。

### 强制边界

- 日期筛选按 `placed_at` 的 UTC 自然日闭区间执行；若未来支持用户时区，必须在 API 契约中新增显式时区参数，禁止静默改口径。
- provider 优先读取订单持久化字段，其次读取关联 run，历史订单都缺失时保留 `user/unknown`；policy 与 prompt 缺失同理，不得用当前配置回填历史值。
- `closingCoverage.sources[].coverageRate` 的分母是当前筛选范围内所有合格已结算订单，不是仅成功捕获的订单；来源为 `UNKNOWN` 也必须保留，避免覆盖率被美化。
- 少于 10/30 的样本阈值只控制警告与排名资格，不得阻止显示基础统计；高 Sharpe、小 Log Loss 或高胜率在低样本下都不能作为策略质量结论。
- migration 039、repository 遥测、closing service、Performance API/UI 和测试属于同一发布单元。目标环境未迁移时不得只发布前端。
- Integration E2E 不得连接 3001 开发端口或 Tauri 13001 sidecar；任何会写订单、关注钱包或配置的数据用例必须只写隔离数据库。测试结束后应以开发库行数/测试前缀查询确认无泄漏。

### 自动规划的后续步骤

1. **P1-高 / Sprint 6** 用真实数据库副本重放 migration 038-039，完成服务停止/启动后的订单、closing 遥测、筛选指标持久化回归，并保留升级前后行数与关键字段校验；升级测试继续使用独立端口和数据库副本，不得占用 App 数据库。
2. **P1-高 / Sprint 6** 增加 Tauri smoke：App 启动、sidecar ready、进入“我的账本 > 绩效”、应用筛选、重启后指标一致；失败时输出 sidecar、API 与 DB 三层诊断。
3. **P1-高 / Sprint 6** 为 CS2、Dota 2、LoL、Valorant 各建立 fixture 与 current-real-source release gate，覆盖 source、facts、market、LLM、decision、settlement、statistics；任何阶段缺失都保持 0/4 未发布。
4. **P1-高 / Sprint 6** 在 CI 生成 390px、768px、1440px 的 Validation Lab、报告、模拟订单与 Performance 截图，覆盖 loading、empty、error、low-sample 和有数据状态，并做页面级溢出检查。
5. **P1-高** 为公共 LoL/Valorant/Dota 2 未来赛事补齐双方 rating/form 和对齐盘口；真实依赖缺失时继续显示 `needs_data`，不得使用 fixture 作为发布证据。
6. **P2-中** 增加 event tier、data-quality、confidence、edge band 归因和 segment-to-report/order drill-down；只有每个对比分组达到 10/30 权威结算样本后才考虑启用排名。

---

## 当前执行记录：Sprint 6（发布门禁 + 数据库/Tauri 重启 + CI 视觉证据）

### 已完成

- 2026-07-22：新增四板块九阶段发布门禁，固定阶段为 `source / facts / market / prompt / response / report / decision / settlement / statistics`。fixture 与 current source 必须分别取证；只有两者全部通过才返回 `verified`，仅 fixture 通过只能返回 `fixture_ready`。
- `GET /api/validation-lab/release-gates` 与单板块接口已接入 Validation Lab，页面显示已验证数量、fixture/current-source 状态和第一个阻断原因。真实 Tauri 数据实测为 0/4，不得因 API 或 fixture 测试通过改写为已发布。
- migration replay 单测从真实 migration 001-037 构造旧库，执行 038-039 后关闭、重开并再次幂等执行，验证订单、closing/CLV 遥测与迁移计数持久化。真实 App 数据库副本实测为 37→39→39、订单 1→1、12/12 新字段存在；正式 App 库启动前已备份并升级到 migration 039。
- `scripts/tauri-smoke.mjs` 以只读方式等待 13001 sidecar，并检查 health、账本、Performance 与四板块门禁。真实 Tauri 窗口已进入“我的账本 > 绩效”、应用 CS2 筛选并完整退出/重启；重启前后权益 10000、可用资金 9987.5、开放暴露 12.5、open 1、settled 0 均一致，未创建真实成交或新增模拟订单。
- 四板块 fixture release gate Integration E2E 2/2 通过；current-source HLTV/OpenDota/GRID smoke 与九阶段阻断审计 8/8 通过。current-source 测试允许外部权限或赛程缺失，但必须产生明确 blocker；测试通过不等于 board verified。
- Sprint F 视觉矩阵覆盖 Validation Lab、标准报告、模拟订单和 Performance 的 390/768/1440 有数据状态，以及 390px loading、empty、error、low-sample 状态，共 15/15 通过；每个场景校验页面级横向溢出、控件裁切和 `Load failed`。CI 在 Integration E2E 清理输出前上传 `sprint-f-visual-matrix`，保留 14 天。
- Browser E2E 最终基线为 232 passed / 1 environment-dependent skipped / 0 failed；三条视觉截图波动通过原生 WebSocket mock 与 `/api/health` mock 消除，63 条三主题视觉基线连续通过。统一账本 E2E 必须按 ledger、simulation、orders、performance、review 五个页签验收，旧 `/simulation` 路由固定落到 simulation 页签。
- 默认 real-backend Integration E2E 最终基线为 16 passed / 12 explicit skipped / 0 failed；每次运行必须使用独立临时 SQLite，避免累计下注触发当日策略限额。巨鲸跟单 UI 验收固定验证纸面模式和“不发送真实订单”，不得再以可切换实盘文案作为默认产品契约。
- 全量回归基线更新为 Core 346/346、Infra 139 passed / 13 skipped、Server 256/256、Web 52/52；四工作区 typecheck、production build、lint、Cargo check/test 与 `git diff --check` 通过。Lint 仅保留 15 条既有 warning，无 error。

### 强制边界

- 当前发布状态继续为 0/4。CS2 仍缺新鲜且完整的事实、权威结算和 captured CLV 统计；Dota 2 仍缺对齐真实盘口与 real-provider run；LoL/Valorant 仍缺当前账号可用的未来系列完整链。任何单阶段成功都不得提升发布状态。
- `statistics` 阶段必须同时存在已结算关联订单、`clv_status=captured`、Brier 样本和 CLV 样本；仅有胜率、PnL、settled 状态或使用赛果价替代 closing price 均不得通过。
- Tauri smoke 只允许读取账户、订单、绩效和门禁，不得调用创建订单或真实成交 API。Polymarket 公共接口超时后 health 可为 `degraded`，只要本地数据库回退可读就如实记录；不得把外部超时伪装成 healthy。
- current-source gate E2E 的验收目标是“完整通过或明确阻断”，不是强迫外部依赖成功。fixture、公共源返回 200、GRID title 自动发现和本地练习盘口均不能替代真实市场、provider、结算与统计证据。
- CI 视觉证据只证明布局和状态表达，不能替代 Tauri、真实源或数据库持久化验收。截图必须留在 Playwright/CI artifact，不得提交生成图片到仓库。
- 本地 debug App bundle 可用于 smoke；启用 updater artifact 的完整本地构建需要 `TAURI_SIGNING_PRIVATE_KEY`。CI/release 在无密钥时必须显式关闭 updater artifact，禁止吞掉签名错误后宣称发布包已签名。

### 自动规划的后续步骤

1. **P1-高 / Sprint 7** 完成 CS2 当前源发布切片：在一小时策略窗口内刷新完整排名、近况、地图池和个人数据，捕获可靠 closing，使用权威赛果结算，并验证 Brier/CLV/ROI/equity 更新后再提升门禁。
2. **P1-高 / Sprint 7** 为 Dota 2 接入可对齐真实盘口和稳定双方 rating，执行非 fixture provider 分析、模拟决策、closing、权威结算与统计；缺失任一阶段继续保持 `needs_data`。
3. **P1-高 / Sprint 7** 基于公共 LoL/Valorant 未来赛程补齐允许的数据和真实盘口，为两板块分别完成首个 current-source 九阶段闭环，不得用本地练习盘口冒充发布证据。
4. **P1-高 / Sprint 7** 增加 event tier、data-quality、confidence、edge band 归因与 segment-to-report/order drill-down，所有 KPI、曲线和明细继续复用 canonical `sim_bets` 查询范围。
5. **P2-中 / Sprint 7** 在 CI 发布机器可读 release-gate JSON、Tauri sidecar/API/DB 诊断与 macOS smoke 证据，并把本地/CI updater signing 路径规范化；失败 artifact 不得包含密钥、`.env` 或真实数据库。
6. **P2-中** 每个可比维度累积至少 10/30 个权威结算样本后再启用排名和校准调参；达到阈值前继续显示 Wilson 区间、覆盖率与低样本警告。
7. **P2-中 / Sprint 7** 将其余旧 Browser E2E 统一迁移到公共 health、feature、bankroll 与 WebSocket fixture，清除 Vite `ECONNREFUSED` 日志噪声；任何 fixture 收敛都必须保持 232/1 或更高基线并禁止掩盖真实 API 集成失败。

---

## 当前执行记录：Sprint 7（当前源审计 + 绩效归因 + 发布诊断）

### 已完成

- 2026-07-22：发布门禁的 current-source 证据必须同时匹配当前 Validation Lab 样本的 `externalMatchId` 与 `dataSnapshotHash`；`local-practice:` run 永远不能作为发布证据。结算、Brier、captured CLV 与 PnL 必须来自该 run 自己关联的 canonical `sim_bet`，禁止从同场其他订单或全局统计借证据。
- 新增 `POST /api/validation-lab/release-audits/:game` 与 `GET /api/validation-lab/release-report`。审计依次执行真实源同步、事实规范化、盘口对齐和可选 provider run；board 未达到 `paper_ready` 时必须返回 `skipped + 明确原因`，不得调用 LLM、创建练习盘口、补 closing 或伪造结算。
- Tauri 实测 CS2 审计导入 168 条 HLTV 记录，当前 board 达到 86% 完整度并处于一小时新鲜度窗口；指定 MiniMax 后成功持久化 schema-valid `analysis.v1` run，确定性策略因盘口未对齐返回 `rejected / MARKET_UNALIGNED`。当前门禁只剩 eligible linked bet 的权威 settlement 与 Brier/captured CLV/PnL statistics，发布状态继续为 0/4。
- 四板块真实审计实测：Dota 2 产生新鲜 80% normalized facts，但无可对齐真实盘口；LoL 当前 GRID 账号无未来系列；Valorant 同时缺未来系列链和支持的 Riot 内容权限。三者均保持 `needs_data`，provider 阶段未被误调用。
- Performance 新增 event tier、data quality、confidence band、edge band 四类归因；每行可展开关联 report/order。KPI、权益曲线、归因与 drill-down 必须共享 canonical `sim_bets` 筛选范围，10/30 权威结算阈值继续控制排名资格。
- CI/诊断新增机器可读 release report、数据库 migration 元数据、Tauri sidecar/API/DB smoke 和独立 Browser E2E 服务端口。失败 artifact 禁止包含 `.env`、API key、账户标识、请求 ID 或真实数据库内容。
- Bun standalone sidecar 使用 `bun:sqlite` 适配器并内嵌 migration 001-039；构建脚本会比较 migration 目录与 standalone manifest，遗漏 migration 时直接失败。新库启动、重启和旧库备份升级 smoke 均已验证。
- Tauri 开发前端固定使用 `http://127.0.0.1:15173`、`strictPort=true`。禁止继续使用会被其他 Vite 项目占用并静默跳到 5174 的 5173 配置；Computer Use 验收打包应用前必须重新生成 `.app`，不能把注册表中的旧 bundle 当作最新源码。
- 个人数据库中的旧 LLM 密文与 Tauri 首次安装主密钥不一致时，必须先备份数据库，再由用户重新保存 provider key 或执行可验证的原地重加密。底层 AES-GCM 错误必须转换为设置页可执行提示；审计错误必须脱敏账户号、请求 ID、Authorization 和外链。正式 completion 失败会把 provider 标为未连接，默认选择优先使用已连接 provider。
- Sprint 7 最终回归基线：Core 347/347、Infra 139 passed / 13 skipped、Server 261/261、Web 52/52；四工作区 typecheck、Web build、standalone sidecar build、Cargo check、lint 与 `git diff --check` 通过。Lint 为 0 error / 15 条既有 warning；全量 Browser 基线 234 passed / 1 environment-dependent skipped，默认 Integration 基线 17 passed / 12 explicit skipped，Sprint 7 专项 Browser 2/2 与机器诊断 Integration 1/1 复跑通过。

### 强制边界

- `GET /models` 或连通性成功不等于 completion 权限成功。provider 订阅、配额或模型权限失败必须阻断当前 run，并允许后续选择健康 provider；不得把失败响应写成有效 report。
- current-source audit 允许产生 schema-valid report 与确定性 paper decision，但只允许本地模拟订单。策略返回 `pass/rejected` 时不得为了完成 release gate 强制下注。
- 当比赛尚未结束、closing 未捕获或权威赛果不可用时，settlement/statistics 必须保持 waiting/blocked。0/4 是当前真实状态，不得用 fixture、历史 run 或结果价替代 closing 使其变绿。
- Tauri debug `.app` 只证明本地 bundle/sidecar/UI 链路。缺少 `TAURI_SIGNING_PRIVATE_KEY` 时 updater artifact 签名失败是预期发布阻断，不得在仓库、本地日志或文档中写入私钥。

### 自动规划的后续步骤

1. **P1-高 / Sprint 8** 跟踪下一场盘口身份、流动性与结算规则均对齐的 CS2 当前赛事；捕获 opening/closing，等待权威赛果后幂等结算，并验证该 linked bet 的 Brier、CLV、ROI、PnL 与权益更新。
2. **P1-高 / Sprint 8** 为 Dota 2 接入未来赛程、双方稳定 rating 与同一 canonical match 的真实盘口，再执行 provider → paper decision → closing → authoritative settlement；缺任一输入继续保持 `needs_data`。
3. **P1-高 / Sprint 8** 基于合规公共 LoL/Valorant 赛程完成首个非 fixture 九阶段闭环；需要授权的结果或遥测源未到位时保持阻断，不得开发隐藏 scraping fallback。
4. **P1-高 / Sprint 8** 增加 release-audit 历史、stage duration/provider failure 分类和脱敏诊断导出，便于比较每次 current snapshot；诊断包禁止包含密钥、账户标识和真实数据库副本。
5. **P2-中 / Sprint 8** 每个可比 segment 累积至少 10 个权威结算样本后才显示 provisional ranking，达到 30 后才允许据此调整启发式权重；低样本继续显示 Wilson 区间与覆盖率。
6. **P2-中 / Sprint 8** 在受保护 CI 配置 updater signing，验证签名、notarization、全新安装、旧库升级与重启恢复；本地 unsigned debug 结果继续单独标注。

---

## 当前执行记录：Sprint 8（审计历史 + 生命周期追踪 + 脱敏诊断）

### 已完成

- 2026-07-23：migration 040 新增持久化 `release_audit_runs`，current-source audit 每次保存 audit ID、当前样本、snapshot hash、四阶段耗时、provider 状态、稳定失败分类和完整 release result。Validation Lab 可查看历史并按 audit ID 复读，服务重启后不得丢失。
- current-source audit 现在按 source sync、fact normalization、market alignment、provider analysis 四段计时；provider 失败统一分类为 subscription、quota、rate_limit、timeout、not_configured、auth、schema、upstream 或 unknown，前端与导出均不得暴露原始请求标识、账户信息或外链。
- 新增 `release-diagnostics.v1` 脱敏诊断导出，只包含 release gate、audit history、migration/table 数量和环境能力布尔值；导出禁止包含 key、`.env`、Authorization、钱包地址、账户 ID、request ID、真实数据库内容或本机绝对路径。
- 新增板块生命周期只读视图，将当前 audit 与 linked run、paper decision、sim bet、closing、settlement 和 statistics 逐段关联。策略因 `MARKET_UNALIGNED` 拒绝时必须显示 `not_applicable` 并等待对齐盘口，不得为了形成订单而绕过确定性策略。
- 当前样本选择优先级已修复为：最近可下注未来赛程（允许 15 分钟延迟容差）、live、finished、过期 active 状态；SQLite upcoming 查询同时排除 finished 与超过容差的旧 scheduled 行，防止历史脏数据挤掉刚同步赛事。
- CS2 完整度不足时，audit 会主动执行既有 HLTV 详情富化，补齐双方排名、近期战绩、阵容、10 名选手和 7 张地图后重新规范化。真实 Tauri 审计 `ra-4181aa60-a4b4-48d0-b980-f39986c670eb` 持久化 156 条当前源记录，board 达到 100%，MiniMax M3 输出严格 `analysis.v1`：Nuclear TigeRES 53%、Echo 47%、置信度 62%；本地练习盘口不对齐且流动性为 0，策略正确拒绝，未创建订单或真实交易。
- Performance 门槛落实为 `<10` 隐藏排名、`10-29` 仅 provisional、`>=30` 才允许 calibration/tuning；当前个人库 0 个权威结算样本、1 个历史 open 模拟单，必须继续显示样本不足。
- migration replay 已覆盖 037 → 040 与 reopen 持久化；真实个人库升级前已生成校验一致备份 `polyrader.db.backup-sprint8-20260723-000044`，升级后 migration 为 040。390/768/1440 Validation Lab 实测无页面级横向溢出，阶段耗时、历史和生命周期不会挤压布局。
- Sprint 8 回归基线：Core 348/348、Infra 140 passed / 13 skipped、Server 270/270、Web 52/52；四工作区 typecheck、Web/sidecar production build、Cargo check 和 lint 通过。默认 Integration E2E 18 passed / 12 explicit skipped；全量 Browser 235 passed / 1 skipped。Browser mock 响应可能在点击后立即完成，涉及 `waitForResponse` 的用例必须先注册监听再执行 UI action，避免把测试竞态误报为产品失败。

### 强制边界

- “Sprint 8 工程完成”不等于四板块发布完成。当前 real-source release gate 仍为 0/4；盘口供给、获准的权威赛果源和签名凭据属于外部输入，禁止用 fixture、本地练习盘口、历史结果或伪造样本替代。
- audit 历史记录必须是 append-only 证据。允许新增更正后的 audit，不得覆盖旧失败结果以美化成功率；诊断导出只能引用脱敏摘要，不能嵌入原始 provider error body。
- 生命周期 API 只跟踪当前 audit 已关联的 run/order。`pass`、`rejected` 或无 linked bet 时 closing/settlement/statistics 必须为 `not_applicable` 或 blocked，不得从同场其他订单借用证据。
- 排名与调参门槛按可比 segment 的权威结算样本计算，不得用 open、void、fixture 或无 authoritative settlement 的订单凑数。10 个样本只能显示 provisional，30 个样本才是 tuning eligible。
- 本地 debug `.app` 必须继续标为 unsigned。签名、notarization、全新安装和升级验收只能在受保护 CI 注入凭据后执行，任何密钥不得进入仓库、artifact 或诊断包。

### 自动规划的后续步骤

1. **P1-高 / Sprint I 运营** 等待下一场 HLTV 事实可在 1 小时窗口内刷新、且 Polymarket match-winner 对齐且可执行流动性的 CS2 当前赛事；若策略创建模拟单，再自动捕获 closing、幂等结算并核对 linked bet 的 Brier、CLV、ROI、PnL 与权益，策略拒绝时继续保留拒绝证据。
2. **P1-高 / Sprint 9** 为已接入的 Dota 2 未来赛程补齐双方稳定 rating 和对齐盘口，完成首个非 fixture provider → decision → closing → settlement → statistics 闭环。
3. **P1-高 / Sprint L/V 运营** 等待 LoL/Valorant 未来系列双侧 roster 命中、Gamma 真实 match-winner（纸面单需流动性 ≥ $1000）且存在 GRID series link；Liquipedia-only 保持显式结算 blocker，不伪造结算。
4. **P2-中 / Sprint 9** 持续积累权威结算，达到每 segment 10 个后验收 provisional ranking，达到 30 个后再评估启发式权重调参；同步监控 closing coverage 和 settlement lag。
5. **P2-中 / Sprint 9** 在受保护 CI 提供 updater signing/notarization 凭据，完成签名校验、全新安装、037/039 旧库升级到 040、重启恢复和升级包安装测试；本地仅保留 unsigned smoke。

### Sprint I 工程完成记录（2026-07-23）

- 大厅 `GET /api/markets` 与 CS2 Rail 统一应用 15 分钟 prematch 容差：过期 scheduled 行下架，live 保留；`mapLegacyMatchStatus` 开赛后映射为 `live`。
- `Cs2MarketDiscoveryService` 在 Release Audit / Validation Lab `discoverMarkets` 路径下扫描公共 Polymarket，并在 Gamma 为空时回退本地非 practice 盘口，写入 `hltv:<matchId>`。
- Audit 在事实陈旧或未 `paper_ready` 时主动 `prepare` 刷新；HLTV Cloudflare 403 记为显式 blocker，不伪造结算。
- Opt-in Integration E2E：`packages/web/e2e-integration/sprint-i-cs2-current-source.spec.ts`（`POLYRADER_REAL_SOURCE_E2E=1`）已绿。
- 真实证据：audit `ra-1ed60569-…` 选中 Aurora vs FOKUS `2396000`（86%），`market_align` 已 passed（mixed real/synthetic）；lifecycle 因无 paper_bet 仍 `not_applicable`；唯一剩余 blocker 为 stale HLTV facts；release gate 仍 0/4。

### Sprint D5 启动记录（2026-07-23）

- Fixture authoritative loop 与 Integration paper-loop 验收 closing CLV、ROI、winRate、Brier、PnL、equity。
- Opt-in `sprint-d5-dota-current-source.spec.ts` 绿；live audit `ra-722280a6-…` 正确 blocked（completeness 50%、双方 roster/form/hero-pool 缺失）。

### Sprint L/V（LoL/Valorant L2–L5）工程完成记录（2026-07-23）

- 复用 migration 042 team-alias 契约到 `lol`/`valorant`；赛程驱动 Liquipedia/GRID roster enrich；`lol-quality.v1` / `valorant-quality.v1` 与 adapter identity 消费。
- Validation Lab / match detail 展示 `RiotGameDataQualityPanel`；`LolMarketDiscoveryService` / `ValorantMarketDiscoveryService` 接入 audit 与标准分析。
- `lol-analysis-eligibility.v1` / `valorant-analysis-eligibility.v1` 接入 board、API、paper gate；fixture GRID paper loop 保持绿。
- Opt-in：`sprint-l-lol-current-source.spec.ts` / `sprint-v-valorant-current-source.spec.ts`（`POLYRADER_REAL_SOURCE_E2E=1`）；不伪造 current-source 结算。

---

## 当前执行记录：Dota 2 Sprint 1（未来赛程 + 能力真值 + 跨源身份）

### 已完成

- 2026-07-23：数据源状态禁止继续把“有 key”写成“可用”。`EsportsSourceDescriptor.readiness` 固定区分 `key_configured`、`title_resolved`、`schedule_available`、`data_available`、`unconfigured` 与错误；设置页必须展示阶段和最近失败原因。
- Dota 2 未来赛程固定按 GRID 优先、Liquipedia 公共 Matches API 兜底、DB API v3 授权接口增强执行。公共 API 仅允许可识别、gzip、限速、缓存的合规请求，不得恢复隐藏页面抓取或指纹规避。
- OpenDota `/proMatches` 是历史赛果源。即使历史快照、队伍、选手和 patch 同步成功，只要没有真实未来 `scheduled` series，Dota 2 sync 必须为 `partial`，不得把 finished game 选成 prematch 分析对象。
- migration 041 新增 `esports_match_source_identities`，按 `game + source + external_id` 幂等保存 canonical series、provider-native game、parent series、双方 ID、时间和置信度。OpenDota 单局必须保留 `dota2:game:opendota:<matchId>`，不能与 GRID series ID 混为同一层级。
- `GET /api/esports/sources/:game/identities` 提供 canonical/parent identity 只读查询；设置页每个板块显示本地 identity 数量。目标环境发布服务端与 UI 时必须同步执行 migration 041。
- 专项验收已通过：四 workspace typecheck；GRID/Liquipedia/repository/migration 共 16 tests；source service 11 tests；Settings Browser E2E 5/5。真实 Tauri 验收必须重新构建 bundle 后执行，不能复用旧 `.app`。
- Validation Lab 中 finished、过期或非赛前样本必须显示“历史样本，仅供校验”并禁用“运行标准 LLM”；`POST /api/analysis/execute` 必须在选择/调用 provider 前执行同一赛前资格校验。UI 禁用不能替代服务端防线，历史 OpenDota 事实只允许用于覆盖率、身份和权威结算校验。
- 赛前资格回归基线新增 Server 2/2 与 Web 2/2：当前 scheduled 样本可执行，finished/过期样本在 provider 调用前被拒绝。每次调整样本选择、状态映射或 15 分钟容差时必须复跑这两组测试。
- 2026-07-23 最终桌面验收使用重新生成的 debug `.app`：Settings > System 显示 Dota 最近同步 261 条、赛事身份 50 条，GRID 为 `key_configured` 且明确提示账号无 Dota title，OpenDota 为 `data_available`，Liquipedia 赛程 key 未配置。Validation Lab 显示 80% 完整度、70 场历史比赛、finished 历史样本和 disabled 标准 LLM，未创建模拟订单或真实交易。
- Sprint D1 最终回归基线：Server 273/273、Web 54/54；Server/Web typecheck、生产 Web/sidecar/Tauri debug bundle、lint 与 `git diff --check` 通过。Lint 为 0 error，保留 15 条既有 warning；应用验收后保持运行供人工查看。

### 强制边界

- 当前环境的 GRID titles 响应不包含 Dota 2，且未配置 Liquipedia DB key；GRID 必须保持 `key_configured/error`。公共 Liquipedia 已提供真实未来赛程，因此不得再显示“未来赛程缺失”，也不得手填未经授权的 Title ID。
- team/time heuristic canonical ID 只用于跨源候选对齐，置信度低于 provider-native ID；后续发现同队同时间窗多系列时必须保留 collision/conflict，不得静默覆盖。
- Liquipedia DB key 属于授权凭据，只能通过本地环境或受保护 CI 注入；不得写入仓库、日志、诊断包或浏览器 fixture。
- Sprint D1 工程完成不代表 Dota 板块可发布。未取得未来 series、双方 roster/rating、对齐盘口、provider report、closing 和权威结算前，release gate 必须保持 blocked/needs_data。
- 历史样本按钮禁用后仍允许执行权威赛果 reconciliation；分析与结算是不同能力，禁止为了复盘历史比赛重新开启赛前 LLM 或创建模拟订单。

### 自动规划的后续步骤

1. **P1-高 / Dota Sprint 2** 对未来 series 的双方做 targeted enrichment：跨源 team alias、OpenDota 近期比赛、当前五人阵容、选手归属、双方 rating/form、patch 与 hero-pool；禁止全库无界抓取。
2. **P1-高 / Dota Sprint 2** 为 identity resolver 增加别名、时间容差、event disambiguation 和 collision tests；GRID/Liquipedia 同一 series 必须可聚合，OpenDota game 继续挂在 parent series 下。
3. **P1-高 / Dota Sprint 2** 在比赛详情增加 Dota 数据质量面板，按 HLTV 信息密度展示近期战绩、排名/评分、阵容与个人指标，并保持当前黑白灰 Cursor 风格；缺失字段必须显示来源与原因。
4. **P1-高 / Dota Sprint 2 验收** 重新构建并启动 Tauri App，验证 Settings readiness、Dota Validation Lab、身份计数、无未来赛程阻断；若取得授权数据，再验证至少一场真实未来 series 的双方完整度。
5. **P1-高 / Dota Sprint 3** 对齐 match winner、handicap、total 盘口和 canonical series；流动性低于 USD 1,000 固定显示警告并交给 paper policy 决策。
6. **P1-高 / Dota Sprint 4-5** 完成标准 LLM report、模拟盘决策、closing、权威结算与 Brier/CLV/ROI/PnL/equity 闭环；全程禁止真实成交。
7. **P2-中 / Dota Sprint 2** 将赛前资格判定收敛为 Core 共享契约并覆盖 provider 状态别名；在已有 UI/API 双重阻断保持绿灯后再删除重复实现。
8. **P1-高 / Dota Sprint 2 启动条件** 先复用已持久化的 50 条 identity 做 alias/collision resolver，再对解析成功的未来 series 执行有界队伍富化；若外部赛程权限仍缺失，完成 resolver、详情 UI 和 blocker 验收，但不得宣称真实未来赛程已完成。

---

## 当前执行记录：四板块公开数据接入（合规抓取层）

### 已完成

- 2026-07-23：移除 HLTV 链路中的 webdriver 隐藏、随机浏览器指纹、随机鼠标移动与 Cloudflare 绕过实现。HTML 获取统一使用可识别 `User-Agent`、按域固定限速、内存缓存、ETag/Last-Modified 条件请求和有界重试。
- 所有非 429 的 4xx 属于请求、身份、权限或方法错误，禁止重试或切换指纹规避；429 必须遵循 `Retry-After`，只有网络错误与 5xx 可按固定退避重试。
- Tauri sidecar 仅透传 `POLYRADER_CRAWLER_*` 配置，不保存密钥；定时抓取部署前必须把示例联系地址替换为真实维护者联系方式。

### 自动规划的后续步骤

1. **P1-高** 解析 Liquipedia `Liquipedia:Matches` 公共 API 渲染结果，为 CS2、LoL、Dota 2、Valorant 形成统一未来赛程快照；DB API 继续作为授权增强。
2. **P1-高** 接入 Valorant API 公共静态内容，Riot Developer API 在本模拟盘产品中仅保留政策受限说明，不作为默认同步链。
3. **P1-高** 为公开赛程补齐跨源身份、目标队伍阵容拉取、历史赛果与数据质量边界测试。
4. **P1-高** 使用真实网络逐板块验证 HTTP 状态、记录数、未来赛程数与失败原因，再重建 Tauri App 检查设置页状态。

### 公开赛程解析进展

- 2026-07-23：四个 Liquipedia wiki 的 `action=parse&page=Liquipedia:Matches` 均真实返回 200。解析器只读取官方渲染结果中的时间戳、双方页面身份、赛事、比赛页面 ID 与 BO 制式，过滤 completed/过期行；BO2 不得降格为 BO3。
- 公共 API 请求必须携带 gzip 接受能力；406 表示请求未满足压缩要求，不得误报为源不可用。解析结果缺比赛详情页时使用 `game + timestamp + team identities` 稳定组合 ID，并保留事件页作为来源链接。

### 自动规划更新

1. **当前** 将公共赛程接入四板块同步服务，并在公共 API 失败或为空时才尝试已授权 DB API。
2. **随后** 增加 Valorant 公共静态内容、Riot 政策限制状态和四板块统一未来赛程完整性判定。
3. **验收** 先运行 parser/source service 测试，再对四个真实 wiki 执行记录级 smoke，最后重建 Tauri。

### Valorant 静态源进展

- 2026-07-23：新增无需账户 key 的 Valorant API 静态内容客户端，只采集版本、可用角色和地图元数据，并使用同一限速/缓存边界。该源不提供职业赛事赛程、排名或权威赛果，禁止把静态内容成功等同于板块可分析。
- Riot Developer API 与本地模拟盘产品存在政策冲突风险，默认同步链不得调用；后续 UI 必须标记为政策受限，仅在获得明确书面许可后重新评估。

### 自动规划更新

1. 将 `valorant-api` 内容快照与 Liquipedia 未来赛程合并，只有后者存在才允许 Valorant 同步为 success。
2. 对 Liquipedia 未来比赛前 N 支队伍执行有界 roster enrichment，单队失败不丢失赛程。
3. 更新数据源面板的来源能力和限制文案，再执行真实四板块同步。

### 同步主链进展

- 2026-07-23：LoL、Dota 2、Valorant 在 GRID 无未来系列时统一尝试 Liquipedia 公共赛程；公共源失败或为空且配置 DB key 时才使用授权 DB API。CS2 保留本地 HLTV 快照主链。
- 公共赛程会对最早出现的至多 4 支队伍做有界 roster enrichment；单队 roster 失败不得丢弃已验证赛程。同步 `success` 现在对四板块统一要求至少一条未过期 scheduled/live 比赛，patch、角色、地图或历史赛果不能单独满足。
- Valorant 默认写入 `valorant-api` 静态内容快照；Riot API 同步结果明确为 policy-restricted skipped，设置页保留限制说明。

### 自动规划更新

1. 修复并扩展 source service 测试，覆盖公共源优先、DB 回退、空赛程 partial、roster 局部失败和四板块 future gate。
2. 对四个 Liquipedia wiki、Data Dragon、OpenDota、Valorant API 和现有 CS2 本地源执行真实同步。
3. 根据真实结果修正解析边界与 UI 状态，然后完成 Tauri 重建验收。

### 失败边界

- 2026-07-23：测试必须覆盖 LoL、Dota 2、Valorant 在只有 patch/静态内容/历史赛果时保持 `partial`；公共赛程失败且无 DB 授权时保留原始 HTTP 分类；单队 roster 拉取失败时仅降低队伍事实覆盖，不删除有效赛程。

### 自动规划更新

1. 运行新增失败边界和全量数据源测试。
2. 执行四板块真实同步并记录每个 source 的 HTTP/records/future match/roster 数量。
3. 若真实解析稳定，更新过时 README/roadmap 和设置页状态后重建 App。

### 近期赛果与阵容覆盖

- 2026-07-23：Liquipedia 同一公开 Matches 响应同时解析 upcoming 与 completed；finished 快照必须保存双方比分和原始比赛/赛事链接，不能作为未来赛程资格。缓存保证两次逻辑读取只产生一次网络请求。
- 阵容富化目标为 4 份有选手的有效 roster，默认最多尝试未来赛程中的 15 支队伍；空页面/红链不计入目标，达到目标后立即停止，避免无界抓取。Dota 2 的真实前 10 支候选仅 3 支可解析，因此 15 是经真实覆盖验证后的上限，不得继续无界扩大。

### 自动规划更新

1. 回归 parser/source service，确认 recent 不影响 future gate 和记录幂等。
2. 重跑四板块真实同步，重点核对 Dota 2 roster 覆盖是否从 2 提升到 4。
3. 更新文档的旧“Liquipedia 仅 roster/需 DB 赛程”描述，随后重建 Tauri。

### 最终真实源与 Tauri 验收

- 2026-07-23：重新构建 debug `PolyRader.app` 和 standalone sidecar 后，个人数据库通过 App sidecar 完成四板块真实同步。设置页实测显示 CS2 `172 records / 76 identities`、LoL `100 / 95`、Dota 2 `345 / 130`、Valorant `100 / 95`。
- 个人库记录级核对：CS2 78 场未来赛、33 份带选手阵容；LoL 45 场未来赛、50 场近期赛果、4 份有效阵容；Dota 2 30 场未来赛、至少 50 场 Liquipedia 近期赛果并合并 OpenDota 历史、4 份有效阵容；Valorant 45 场未来赛、50 场近期赛果、4 份有效阵容。
- Dota 2 总同步保持 `partial`，唯一原因是配置的 GRID 账号没有 Dota title；Liquipedia 与 OpenDota 子源均成功。HLTV 详情端点在当前网络真实返回 403，合规客户端不重试权限错误、不切换指纹，继续使用已持久化 CS2 快照并在后台任务记录降级。
- 桌面 UI 验收确认 LoL/Dota 2/Valorant Liquipedia 均显示 `schedule_available`，Valorant API 显示 `data_available`，Riot Developer API 显示政策受限且未调用。App 保持运行供人工检查。
- 最终回归基线：Core 348/348、Infra 151 passed / 13 skipped、Server 278/278、Web 54/54；四工作区 typecheck、lint、Web build、standalone sidecar build、Tauri debug app build 与 `git diff --check` 通过。
- Tauri sidecar smoke 通过：个人库 64 张表、41 个 migration，latest 为 `041_esports_match_source_identities.sql`；四板块 release board API 均可读。整体 health 为 `degraded` 仅因 Polymarket Gamma 探针失败，数据库、WebSocket、缓存、GRID、CLOB 和 Polygon 均正常。

### 强制边界

- 本次完成的是四板块数据获取、持久化和桌面可见性，不等于四板块分析/模拟盘发布门禁完成。排名、form、英雄/地图池、盘口对齐、provider report、closing 与获准的权威结算仍按每场完整度独立阻断。
- Liquipedia 公共渲染结构可能变化；解析器必须保留真实响应 smoke 与 fixture 单测。出现 406 时先检查 gzip，401/403/405 不得通过浏览器伪装规避，429 必须遵循 `Retry-After`。
- Riot Developer API 不能因为存在 key 就恢复默认调用；产品政策没有获得明确书面许可前，只保留设置页说明。Valorant API 只用于静态内容，不能充当赛事赛程或权威赛果。

### 自动规划的后续步骤

1. **P1-高** 把近期赛果和目标阵容接入 LoL/Dota 2/Valorant 的 normalized facts，补齐双方 ranking/rating、form、位置与英雄/地图专属指标；字段缺失必须带 source/age/reason。
2. **P1-高** 为公共 Liquipedia 响应增加定时真实源 smoke、结构漂移告警和 last-known-good 快照回退，禁止在解析为空时覆盖仍新鲜的有效数据。
3. **P1-高** 将未来赛事与 Polymarket 多盘口做 canonical alignment；match winner、handicap、total 分开评估，流动性低于 USD 1,000 固定警告并只允许模拟盘。
4. **P1-高** 每板块选择一场事实完整、盘口对齐的当前赛事执行标准 LLM → deterministic paper policy；没有获准赛果与 closing 前不结算、不计 Brier/CLV/PnL。
5. **P2-中** 将服务端英文 source note 本地化为稳定 reason code，由前端中英文翻译，避免中文设置页出现英文限制说明。

---

## 当前执行记录：Dota 2 Sprint 2（未来赛事定向富化）

### 已完成

- 2026-07-23：新增 Core 级 Dota team/series identity resolver。队伍按 source ID、规范化名称、tag/alias 和受限相似度解析；系列赛按无序双方、45 分钟时间容差和 event 相似度消歧。最高候选差距不超过 0.025 时固定返回 `ambiguous`，不得静默选择。
- Dota 同步改为赛程驱动的有界 OpenDota 富化：单次最多读取 100 场职业赛、200 支队伍、500 名职业选手；只为解析成功的未来赛程队伍选择近期详情，默认总计 8 场、每队 3 场，硬上限分别为 12 和 5。
- OpenDota team 快照固定聚合 rating、总胜负、最近 10 场 form、当前五人归属、近期详情中的个人 K/D/A/GPM/XPM 均值和 hero pool。详细比赛选手不得继续按 account ID 覆盖历史；聚合结果归属 team 快照。
- `dota2.facts.v3` 同时读取 Liquipedia team payload 阵容和 OpenDota 独立 player/team 快照。未来赛程 participant ID 优先使用已解析 OpenDota ID；rating、form、roster、player metrics、hero pool 和 patch 必须各自保留真实 source/observedAt。
- 新增 `dota-quality.v1` 标准事实，双方固定使用同一套 identity、rating、recent form、roster、player metrics、hero pool 门槛；每个字段输出 `available/missing/stale/conflict`、source、ageSeconds 与稳定 reason code。该事实进入不可变 analysis facts，不另建仅供 UI 使用的旁路模型。
- Validation Lab 与比赛详情复用 `DotaDataQualityPanel`，按双队对照展示完整度、新鲜度、来源、原因、近期赛果、五人指标和英雄池。`/esports/matches/:id` 在传统 CS2 表无记录时允许从持久化 normalized facts 构造只读比赛概要。
- 环境参数新增 `POLYRADER_OPENDOTA_MATCHES_PER_TEAM`；`POLYRADER_OPENDOTA_DETAIL_LIMIT` 默认从 3 调整为 8。两者只控制有界公共数据富化，不允许扩展为全库无界抓取。

### 强制边界

- 同步成功不等于双方事实完整。任何队伍 alias 未命中、候选冲突、阵容少于 5 人、rating/form/player metrics/hero pool 缺失或来源超过 6 小时时，`dota-quality.v1` 必须显式降级并进入分析输入。
- Liquipedia 阵容与 OpenDota 当前归属重叠少于 3 人时必须标记 `roster_mismatch`；不得为了达到完整度删除冲突来源。队名模糊相似度只允许生成候选，不能覆盖 source-native ID。
- OpenDota `/proMatches` 和 `/matches/:id` 是历史事实与赛果详情，不是未来赛程源；未来 series 资格仍必须来自 GRID 或 Liquipedia。详细样本不得被伪装成未来比赛。
- 比赛详情的 normalized-facts fallback 只提供只读展示和模拟分析输入，不开放真实交易 API。Dota Sprint 2 完成不代表盘口、closing 或权威结算发布门禁通过。

### 自动规划的后续步骤

1. **当前验收** 用个人数据库执行一次真实 Dota 同步和 normalize，记录未来赛事中 alias matched/ambiguous/unmatched 数、双方 rating/roster/form/hero-pool 覆盖率，并在重新构建的 Tauri App 检查质量面板。
2. **P1-高 / Dota Sprint 3** 将 canonical series 与 match winner、handicap、total 分别对齐；盘口低于 USD 1,000 固定显示低流动性警告，只允许模拟盘策略评估。
3. **P1-高 / Dota Sprint 3** 为无对齐 Polymarket 盘口的合格未来赛事保留本地练习盘，但 release audit 必须把本地盘和真实当前源证据分开，不得用本地流动性通过发布门禁。
4. **P2-中** 把 Dota quality reason code 纳入中英文映射，UI 显示本地化说明，诊断与 LLM 仍保留稳定英文代码。
5. **P2-中** 将赛前资格判定收敛为 Core 共享契约并覆盖 `not_started/prematch` 等 provider 状态别名；保持 UI/API 双重阻断回归后再移除重复实现。

### Dota 2 Sprint 2 最终真实源验收

- 2026-07-23：OpenDota 单次 `/teams` 响应的 1,000 支队伍全部进入身份候选，但数据库仍只持久化前 200 支排名队伍与未来赛程实际命中的目标队伍。不得为了提高匹配率增加无界 team-list 请求。
- 已匹配目标队伍固定串行调用 `/teams/:id/players`、`/teams/:id/matches` 与有界 `/matches/:id`，默认最多 8 支目标队伍、每队 10 场历史、每队 3 份详情、全局 8 份详情。每支目标队伍必须保存 `selected/rosterFetched/matchesFetched/detailSampleSize/errors`，接口失败不得被解释为零数据。
- 最终 Tauri App sidecar 真实同步写入 918 条 Dota 快照，其中 Liquipedia 84、OpenDota 834；未来赛事 30 场。60 个队伍侧中 10 个 matched、5 个 ambiguous、45 个 unmatched，较扩大候选前的 5/2/53 有明确改善。
- Zero Tenacity、Nemiga、Level UP、PuckChamp 均完成目标级近期赛请求；可用目标取得 10 场近期比赛，详情成功时生成 5 人个人指标与 9-12 个英雄池条目。OpenDota 当前成员仅返回 0-3 人，Nemiga 合并跨源后为 4 人，因此所有少于 5 人的阵容必须保持 `ROSTER_INCOMPLETE`。
- 当前最佳未来样本 PuckChamp vs Team Spirit Academy 完整度为 75%，仍缺双方完整阵容以及 Team Spirit Academy 的个人指标和英雄池。Dandelions vs Zero Tenacity 样本为 62.5%，UI 已实际显示 identity/rating/form/roster/player metrics/hero pool 的来源、年龄和 reason code。
- 质量面板只有在字段状态真实为 `stale` 时才显示“来源过期”；只有 `missing` 不得误标过期。当前没有一场双方事实完整的未来赛事，禁止执行 LLM 模拟单、closing 或结算。
- Dota 总同步 `partial` 的唯一板块级失败为 GRID 账户无 Dota title；Liquipedia 与 OpenDota 子源均成功。该外部授权问题不得通过伪造 title ID 或把 OpenDota 历史比赛当未来赛程来绕过。

### 自动规划的后续步骤

1. **P1-高 / Dota Sprint 3** 建立可审计的跨源 team alias registry，优先处理 45 个 unmatched 与 5 个 ambiguous 未来队伍侧；人工映射必须保存来源、确认时间和冲突记录。
2. **P1-高 / Dota Sprint 3** 用 Liquipedia 当前阵容补充 OpenDota current-member 缺口，并按 player identity 合并；任何来源冲突仍输出 `roster_mismatch`，禁止用历史成员凑五人。
3. **P1-高 / Dota Sprint 3** 将 canonical series 与 match winner、handicap、total 分别对齐；真实流动性低于 USD 1,000 固定警告，本地练习盘不得冒充真实盘口证据。
4. **P1-高 / Dota Sprint 4** 只有双方 identity/rating/form/roster/player metrics/hero pool 全部满足门槛且盘口已对齐时，才执行标准化 prompt/response 与 deterministic paper decision；仍禁止真实成交。
5. **P2-中** 在验证台增加候选匹配审阅与 target enrichment error 明细，使身份阻断和外部 API 阻断可在 UI 内直接区分。

## Dota 2 Sprint 3 完成规范（2026-07-23）

### 已完成能力

- 新增 `042_esports_team_aliases.sql` 与 `EsportsTeamAlias` 审计契约。队伍别名固定保存 source/source team ID、规范化名称、目标源、候选 IDs、method、confidence、evidence、observedAt 与 confirmedAt；自动同步不得覆盖 `confirmed` 人工结论。
- Dota 赛程同步会把 matched/ambiguous/unmatched 结果分别持久化为 candidate/conflict/unmatched。只有验证台人工审阅 API 可以写入 `manual_review` 与 confirmedAt；模糊匹配禁止自动确认。
- Liquipedia 当前阵容优先、OpenDota current-member 与当前 team affiliation 仅补缺，按稳定 player ID 后按规范化昵称合并。inactive/coach/former/left 不得进入五人首发；两份至少三人的阵容重叠少于三人时继续输出 `roster_mismatch`。
- Dota canonical series 已分别支持 `dota2.match_winner.v1`、`dota2.handicap.v1` 与 `dota2.total_maps.v1`。真实盘口流动性低于 USD 1,000 固定输出 `low_liquidity`；本地盘固定标记 `synthetic`，market stage 只能 warning，不能通过真实当前源发布审计。
- BO3/BO5 Dota 合格赛程会生成独立的胜负、让分和总局数练习盘口；三个 condition ID、问题、outcome 与结算规则互不混用。BO1 只保留胜负盘。
- Validation Lab 增加 Dota identity/market evidence 面板，可查看每个盘口规则、流动性、证据类型和 alias 候选/冲突/未匹配，并可人工确认或拒绝已有候选。Dota 质量面板同时显示 target enrichment 的 roster/matches/details/errors。
- Tauri sidecar 启动固定优先使用 App 内置二进制；debug `.app` 不再依赖 GUI 环境的 `npx`，release/debug 均兼容 Tauri `_up_/packages/server/dist` 资源路径。

### 最终真实源验收

- 个人数据库迁移数为 42，最新迁移为 `042_esports_team_aliases.sql`。真实 Dota 同步 HTTP 200，写入 918 条记录：Liquipedia 84、OpenDota 834；GRID 未配置 Dota title 时保持 skipped，不伪造授权。
- alias registry 按 source team ID + normalized alias 去重后共有 20 条唯一记录：candidate 4、conflict 2、unmatched 14。赛程中的重复队伍侧不得膨胀为重复人工任务。
- 当前 Zero Tenacity vs Dandelions BO3 样本完整度 62.5%，生成 match winner/handicap/total maps 三个 synthetic 盘口。Zero Tenacity target enrichment 为 roster 3、matches 10、details 3、errors 0；跨当前来源合并后显示 4/5，Dandelions 为 1/5。
- 当前样本仍缺 team_rating_a、双方完整 roster、Dandelions recent form/player metrics/hero pool，board 保持 `needs_data`，Paper Decision 保持 waiting。Sprint 3 完成不允许绕过 Sprint 4 数据门槛。
- 全量回归：Core 354、Infra 157（13 skipped）、Server 281、Web 56 全部通过；typecheck/build 通过，lint 0 error。macOS Tauri App 独立启动无 `Load failed`，smoke 通过并显示 sidecar 13001、65 tables、migration 42。

### 自动规划的后续步骤

1. **P1-高 / Dota Sprint 4A** 在 alias 审阅 UI 展示全部 candidate IDs、目标队伍名称与来源链接，先人工处理 2 个 conflict 和高频 unmatched；确认后重跑同步，记录命中率和事实完整度增量。
2. **P1-高 / Dota Sprint 4A** 扩展 Liquipedia 当前 roster 定向补全队列，只针对当前未来赛程且遵守现有限速；双方 roster 都达到 5 人且无 `roster_mismatch` 前，禁止执行 LLM。
3. **P1-高 / Dota Sprint 4B** 将真实盘口发现与 canonical series 对齐接入当前源审计；没有真实盘口时只允许 synthetic practice 分析，低于 USD 1,000 时强制 observe-only。
4. **P1-高 / Dota Sprint 4B** 仅在 identity/rating/form/roster/player metrics/hero pool、freshness 和盘口门槛全部通过时，执行标准化 prompt/response/report 与 deterministic paper decision；继续禁止任何真实成交 API。
5. **P2-中** 本地化 Dota quality 与 alias reason code，并为 Sprint 3 证据面板补桌面/最小窗口响应式截图回归；保留稳定英文代码供诊断和 LLM 使用。

## Dota 2 Sprint 4 完成规范（2026-07-23）

### 已完成能力

- Dota 赛前资格固定由 Core `dota2-analysis-eligibility` 单一契约判定，Board、Validation Lab、标准分析 API、provider 调用边界和 paper policy 必须复用同一结果。资格模式只允许 `real_market`、`synthetic_practice`、`observe_only`、`blocked`；UI 禁用不能替代服务端阻断。
- 资格检查必须覆盖 prematch 状态、完整度、新鲜度、双方 identity/rating/form/五人 roster/player metrics/hero pool、patch、跨源冲突、所选盘口支持和流动性。失败必须同时保留可读摘要和稳定 reason codes，且在调用 LLM 前返回结构化 409。
- 公共 Polymarket Gamma 盘口发现不需要用户账户 key。match winner、handicap、total maps 按 canonical team/time identity 独立分类、解析 line/outcomes 并只读持久化；未知或不完整盘口固定为 `MARKET_NOT_ALIGNED`。
- 真实盘口低于 USD 1,000 允许查看和分析，但固定为 `observe_only`，禁止生成模拟订单。本地练习盘口固定为 `synthetic`，允许 `SYNTHETIC_PRACTICE` 半额练习单，但不能通过 current-source release gate。
- `analysis.v1` prompt、`analysis-response.v1` response 和标准报告必须携带 market kind、line、outcomes、evidence type、liquidity status/USD 与 Dota 质量证据。回调重复进入时复用已有 report/decision/order，禁止重复创建模拟单。
- alias 自动同步不得覆盖任何 `manual_review` 结果，包括 confirmed 和 rejected；候选 IDs、人工理由、来源链接和 observedAt 一并保护。新的人工审核仍可纠正旧人工结果。
- Validation Lab 可选择三个 Dota 盘口、查看资格模式/阻断代码/流动性/候选目标名称和来源链接，并提供独立“运行 Dota 练习闭环”入口。真实样本不合格时“运行标准 LLM”必须禁用，练习入口不得伪装成真实分析。

### 最终桌面与数据验收

- 2026-07-23 重新构建并启动 debug `PolyRader.app`。Validation Lab 显示 Mentality Monsters vs NEXA 当前样本完整度 37.5%，双方 identity/rating/form/roster/player metrics/hero pool 缺失且快照过期；标准 LLM 在 provider 调用前被 14 个稳定 reason codes 阻断，没有创建真实样本模拟单。
- 在 App 内执行 Dota 练习闭环生成 run `ar_dota2_8906069414_match-winner_20260723T073349Z_87gw2w`、report `rp-436b127d-cb61-45c0-9dfa-43f01e695b92` 和 open bet `sbet-f11b4fc9-9955-41ec-aa00-78a10f2b6292`。模型概率 62%、市场概率 52%、置信度 72%、模拟金额 USD 12.50，reason 为 `SYNTHETIC_PRACTICE`。
- run 元数据固定为 `dota2.fixture.v1` + `market.v1`，prompt schema 和 response schema 均有效，报告显示 synthetic/zero-liquidity 上下文。Tauri smoke 显示个人库 65 张表、42 个 migration、14 个 open 模拟单、USD 312.50 open exposure；权益仍为 USD 10,000，未伪造结算收益。
- Pandawa Lima 的 OpenDota 候选实际为 Panda Gaming，Team Spirit Academy 的候选实际为 senior Team Spirit；两条均通过审核 API 标记 rejected，保留候选 ID、公开链接与原因。当前 alias conflict 为 0，仓储回归覆盖自动同步不回退人工拒绝。
- 全量回归通过：Core 359/359、Infra 159 passed + 13 skipped、Server 288/288、Web 57/57；Dota Integration E2E、Tauri build、sidecar smoke 和 `git diff --check` 均通过。跳过项仅为需外部配置的连接测试。

### 强制边界

- Sprint 4 完成表示资格、分析、报告和模拟决策的工程闭环可重复，不表示真实 Dota 板块发布。当前 real-source gate 仍为 blocked，fixture 或 synthetic practice 不得计入真实完成率、Brier、CLV、ROI、PnL 或胜率。
- 当前样本缺失由真实源覆盖不足造成。禁止用历史成员、队伍声誉、模型猜测或伪造 rating/roster/hero pool 补齐；外部 Gamma、GRID、OpenDota 或 Liquipedia 不可用时必须保留 failure 分类。
- Sprint 5 前不得为 Dota open 模拟单生成伪 closing 或赛果。只有 canonical series、selected market、权威 OpenDota/GRID result 和订单归属全部一致时才允许幂等结算。
- 产品继续不提供任何真实成交 API；Polymarket 账户 key 不能成为公开盘口发现和练习闭环的前置条件。

### 自动规划的后续步骤

1. **P1-高 / Dota Sprint 5A** 定时追踪下一场仍处于 prematch 的公共未来 series，只对当前参赛队执行有界 rating、近况、五人阵容、个人指标和英雄池补全；通过共享资格契约前不调用 provider。
2. **P1-高 / Dota Sprint 5A** 为真实 Gamma 多盘口保存 open/closing 时间序列和捕获状态；低于 USD 1,000 继续 observe-only，盘口关闭、过期或身份漂移时记录稳定不可用原因。
3. **P1-高 / Dota Sprint 5B** 将 OpenDota/获授权 GRID 的 canonical series 结果与 match winner、handicap、total maps 分别对齐，按 linked bet 幂等结算并更新 Brier、CLV、ROI、PnL、胜率和权益曲线。
4. **P1-高 / Dota Sprint 5B** 增加 current-source Dota 九阶段 E2E：允许“合格后下模拟单”或“资格/策略拒绝”两种有效结果，但禁止 fixture、synthetic market 或其他比赛订单替代当前样本证据。
5. **P2-中** 本地化 Dota eligibility/market reason codes，补充桌面和最小窗口的多盘口、低流动性、blocked/practice/report 视觉回归；诊断与 LLM 输入继续使用稳定英文代码。
6. **P2-中** 持续积累权威结算样本；同一可比 segment 满 10 条后才显示 provisional，满 30 条后才允许基于 Brier/CLV/收益表现调整策略权重。

## UI 去重与界面职责规范（2026-07-23）

### 单一信息归属

- “模拟/练习”是产品边界，不是需要在顶部栏、资产栏、侧栏、页面标题和操作面板同时重复的状态。主界面不得再次展示 `Practice Mode`、`练习账户`、`SQLite 已同步` 等无操作价值的全局标签；只在提交订单、账户只读、跟单延迟等真实边界附近保留一次具体说明。
- 全局资产栏只负责跨页面资金摘要；进入“我的账本”后必须隐藏，因为该页面已提供完整资金、订单和绩效信息。未结算订单的 PnL 显示 `—`，不得用绿色 `+$0.00` 暗示已实现收益。
- 右侧投注单只属于赛事大厅与比赛详情。账本、复盘、设置、验证台、Prompt 实验和分析报告不得渲染空投注单，也不得为了填充布局保留无用第三栏。
- 路由页面只能有一个主标题。嵌入账户工作区的订单、绩效等模块不得再次渲染独立页面标题；当前 Tab 名称与页面主标题不得同义重复。
- 比赛详情的赔率入口固定在概览与右侧投注单，不再保留内容重复的“模拟/Practice”Tab。分析报告只展示报告结果，fixture 与当前源执行入口统一归属 Validation Lab。
- 侧栏使用统一线宽的类目图标与导航文本，不显示分组标题或桌面左上角产品标题；设置固定在左下角。模块归属由顺序与间距表达，不使用 `Practice/Data/Advanced` 等实现导向名称。
- 技术内部名词不得直接成为主要界面文案。`paper decision`、`simulation provider` 等分别显示为“分析决策”“策略对比”；稳定英文 reason code 只用于诊断、数据库与 LLM 输入。

### 空数据与兼容性

- 所有由同步流程渐进补齐的数组和证据对象必须允许缺省。Dota alias 的 `evidence`、`candidateTeamIds` 等字段缺失时显示空态，不得让局部证据面板导致整个验证页崩溃。
- 删除重复提示时必须同步删除死状态、无入口动作与过时测试；安全边界测试应验证实际约束（无真实下单按钮、同区块跟单不可达、只读账户），不得依赖重复模式标签。

### 自动规划的后续步骤

1. **P1-高** 增加静态 UI 文案审计，阻止 `Practice Mode`、`练习账户`、`SQLite 已同步` 和同页重复标题重新进入主界面，并检查非赛事路由不渲染投注单。
2. **P1-高** 将服务端 `paper_bet`、source note 与 eligibility reason code 映射为统一中英文展示文本；内部协议继续保留稳定代码，不做字符串替换式兼容。
3. **P1-高** 固化大厅、比赛详情、账本、报告、验证台和设置页在 390/768/1440 三档宽度及 light/dark/matrix 三主题的视觉矩阵，重点检查重复栏、文字溢出和空态。
4. **P2-中** 按实际使用频率审查侧栏后半区的信息架构；只有功能入口被其他页面完整替代并有迁移路径时才移除，不以文案相似为由删除有效能力。

## 导航图标、精简标题与模拟订单盘口规范（2026-07-25）

### 标题与导航

- 左侧栏每个一级类目与设置入口必须显示一个语义明确的 Lucide 线性图标，固定为 `16px`，图标与文本间距统一；不得恢复分组标题或左上角产品标题。移动端菜单、关闭按钮等明确动作继续使用通用图标。
- 正文页面 `h1/h2/h3` 与 CardTitle 不显示装饰性图标；刷新、编辑、删除、复制、导出等按钮图标保留。新增模块不得用图标替代清晰标题。
- 一级路由页面以及账本中的订单、绩效等内嵌 Tab，只显示一个内容主标题；主标题下不得再显示 `subtitle`、产品定位或功能概述。业务规则、风险警告、图表口径、空状态和操作反馈不属于副标题，必须保留在对应内容附近。
- 标题字距固定为 `0`。侧栏图标必须设置 `aria-hidden`，导航文本继续作为无障碍名称；必须检查图标、文字、激活背景和最小窗口宽度下的对齐。

### 模拟订单可读性

- `SimBet` 是订单主体，列表展示必须使用 `SimBetRecord`，并携带完整 `legs` 与可获取的 `matchName`。服务端不得再次在 `/sim/bets` 或 `/sim/bankroll` 响应中丢弃 selection、单腿赔率和盘口 ID。
- 订单主信息按“赛事名称 → 游戏与本地化盘口类型 → 选择 @ 入场赔率”展示。`matchId`、`marketId` 和 `betId` 只能作为较弱的诊断标识，不能替代用户可读盘口。
- 单关显示一个 leg；串关必须逐 leg 展示选择与赔率。match winner、map winner、handicap、total maps、correct score 使用统一中英文盘口映射，未知类型可显示稳定原始代码但不得隐藏 selection。
- 历史订单缺少 match snapshot 时允许回退到 matchId，但只要 legs 存在仍必须显示 selection 与赔率；缺失数据不得导致整张订单表无法渲染。

### 自动规划的后续步骤

1. **P1-高** 为历史 `sim_bets` 回填可恢复的比赛快照名称，并统计只能回退到 matchId 的记录数量；禁止猜测无法从持久化事实确认的队名。
2. **P1-高** 在下单事务中保存盘口 question、line 与 evidence type 快照，让让分和大小分订单在外部盘口关闭后仍可独立复盘。
3. **P1-高** 增加串关订单展开测试，覆盖多场、多盘口、void/push 与单腿结算状态；总赔率与各腿赔率必须可核对。
4. **P2-中** 在订单 Tab 增加只读详情抽屉，集中展示报告、策略理由、入场/closing、CLV 与结算来源，列表继续保持紧凑。
5. **P1-高** 增加页面标题静态审计，检查路由页或内嵌 Tab 的主标题后不再直接渲染 `*.subtitle`，同时允许图表说明、风险告警和空状态文案存在。
6. **P1-高** 在 390px 与 1440px 视口验证五个侧栏入口的图标、文本和激活态；后续新增一级类目时必须同时提供语义图标与可访问文本。

## LLM 模拟订单结果分析规范（2026-07-25）

### 双阶段契约

- 赛前标准分析固定使用 `analysis.v1` / `analysis-response.v1`；已结算模拟订单的赛后复盘固定使用独立的 `bet-review.v1` / `bet-review-response.v1`。赛后分析不得修改、覆盖或重新解释原始赛前工件。
- 只有 `status=settled` 且已持久化赛果的模拟订单可以调用结果分析 provider。未结算订单必须在 provider 调用前返回结构化冲突，不消耗模型请求。
- 标准输入必须冻结订单与 legs、结算来源、赛前 run/report、模型/市场/用户概率、edge、Brier、CLV、ROI、用户已确认复盘和带稳定 `evidenceId` 的证据；历史缺失字段必须显式为空，不得猜测补齐。
- 标准输出必须严格通过 JSON Schema，拒绝未知字段，校验 analysisId/betId 一致，并要求所有归因引用输入中的 evidenceId。模型不得把盈利等同于好决策，也不得把亏损等同于坏决策。
- UI 的 `zh/en` locale 必须在 provider 边界规范化为 `zh-CN/en-US`。标准输出中的 summary/action 等用户可读字段遵循输入 locale，且不得在 JSON 字符串中写入未转义英文双引号；枚举、reason code、lesson code 与 factor code 固定使用稳定英文机器码，UI 负责本地化常用枚举。
- Brier、CLV、ROI、stake、odds、PnL 等确定性指标由服务端计算并作为不可变事实；模型必须原样保留 Brier 与 CLV，任何篡改或重新计算均标记 `METRIC_MISMATCH`。
- 结果分析必须防止后见之明泄漏：单笔赛果不能证明系统性模型偏差或可靠阈值；Brier、CLV、ROI 与赛果属于赛后证据，不能被描述为本单赛前可知的过滤条件。涉及校准或策略调整的 lesson 必须明确要求足量同类样本。

### 持久化与产品边界

- `bet_result_analyses` 必须保存状态、版本、provider/model、标准 system prompt、input JSON、output schema、prompt hash、raw/normalized response、validation errors、latency 与时间戳。目标环境必须执行 migration `044_bet_result_analyses.sql`。
- 首次执行按 bet 幂等复用最新 valid/running 工件，只有用户明确点击“重新分析”才允许 `force=true` 再次产生模型成本。失败与无效输出必须可审计，不得用默认结论静默替代。
- 结果分析只放在“我的账本 > 复盘”的注单详情中，展示结论、过程评分、归因、校准、价格质量、风险纪律与训练建议，并允许只读查看标准输入、标准输出、Schema、系统提示词和 hash。
- LLM 只可建议错误标签，不能自动写入用户复盘；不能自动调整策略权重、结算订单、创建后续模拟单或触发任何真实成交。胜率、资产、PnL 与权益曲线仍以确定性结算服务为唯一来源。

### 自动规划的后续步骤

1. **P1-高** 将权威比赛、地图与盘口结算事件按稳定 evidenceId 接入结果分析，提升多盘口归因质量；来源未对齐时保持 `insufficient_data`，禁止模型猜测赛况。
2. **P1-高** 在设置中增加可关闭的“权威结算后自动排队分析”，同时实施 provider 成本预算、速率限制、失败重试上限和任务状态提示；默认继续采用用户手动触发。
3. **P1-高** 样本达到可比 segment 10 条后才显示 provisional 过程评分/归因统计，达到 30 条后再评估按 Brier、CLV 与收益表现校准策略参数；不得直接用单笔输赢调权。
4. **P2-中** 建立多 provider 同输入一致性基准，比较 schema 通过率、归因证据覆盖、过程评分稳定性和校准表现，并在模型升级时保存版本化回归结果。

## 比赛详情返回与按需情报补全规范（2026-07-25）

### 页面闭环

- 比赛详情在正常、加载失败和比赛不存在状态都必须提供明确的“返回赛事大厅”按钮。按钮固定返回 `/`，不得依赖不确定的 WebView history；面包屑不能替代主要返回动作。
- 页面主标题只显示对阵双方，赛事名保留在返回行，赛制、状态和实时价格使用紧凑状态标记；不得在标题下重复显示“赛事名 · 赛制”副标题。
- CS2 比赛缺少完整 `teamDetails` 时必须显示可操作空态，说明可补取排名、近期战绩、阵容、选手指标和地图池，并提供“获取 HLTV 数据”按钮。按钮必须有 loading、不可用与失败反馈。
- `刷新阵容` 只负责 match lineup；`获取 HLTV 数据` 负责整场 team intelligence。两个动作不得继续使用同一文案或让用户误以为阵容成功即代表情报完整。

### 数据与来源边界

- `POST /api/esports/matches/:matchId/refresh-intelligence` 必须先解析直接 match ID 或 market slug 对应的持久化比赛。已有 `hltv_match_id` 时直接执行完整补全；缺少关联时可按双方队名发现当前 HLTV 比赛，并持久化 canonical link 后再补全。
- 完整补全必须复用 `SourceAlignmentService.enrichHltvMatchForAnalysis`，写入双方 canonical team ID、logo、排名、五人阵容、个人指标、近期战绩、地图池、来源链接和更新时间，并清理真实 match ID 与别名 slug 的详情缓存。
- HLTV 战队页 roster 少于比赛页确认首发时，必须按 player ID 合并缺失首发，以比赛页 rating/role 补齐缺失记录，同时保留战队页已有的实名与个人统计；不得因单一页面暂缺一名选手而永久将比赛标记为不完整。
- 只有 `local-hltv-*` 或可由关联盘口明确识别为 CS2 的详情页显示 HLTV 获取动作。Dota 2、LoL、Valorant 必须继续使用各自适配器，不得因为 `teamDetails` 缺失而调用 HLTV。
- 外部源未匹配、限流、超时或字段仍不完整时保持 `isComplete=false`，显示可重试状态；不得用阵容、默认排名或本地占位数据伪造完整情报。

### 自动规划的后续步骤

1. **P1-高** 为比赛级情报刷新增加按 match 去重、最短重试间隔和后台任务进度，避免多窗口重复抓取 HLTV；用户仍可看到最近一次失败原因与时间。
2. **P1-高** 将按需补全抽象为游戏适配器：CS2=HLTV，Dota 2=OpenDota/STRATZ，LoL=Oracle's Elixir/Riot，Valorant=VLR，并复用统一的 `missing/refreshing/partial/complete/error` UI 状态。
3. **P1-高** 在详情响应中增加显式 `game`、source freshness 和字段级完整度，替代前端根据 slug/盘口文本推断游戏，并允许只刷新过期字段。
4. **P1-高** 增加真实当前 HLTV 样本 E2E，验证缺失情报 → 主动获取 → 本地持久化 → 详情重载 → LLM 输入引用同一快照的完整闭环。

## 复盘 Timeline 视觉与语义规范（2026-07-25）

### Ant Design 参考映射

- 复盘时间线参考 Ant Design Timeline 的垂直 outlined 变体，但不得为单一组件引入整套 Ant Design 依赖；使用现有 React、Tailwind 与主题变量实现同等信息层级。
- Timeline 根节点使用带可访问标题的 `section`，事件序列必须使用 `ol/li`。时间使用带 `dateTime` 的 `time`；圆点和轨道仅为装饰并设置 `aria-hidden`，业务标题和正文保持可读顺序。
- 默认节点固定为 `10px × 10px`、`2px` 描边，轨道固定 `2px`。每项底部间距为 `20px`，轨道必须从当前节点底部连续连接到下一节点顶部，几何检查不得出现断线或覆盖圆点。
- 标题使用 `14px/22px`，正文使用 `12px/20px`，时间使用 `11px/20px` 与等宽数字。桌面端标题和时间同排，窄屏改为上下排列；长理由、分析 ID 和盘口文本必须换行，不得挤压时间或横向溢出。
- 结构界面继续使用黑白灰：下注和已记录复盘使用前景色描边，普通快照与待记录节点使用 muted 描边；只有盈利结算使用 green、亏损结算使用 red。禁止把所有节点染成品牌色或加入大号装饰图标。

### 测试约束

- 复盘 E2E 必须验证时间线为有序列表，N 个节点对应 N-1 段轨道；结算节点的 `data-tone` 必须与盈亏一致。
- 可见页面验收至少检查节点无重叠、圆点 `10px`、描边 `2px`、轨道 `2px` 且相邻轨道间隙为 `0px`。Timeline 样式变更后必须复测保存复盘和标准化 LLM 结果分析流程。

### 自动规划的后续步骤

1. **P1-高** 增加 390px 移动视口截图回归，覆盖超长中文理由、英文时间格式和五个以上节点，确保弹窗滚动时标题、时间和轨道不重叠。
2. **P1-高** 为未结算、等待收盘线和 LLM 分析中状态增加 pending/loading 节点；只展示真实任务状态，不用动画伪造后台进度。
3. **P2-中** 当后台任务记录和来源对齐记录也需要相同表现时，再抽取共享 Timeline primitive；在第二个稳定消费者出现前保留 `ReviewTimeline` 局部实现。
4. **P2-中** 将日期格式统一接入应用 locale 与时区设置，并为缺失、无效时间提供一致占位，避免依赖系统默认 locale 产生跨平台差异。

## 赛事大厅比赛卡片规范（2026-07-25）

### Polymarket 参考映射

- 赛事大厅参考 Polymarket 电竞列表的信息密度和阅读顺序，但继续使用 Polyrader 的 Cursor 风格黑白灰主题；不得复制其品牌色、营销模块或交易动作。大厅只提供只读盘口，模拟下单仍从比赛详情进入。
- 每场比赛只使用一个外层卡片，不得在卡片内嵌套 Card、表格或独立盘口卡。卡片从上到下固定为一行赛事元信息，以及“两队行 × 多盘口列”的矩阵。
- 元信息行按“游戏、赛制、赛事标题、Live/开赛时间、阶段、数据灯、LLM 灯、总流动性”排列。赛事标题占据弹性空间，Live/开赛时间必须紧跟标题并位于其右侧；低优先级字段必须截断或在窄卡片隐藏，不得把卡片撑宽。
- 大厅卡片不得显示“已分析”、LLM provider 或模型名称 Tag。分析状态只能显示为 `数据 / LLM` 两个固定灯位：每个灯由 `8px` 圆形灯体和短标签组成，外层无背景、无边框，不得退化成 Badge。绿灯表示数据完整/分析完成，灰灯表示待补全/未分析；必须用文字与 tooltip 辅助，不能只靠颜色表达。
- 数据灯仅在 `teamDetails.isComplete=true` 时点亮，阵容刚好五人不等于完整数据。LLM 灯仅在 run 校验状态为 `valid/repaired` 且阶段达到 `validated/report_ready/decision_ready` 时点亮；created、running、invalid 或 failed 不得误亮。大厅允许读取轻量分析索引计算布尔状态，但不得展示 provider/model。
- 总流动性使用 `20px` 高的紧凑中性纯色 Tag，只显示格式化金额，不追加重复的“流动性”文本，不使用半透明背景或边框。流动性 Tag 不得与游戏品牌 Tag 竞争视觉层级。
- 游戏类别必须使用 `20px` 高的紧凑纯色 Tag，不使用游戏或队伍图标，不使用半透明背景或边框。Tag 背景采用游戏 Logo 主配色：CS2 `#DE9B35` 橙、Dota 2 `#C23C2A` 红、LoL `#C89B3C` 金、Valorant `#FF4655` 珊瑚红；品牌色只用于 Tag，卡片结构继续使用黑白灰。
- 游戏 Tag 在 dark、light 与 matrix 三主题保持相同纯色背景，并根据底色固定使用高对比深色或白色文字。禁止只靠颜色区分游戏，必须同时显示 `CS2 / Dota 2 / LOL / Valorant` 文本并保留 `data-game` 语义。
- 左侧固定两条无图标队伍行，只展示队名、可选排名/近期 W-L-D 和实时比分。队名、排名、W/L/D 与比分必须位于同一条 `32px` 单行内并垂直居中，不得使用会让队名偏上的第二行占位；两条队伍行的中心线必须分别与对应赔率按钮中心线一致。大厅不得渲染队标、首字母头像或其他占位图形，队伍文本起始位置必须保持一致。
- 大厅盘口严格限定为“比赛胜负 / 让分 / 大小分”三类，且必须是系列赛级盘口。题目中出现 `Map/Game + 序号`（以及“地图/小局 + 序号”）的任何盘口都视为小局盘口并隐藏，包括小局胜负、回合让分和小局大小分；正确比分及其他衍生盘口也不得进入卡片。每类最多显示一个盘口；同类存在多条系列赛 line 时默认选择流动性最高的一条。
- 两向盘口任一 outcome probability `<= 0.5%` 或 `>= 99.5%` 时视为明显的已结束/已结算形态，不得展示其倒数赔率。比赛胜负盘出现该形态时隐藏整个比赛组；只有让分或大小分出现该形态时仅隐藏对应盘口列，仍保留正常的胜负盘与比赛卡。该大厅防线不删除原始盘口、历史快照或详情证据。
- 右侧每个盘口使用 `18px` 标题行和两条 `32px` 报价行。报价采用现有 `secondary/sm` 按钮视觉且不能随卡片剩余空间拉伸：比赛胜负按钮固定 `80px`、只居中显示赔率，不重复左侧队名；让分和大小分按钮固定 `104px`，保留选择文本与赔率。大小分简写为 `O/U + line`，让分必须保留队伍与正负 line。胜负按钮的 `aria-label` 仍必须包含队名与赔率。
- 比赛卡整体可点击进入详情并支持 Enter 键；报价块只复用按钮视觉，不作为下单按钮、不接受焦点，也不得在大厅创建投注单状态。

### 响应式与测试约束

- 大厅在 `xl` 及以上使用两列，以下使用单列。卡片推荐宽度不低于 `430px`；三列盘口应在推荐宽度内完整显示，页面本身不得产生横向溢出。窄容器仍允许触控板或触屏横向滑动盘口矩阵，但必须隐藏 WebKit 与标准 scrollbar，卡片内不得出现可见滚动条。
- 报价块、队伍行和元信息行必须使用稳定尺寸，实时数据、长队名与四位数赔率变化时不能造成布局跳动。颜色以中性边框和灰阶背景为主，只允许 Live、W/L 和风险状态使用语义红绿。
- 大厅 E2E 必须验证每卡恰有两条无图标队伍行、每个盘口恰有两条报价、报价高度 `32px` 且采用 secondary 按钮样式；比赛胜负按钮必须宽 `80px`、可见文本不包含队名但无障碍名称包含队名，让分/大小分宽度不超过 `104px`。同时覆盖三类盘口白名单、同类去重、`Map/Game N` 小局让分过滤、低于 1000 美元流动性的过滤、极端胜负盘整场隐藏与极端衍生盘单列隐藏。
- 卡片 E2E 必须验证日期在赛事标题之后且视觉上位于标题右侧；流动性为 `20px` 纯色无边框 Tag；盘口容器保留 `overflow-x: auto` 但 computed `scrollbar-width` 为 `none`。
- 卡片 E2E 必须用真实元素几何验证两条队伍行与对应赔率按钮中心线误差不超过 `1px`，并断言桌面与移动端都不存在 LLM 已分析 Tag。双灯测试必须覆盖“数据亮/LLM 灭”与“数据灭/LLM 亮”两个互补样本，灯体固定 `8px`，验证两种状态彼此独立。
- Tauri 冷启动时赛事请求允许因 sidecar 尚未监听而做最多 3 次有限退避重试；重试期间显示加载骨架，只有重试耗尽后才显示真实错误。已有赛事数据时刷新失败必须继续保留旧卡片，不得用启动重试清空本地快照。
- 四游戏大厅样本必须验证存在四个 `game-tag`、四种纯色背景与色板完全一致、无边框且高度固定为 `20px`；品牌色或主题 Token 调整后必须同时回归 dark、light 与 matrix，三主题不得把 Tag 降级为透明或描边样式。
- 响应式回归至少覆盖 `900px` 单列无页面溢出与 `1440px` 双列；真实数据验收需检查卡片宽度、盘口滚动区域和长赛事名截断。

### 自动规划的后续步骤

1. **P1-高** 为同类多 line 盘口增加流动性、价差与更新时间综合排序，保留当前“流动性最高”作为稳定回退，并在诊断数据中记录被选中的盘口 ID。
2. **P1-高** 将实时地图、局分和系列赛比分统一写入大厅快照，让 Live 卡片在不增加地图盘口列的情况下展示可核对的当前状态。
3. **P1-高** 增加“仅地图/单局盘口可用”样本监控，并分别统计小局胜负、小局让分和小局大小分；确认被大厅隐藏的比赛仍可从比赛详情或数据验证页访问，不因视觉精简丢失持久化数据。
4. **P2-中** 在多盘口身份对齐稳定后，将同一赛事的盘口按比赛级 canonical ID 聚合，减少来源别名导致的重复卡片，并保留可审计的分组证据。
5. **P2-中** 当第二个稳定页面需要同一游戏标识时，再抽取共享 `GameTag`；复用时必须共享色板与主题对比度规则，禁止各页面维护不同游戏色。
6. **P1-高** 将极端赔率防线下沉到市场同步与状态协调服务，结合 Gamma closed/active、CLOB orderbook 和赛事权威状态写入稳定 reason code；前端阈值继续作为本地防御，不能成为唯一结算依据。
7. **P1-高** 记录大厅隐藏盘口数量、市场 ID、分类和原因，区分 `resolved_match_winner`、`resolved_derived_market`、`terminal_status` 与 `stale_schedule`，在诊断页可审计但不向普通大厅堆叠提示。
8. **P2-中** 用历史 closing/settlement 样本回放 `0.5% / 99.5%` 阈值，评估临近结算但仍可交易的误杀率；调整阈值必须同步单测、E2E 和规范，不得用视觉层临时常量分叉。
9. **P1-高** 将 Tauri sidecar readiness 提升为统一启动门禁，在 Rust 侧确认健康后再开放首批页面请求；门禁稳定后保留前端有限重试作为断线恢复，而不是让每个页面各自复制启动等待逻辑。
10. **P2-中** 若后续确有按分析状态筛选赛事的需求，将其设计为大厅顶部筛选条件并按需请求轻量索引；不得恢复每张比赛卡的 provider/model Tag，也不得让分析元数据挤压赛事标题和日期。
11. **P1-高** 在市场列表 API 增加 `dataReady / analysisReady` 只读摘要并用最新有效 run 幂等计算，替代大厅额外拉取 200 条分析记录；迁移后保留当前客户端匹配作为旧服务兼容，确认覆盖一致再删除。
