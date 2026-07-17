# Contributing to PolyRader

感谢你对 PolyRader 的兴趣！本文档描述了开发环境搭建、代码规范和提交流程。当前产品方向是 CS2 模拟盘练习工具与本地复盘数据库。

## 开发环境要求

| 工具 | 最低版本 | 说明 |
|------|---------|------|
| Node.js | >= 20.0.0 | 推荐使用 LTS 版本 |
| Rust | >= 1.75 | Tauri 2.x 需要 |
| npm | >= 10 | 随 Node.js 安装 |

## 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/StrayShark/polyrader.git
cd polyrader

# 2. 安装依赖
npm install

# 3. 复制环境变量模板
cp .env.example .env

# 4. 同步全局环境变量（可选）
npm run sync:env

# 5. 启动 Web 开发模式（浏览器，需后端时见 dev:all）
npm run dev:web

# 6. 启动 Web + API 全栈开发
npm run dev:all

# 7. 启动 Tauri 桌面开发模式
npm run tauri:dev
```

## 项目结构

```
polyrader/
├── packages/
│   ├── core/           # 核心引擎层（纯逻辑，无 IO 依赖）
│   │   ├── src/engines/    # 12 个引擎：预测、分析、结算、评分等
│   │   ├── src/prompts/    # YAML 提示词模板
│   │   ├── src/types/      # 共享类型定义
│   │   └── src/scoring/    # 评分权重配置
│   ├── infra/          # 基础设施层（DB、缓存、API 客户端）
│   │   ├── src/cache/      # LRU 缓存 + EventEmitter
│   │   ├── src/clients/    # 只读数据源 / LLM / 历史赔率客户端
│   │   ├── src/database/   # SQLite + 迁移 + Repository
│   │   └── src/crawlers/   # HLTV 爬虫
│   ├── server/         # Express 服务端（Sidecar 模式）
│   │   ├── src/controllers/ # REST 控制器（市场、信号、AI、跟单等）
│   │   ├── src/services/    # 业务服务（模拟账户、复盘、信号回测、只读账户诊断）
│   │   ├── src/routes.ts    # API 路由注册
│   │   └── src/websocket/   # WebSocket 实时推送（价格、跟单信号）
│   └── web/            # React + Vite 前端
│       ├── src/components/  # UI 组件 + shadcn/ui
│       ├── src/pages/       # 12+ 页面路由
│       ├── src/hooks/       # WebSocket / 快捷键 / 巨鲸告警
│       ├── src/stores/      # Zustand 状态管理
│       └── src/styles/      # 3 主题 CSS 变量
├── src-tauri/          # Tauri 桌面应用壳
│   ├── src/lib.rs          # Sidecar 管理 + IPC 命令
│   └── tauri.conf.json     # 窗口 / CSP / 打包配置
└── turbo.json          # Monorepo 任务编排
```

## 常用命令

```bash
# 开发
npm run dev:web          # 仅 Web（浏览器 localhost:5173，Vite 代理 /api → :3001）
npm run dev:all          # 并行启动 server + web（推荐全栈开发）
npm run tauri:dev        # Tauri 桌面应用

# 构建
npm run build:web        # 构建 Web 静态文件
npm run tauri:build      # 构建桌面安装包（dmg/msi/AppImage）

# 测试
npm run test             # 运行所有包的测试
npm run test --workspace=packages/core    # 仅 Core 测试
npm run test:e2e         # Playwright 浏览器 E2E（Mock API，含截图回归）
npm run test:e2e:integration  # 全栈 E2E（真实 server + SQLite）
npm run sync:env         # 从 ~/global_env 同步只读数据源与 LLM 配置
npm run dev:all          # 并行启动 server + web

# E2E 截图 baseline（首次或 UI 有意变更后）
cd packages/web && npx playwright install chromium
cd packages/web && npm run test:e2e:update -- visual-regression

# 类型检查
npm run typecheck        # 所有包 TypeScript 检查

# 代码格式化
npm run format           # Prettier 格式化
npm run lint             # ESLint 检查
```

### Playwright E2E

- 测试目录：`packages/web/e2e-browser/`
- 配置：`packages/web/playwright.config.ts`（Vite **5174**，避免与手动 `dev:web` 的 5173 冲突）
- 共享 fixtures：`fixtures/api-mocks.ts`、`fixtures/theme.ts`、`fixtures/routes.ts`
- 功能审计报告：`docs/report/e2e-prd-audit.html`
- 视觉审计报告：`docs/report/e2e-design-audit.html`
- 截图 baseline：`packages/web/e2e-browser/__snapshots__/visual-regression.spec.ts/`（13 路由 × 3 主题 = 39 张）
- CI 在 `test` job 中运行全量 E2E 与 Integration E2E；**有意 UI 变更后须更新 baseline 并一并提交**

### Integration E2E（全栈）

- 配置：`packages/web/playwright.integration.config.ts`
- 测试目录：`packages/web/e2e-integration/`
- 自动启动 `@polyrader/server`（`POLYRADER_SKIP_CRON=1`）+ Vite，走真实 SQLite 与 REST API

## 代码规范

### TypeScript

- 使用 `strict` 模式
- 优先使用 `interface` 定义对象类型，`type` 定义联合类型
- 避免 `any`，使用 `unknown` + 类型守卫
- 公共 API 必须有 JSDoc 注释

### React 组件

- 使用函数组件 + Hooks
- Props 接口以 `{ComponentName}Props` 命名
- 使用 `cn()` 工具函数合并 Tailwind 类名
- 使用 3 主题 CSS 变量（`var(--background)` 等），不要硬编码颜色

### 引擎层（core）

- 纯逻辑，无 IO 依赖（不 import fs/http/db）
- 所有外部数据通过参数传入
- 每个引擎必须有对应的 `.test.ts` 测试文件
- 使用 Vitest 编写测试

### 变更后续规划

每次完成代码、配置、文档或数据结构变更后，必须自动规划后续步骤，并在交付说明、PR 描述或任务记录中体现。后续规划应简洁但可执行，避免把无关重构塞进当前变更。

后续步骤至少覆盖：

- 验证结果：列出已运行的测试、类型检查、构建或手动验证；如果未运行，说明原因。
- 风险与观察点：指出可能受影响的模块、数据迁移、兼容性、性能或用户体验风险。
- 下一步行动：给出 1-3 个可落地 follow-up，例如补回测、加监控、完善 UI、接入真实数据源或增加测试。
- 归属边界：区分“本次已完成”和“后续建议”，不要让未完成事项混淆当前变更状态。

建议格式：

```md
验证：
- npm --workspace @polyrader/core test
- npm --workspace @polyrader/server run typecheck

风险：
- 新信号权重需要更多历史样本校准。

后续：
- 用已结算市场回测新权重。
- 在 Signals 页面增加信号解释弹层。
```

当前规划记录（Polymarket 账户接入）：

```md
验证：
- npm run typecheck
- npm run lint
- npm run build
- npm --workspace @polyrader/infra test -- clob-client.test.ts polymarket-order-client.test.ts
- npm --workspace @polyrader/web test
- npm --workspace @polyrader/server test -- polymarket-account-service.test.ts
- npm --workspace @polyrader/web run test:e2e -- polymarket-account.spec.ts
- npm --workspace @polyrader/web run test:e2e:account（默认跳过真实账户检查）

风险：
- 当前只读账户连接、公开历史交易统计、胜率统计和资产曲线已通过 mock/integration 结构验证；CLOB 私有读接口已修正为 `/data/orders`、`/data/trades`，余额签名不再包含 query string。
- 当前开发环境访问 `data-api.polymarket.com` 与 `clob.polymarket.com` 会超时，`POLYMARKET_ACCOUNT_E2E=1` 真实只读 E2E 未能完成，需要在 Polymarket 网络可达的环境复跑。
- 若 API key 是由不同 signer address 创建的，仍需在 `.env` 配置 `POLYMARKET_SIGNER_ADDRESS`，否则 CLOB 私有接口可能继续返回 401。
- 本阶段明确不启用真实成交/下单功能，账户页保持只读。

后续：
- 用真实 Polymarket signer address 再跑只读账户 E2E，确认余额、挂单和私有成交 diagnostics 全绿。
- 如果本机继续超时，先处理网络/代理/VPN，再复测 Polymarket 公共 `/time` 和 Data API。
- 为资产曲线补充更精确的资金流水来源，降低基于 closed positions 回推的估算误差。
```

当前规划记录（CS2 模拟盘产品重定位）：

```md
验证：
- 文档产物：docs/cs2-simbook-product-redesign.md
- 本次为产品功能与 UI 规划，不涉及运行时代码变更，未运行测试。

风险：
- 新定位会重排现有 Dashboard、Simulation、Signals、Whales、Polymarket Account 的主次关系，后续实现时需要分阶段迁移，避免一次性重构造成页面断层。
- UI 可借鉴 sportsbook 的盘口组织与投注单效率，但必须保持模拟练习和本地数据库边界，不加入真钱充值、提现、奖励或实盘诱导。
- 现有实盘/Polymarket 相关能力需要降级为只读数据源或高级设置，主路径必须默认模拟。

后续：
- Phase 1 先实现导航重构、顶部虚拟余额条和右侧模拟投注单壳。
- Phase 2 新增 sim_accounts、sim_bets、sim_bet_legs 等本地数据库 migration。
- 为新赛事大厅和比赛详情补桌面/移动端 Playwright 截图验证。
```

当前规划记录（产品文档与视觉规范审查）：

```md
验证：
- 文档产物：README.md、.trae/documents/PRD.md、.trae/documents/design-spec.md、.trae/documents/overview.md、.trae/documents/technical-architecture.md、.trae/documents/DEVELOPMENT.md、.trae/rules/project_rules.md、docs/product-docs-audit.md。
- 历史/生成型 HTML 文档已加重定位提示：.trae/documents/architecture-overview.html、.trae/documents/landing.html、.trae/documents/ui-design.html、docs/report/llm-integration-report.html、docs/report/e2e-design-audit.html、docs/report/e2e-prd-audit.html。
- 本次为产品文档、协作规范和视觉规范调整，不涉及运行时代码变更，未运行应用测试。

风险：
- 运行时代码、i18n 文案和部分 E2E 用例仍可能保留旧 Dashboard/Signals/Live Trading/Polymarket Account 信息架构，需要在 Phase 1 迁移时统一替换。
- docs/report 下的 E2E 设计审计报告是生成物，当前可能仍反映旧界面，应在新版 UI 落地后重新生成。
- 历史 release notes 和 changelog 保留旧名称作为版本记录，不能作为当前产品定位依据。

后续：
- Phase 1 优先实现 Event Lobby、Match Simbook、VirtualBankrollBar 和 PracticeBetSlip 的前端壳，并更新导航/i18n。
- Phase 2 增加 sim_accounts、sim_bets、sim_bet_legs、odds_snapshots 等本地数据库 migration 与只读 API。
- 更新 Playwright 视觉审计路由、截图 baseline 和禁用真钱博彩术语扫描。
```

当前规划记录（设计稿品牌名修正，已被 PolyRader 命名覆盖）：

```md
验证：
- 已检查 `.trae/documents/ui-design.html`：浏览器标题、设计稿提示、侧栏品牌名均显示 `PolyRader`。
- 内置浏览器刷新 `file://` 页面被浏览器安全策略拦截，未通过浏览器截图复核。

风险：
- 当前已修正设计稿可见品牌和核心视觉规范，不代表所有产品文档都已统一为 `PolyRader`。
- README、PRD、overview、technical-architecture 等产品文档仍可能保留早期命名，需要后续同步。

后续：
- 确认产品正式品牌命名：`PolyRader` 是否应用到 README、PRD、视觉规范和发布文档。
- 如果品牌统一为 `PolyRader`，继续批量同步文档、i18n、Tauri bundle 展示名和 E2E 报告标题。
```

当前规划记录（详细视觉规范整理）：

```md
验证：
- 已重写 `.trae/documents/design-spec.md`，产品名统一为 `PolyRader`，并补充外部 sportsbook 参考、Cursor-like 主题 token、布局、组件、页面、文案、响应式和 E2E 审计标准。
- 已同步 `.trae/rules/project_rules.md` 的产品名，避免项目规则与视觉规范冲突。
- 本次为文档规范变更，未运行应用测试。

风险：
- README、PRD、overview、technical-architecture 等文档仍可能保留早期命名，需要后续统一品牌命名。
- 设计规范已经详细到组件级，但前端实现和 Playwright 视觉审计尚未迁移到新 routes。

后续：
- 批量同步产品文档品牌名：以 `PolyRader` 为产品名，保留“模拟盘/Simbook”作为功能概念而非品牌。
- 实现 AppShell、VirtualBankrollBar、PracticeBetSlip、OddsButton，并按新规范更新视觉 E2E。
- 将 `.trae/documents/ui-design.html` 原型升级为新版三栏 sportsbook/workbench 设计稿。
```

当前规划记录（后续开发 TODO 文档）：

```md
验证：
- 已新增 `docs/polyrader-implementation-todo.md`，覆盖当前实现结论、目标 IA、P0/P1/P2 待办、UI 改进、里程碑、风险和近期执行顺序。
- 本次为文档整理，不涉及运行时代码变更，未运行应用测试。

风险：
- TODO 文档基于当前静态代码审查，未通过运行应用或真实 E2E 重新验证页面状态。
- 工作区仍有此前文档和 Polymarket CLOB 相关未提交改动，后续开发时需要区分任务来源。

后续：
- 按 TODO 的 P0 顺序先处理主路径 live order 隐藏、PracticeBetSlip 壳和 sim 数据库 migration。
- 将 TODO 文档中的里程碑拆成 issue 或阶段任务，避免 UI、API、DB 同时无序推进。
- 新主路径实现后更新 Playwright routes、截图 baseline 和视觉审计报告。
```

当前规划记录（BC.GAME CS2 参考后的 UI 重设计）：

```md
验证：
- Firefox/Playwright 已访问 `https://bc.game/sports`、`https://bc.game/sports/counter-strike-109`、`https://bc.game/sports/live`、`https://bc.game/help/terms-sports`、`https://betting.bc.game/`、`https://betting.bc.game/predictions/esports/`、`https://betting.bc.game/predictions/esports/counter-strike/`、`https://betting.bc.game/betting-academy/sports/esports/`。
- BC.GAME 主 sportsbook、Counter-Strike 分类和 Live 在当前环境跳转登录页；公开可确认结构包括 Sports Home、Live、Rules、Sport Betting Insights、Counter-Strike 分类入口。
- 公开 CS2 predictions 页面可确认 Today/Tomorrow、赛事、队伍、赛果状态、赔率和 Detail 入口；已转译为 PolyRader 的赛事大厅、比赛工作台、复盘中心和策略实验室。
- 已重写 `.trae/documents/ui-design.html` 为三栏 sportsbook/workbench 原型：左侧 CS2 筛选、顶部虚拟余额、主区 hash routes、右侧 Practice Bet Slip。
- 已更新 `.trae/documents/design-spec.md` 的产品名、BC.GAME Firefox 访问记录、转译规则和下一步视觉任务。
- 已修正 `docs/polyrader-implementation-todo.md` 中将 PolyRader 当作历史名的错误策略。

风险：
- BC.GAME 登录后真实 sportsbook 页未访问，不能复制登录后专有信息架构；后续只能继续参考公开导航与公开 predictions 页面。
- `.trae/documents/ui-design.html` 仍是静态设计稿，尚未完全落到 React 运行时组件和 E2E baseline。
- 部分历史文档仍可能把 `CS2 Simbook` 当产品名，需要后续逐步清理，保留 Simbook 作为功能概念即可。

后续：
- 高 · UI 实现：按新版设计稿重排 React AppShell、CS2Rail、VirtualBankrollBar、PracticeBetSlip、MatchOddsRow。
- 高 · 路由迁移：将旧 Dashboard/Match Detail/Signals/Simulation 页面迁移到赛事大厅、比赛工作台、复盘中心、我的账本、本地数据库。
- 中 · 审计：重新跑 Playwright 视觉审计，更新三主题截图 baseline 和真钱术语扫描报告。
```

当前规划记录（后续功能实现收口）：

```md
验证：
- 已将运行时产品名统一为 `PolyRader`：web brand 常量、Tauri productName/window title/tray tooltip、Cargo 描述、README、release guide、Tauri guide、env 注释。
- 已将 Web AppShell 调整为桌面三栏工作台：左侧导航、中心 workspace、右侧 PracticeBetSlip；移动端保留菜单和模拟单抽屉。
- 已保留并验证模拟盘核心闭环：赛事大厅选择 odds -> PracticeBetSlip -> POST `/api/sim/bets`，不调用 `/api/market-orders`。
- 已修复数据库页对旧 backup info 缺少 `tableMeta` 的兼容问题。
- 已修复复盘弹窗高度过高导致保存按钮不可点击的问题。
- 已将默认导出文件名统一为 `polyrader-*`。

测试：
- `npm --workspace @polyrader/web run typecheck`
- `npm --workspace @polyrader/server run typecheck`
- `npm --workspace @polyrader/web test`
- `npm --workspace @polyrader/web run build`
- `cargo check`（`src-tauri`）
- `npm --workspace @polyrader/web run test:e2e -- simbook-lobby.spec.ts bankroll-page.spec.ts review-page.spec.ts database-page.spec.ts`
- `npm --workspace @polyrader/web run test:e2e -- sidebar-layout.spec.ts`

风险：
- Playwright 运行时仍出现 Vite proxy 连接未启动后端的 `/api/health`、WS 日志噪声；当前用例通过 mock 不受影响，但后续可在测试 fixture 中统一 block/mocks 以降低日志噪音。
- `npm --workspace @polyrader/web run build` 仍出现 core 中 Node-only 模块被 Vite externalize 的既有 warning，未阻断构建；后续可拆分 browser-safe core exports。
- 历史文档路径如 `docs/cs2-simbook-product-redesign.md` 仍保留旧文件名，作为历史文档路径可暂不迁移。

后续：
- 高 · 测试治理：为 sidebar-layout 等未统一 mock 的用例补 `setupCommonMocks` 或 block API/WS，减少 Vite proxy 噪声。
- 中 · 构建治理：拆分 `@polyrader/core` browser-safe exports，消除 web build 对 `fs` / `path` / `node:crypto` 的 externalize warning。
- 中 · 视觉审计：重新跑完整 design-audit/visual-regression，更新三主题截图与报告。
```

当前规划记录（阶段 1-6 完成：复盘、数据库、设置、状态、健康、发布验证）：

```md
验证：
- npm --workspace @polyrader/web run typecheck
- npm --workspace @polyrader/server run typecheck
- npm --workspace @polyrader/server test
- npm --workspace @polyrader/web test
- npm --workspace @polyrader/web run test:e2e
- npm --workspace @polyrader/web run test:e2e:integration
- POLYMARKET_ACCOUNT_E2E=1 npm --workspace @polyrader/web run test:e2e:integration -- polymarket-account-readonly.spec.ts
- npm run build:web
- npm run build:server
- npm run tauri:build

已完成：
- 复盘中心新增 ReviewTimeline，并接入浏览器 E2E。
- 数据库页新增 LocalDatabaseInspector；服务端新增只读表数据查询 API，支持分页、搜索和表名校验。
- 新增 Settings 页面，并接入侧栏、命令面板和 Cmd/Ctrl+, 快捷键。
- UI 状态补齐 loading skeleton、错误重试、禁用原因和 Polymarket 只读账户关闭态。
- 健康检查调整为本地 DB/WS 决定 unhealthy，外部 API/Grid/stream 失败进入 degraded。
- Polymarket 只读账户开关与真实下单开关拆分；`.env` 已启用只读账户，显式关闭 market orders。
- server bundle 修复 Playwright 静态打包问题，Tauri build 成功产出 `.app` 和 `.dmg`。

风险：
- 当前本机到 `data-api.polymarket.com` / `clob.polymarket.com` 会 timeout 或 connection reset；账户 E2E 已验证配置识别和 degraded diagnostics，实时余额/交易数据需在网络可达环境复跑。
- Web build 仍有既有 Node-only core exports warning，未阻断构建。
- Tauri build 有 updater target warning：配置了 updater artifacts，但当前未启用 updater-enabled target。

后续：
- 高 · 复盘详情补齐错误标签编辑、收盘线和下注时快照对照。
- 中 · 数据库页补 CSV/JSON 导出。
- 中 · 拆分 browser-safe core exports，清理 Vite externalize warning。
```

### 开发完成后的下一步

每次完成一项功能开发或 bug 修复后，开发者（含 AI 辅助开发）应**主动分析并列出下一步工作**，便于连续迭代、减少遗漏。

**要求：**

1. 对照本次改动，识别未验证、未接入或仍缺失的部分
2. 结合当前需求目标，给出 **1～3 条**具体、可执行的后续项
3. 说明优先级（高/中/低）与类型（验证、联调、测试、文档等）
4. 若 scope 已闭环，明确写「暂无必须跟进项」

**输出示例：**

```markdown
## 下一步工作

1. **高 · 验证** 重启后端，确认设置页「后台任务」面板实时更新
2. **中 · 测试** 为 TaskTrackerService 补充单元测试
```

项目内 Cursor 规则见 `.cursor/rules/post-dev-next-steps.mdc`（`alwaysApply: true`）。

### 提交规范

使用 Conventional Commits 格式：

```
<type>(<scope>): <subject>

feat(match-analysis): add BO5 veto simulation
fix(websocket): fix reconnection on sidecar restart
refactor(services): extract shared match-helpers
test(prompt-engine): add YAML template loading tests
docs(tauri): add development guide
```

**Type 列表**：`feat` | `fix` | `refactor` | `test` | `docs` | `style` | `chore` | `perf`

### Pull Request 流程

1. 从 `main` 创建功能分支：`git checkout -b feat/your-feature`
2. 编写代码 + 测试
3. 确保通过：`npm run typecheck && npm run test`
4. 提交 PR，描述变更内容和动机

## 3 主题系统

项目支持 3 个主题，通过 `data-theme` 属性切换：

| 主题 | 标识 | 适用场景 |
|------|------|---------|
| Dark | `data-theme="dark"` | 默认，暗色环境 |
| Light | `data-theme="light"` | 明亮环境 |
| Matrix | `data-theme="matrix"` | 绿色终端风格 |

所有颜色必须使用 CSS 变量（定义在 `packages/web/src/styles/themes.css`），禁止硬编码。

## LLM 提示词模板

提示词使用 YAML 模板管理（`packages/core/src/prompts/`）：

| 文件 | 用途 |
|------|------|
| `system.yaml` | 系统角色 + 分析因子 + 指南 |
| `context-template.yaml` | 比赛上下文模板（含 `{{placeholder}}`） |
| `output-schema.yaml` | 输出 JSON 格式定义 |

修改提示词时编辑 YAML 文件，不需要改代码。`PromptEngine` 会自动加载。
