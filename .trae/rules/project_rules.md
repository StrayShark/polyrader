# PolyRader — 项目规范

## 产品定位

PolyRader 是 **CS2 模拟盘练习工具 + 本地数据库**。主路径必须保持 simulation-first：

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
| `docs/cs2-simbook-product-redesign.md` | 产品重定位蓝图（保留历史文件名，当前产品名以 PolyRader 为准） |
| `docs/polyrader-implementation-todo.md` | 当前开发完成度、风险与后续待办 |
| `docs/product-docs-audit.md` | 产品文档和视觉规范审查记录 |
| `.trae/documents/PRD.md` | Canonical PRD |
| `.trae/documents/design-spec.md` | 视觉与交互规范 |
| `.trae/documents/overview.md` | 项目总览 |
| `.trae/documents/technical-architecture.md` | 技术架构 |
| `.trae/documents/DEVELOPMENT.md` | 开发路线图 |
| `CONTRIBUTING.md` | 贡献规范和当前规划记录 |
| `docs/tauri-guide.md` | 桌面开发指南 |

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
- **视觉规范**: 新页面遵循 `.trae/documents/design-spec.md`，优先三栏 sportsbook/workbench 布局

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
