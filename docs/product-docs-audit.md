# PolyRader 产品文档与视觉规范审查

审查日期：2026-07-06

## 审查目标

根据新的产品规划，将项目文档统一到 **CS2 模拟盘练习工具 + 本地数据库** 定位，并检查视觉规范是否能指导后续 sportsbook/workbench 风格 UI 重构。

## 审查结论

整体结论：已完成当前文档层面的定位统一。运行时代码仍处在旧 PolyRader IA，需要后续 Phase 1 开发迁移。

## 已更新文档

| 文件 | 处理 | 结论 |
| --- | --- | --- |
| `README.md` | 重写 | 仓库入口已统一为 PolyRader，突出模拟练习、本地数据库和安全边界 |
| `docs/cs2-simbook-product-redesign.md` | 保留并作为蓝图 | 已覆盖产品定位、IA、页面、数据模型、阶段计划 |
| `.trae/documents/PRD.md` | 重写 | Canonical PRD 已从 Polymarket 交易分析改为 simulation-first |
| `.trae/documents/design-spec.md` | 重写 | 视觉规范已覆盖三栏布局、OddsButton、PracticeBetSlip、RiskMeter、禁用文案 |
| `.trae/documents/overview.md` | 重写 | 总览已解释旧模块如何迁移到新模块 |
| `.trae/documents/technical-architecture.md` | 重写 | 技术架构已增加目标 API、sim 数据表、领域计算和安全边界 |
| `.trae/documents/DEVELOPMENT.md` | 重写 | 路线图已按 Phase 1-9 迁移计划重排 |
| `.trae/rules/project_rules.md` | 更新 | 项目规则已增加模拟边界和文档索引 |
| `docs/tauri-guide.md` | 更新 | 桌面指南已更新目标 IA、首次启动和本地数据库说明 |
| `docs/release-guide.md` | 更新 | 发布指南已增加 Simbook 命名和 simulation-first release checklist |
| `.trae/documents/RELEASE_NOTES_v0.2.0.md` | 加历史说明 | 保留历史事实，标记为重定位前发布记录 |
| `.trae/documents/architecture-overview.html` | 加历史提示 | 保留旧架构展示，页面顶部指向当前 PRD/架构/视觉规范 |
| `.trae/documents/landing.html` | 加历史提示 | 保留旧首次配置原型，页面顶部说明新首次启动应围绕虚拟账户和本地数据 |
| `.trae/documents/ui-design.html` | 加历史提示 | 保留旧 UI 原型，页面顶部指向当前 `design-spec.md` |
| `docs/report/llm-integration-report.html` | 加历史提示 | 保留旧 LLM 接入报告，页面顶部说明 LLM 后续服务于模拟训练与复盘 |
| `docs/report/e2e-design-audit.html` | 加历史提示 | 保留旧视觉审计结果，页面顶部说明需按新 UI 重新生成 |
| `docs/report/e2e-prd-audit.html` | 加历史提示 | 保留旧 PRD 功能审计结果，页面顶部说明需按新 PRD 重新生成 |
| `CHANGELOG.md` | 加历史说明 | 保留历史事实，说明旧条目使用历史名称 |
| `CONTRIBUTING.md` | 更新 | 已记录 CS2 模拟盘产品重定位后续规划 |

## 视觉规范审查

| 项 | 状态 | 说明 |
| --- | --- | --- |
| 产品视觉方向 | 通过 | 电竞 sportsbook + 本地复盘工作台 |
| 三栏布局 | 通过 | 左筛选/中工作区/右投注单；移动端底部抽屉 |
| 核心组件 | 通过 | 定义 VirtualBankrollBar、OddsButton、PracticeBetSlip、RiskMeter、ReviewTimeline |
| 颜色语义 | 通过 | 保留 Dark/Light/Matrix，明确 primary/green/red/yellow 等用法 |
| 字体和数字 | 通过 | 赔率、金额、概率使用 tabular-nums |
| 禁止真钱激励 | 通过 | 禁止 deposit/withdraw/bonus/VIP/cashback/真钱下注主路径 |
| E2E 视觉审计 | 待开发 | 当前代码仍是旧页面；需 Phase 9 更新 Playwright 视觉审计范围 |

## 术语统一

推荐主术语：

- PolyRader
- 模拟盘
- 虚拟本金
- 模拟下注
- PracticeBetSlip / 模拟投注单
- 我的账本
- 复盘中心
- 本地数据库
- 策略实验室

需要逐步替换或降级的旧术语：

- Polymarket 账户：降级到只读数据源/数据库/设置
- 巨鲸追踪：降级为策略实验室中的聪明钱观察
- AI 胜率：合入复盘中心/策略实验室
- 市场总览/每日看板：合入赛事大厅
- 实盘下单/实盘跟单：移出主路径，默认关闭

## 当前不一致项

这些不一致项存在于运行时代码或历史报告中，不属于本次文档层可完全解决的范围：

| 项 | 原因 | 后续处理 |
| --- | --- | --- |
| `packages/web/src/utils/i18n.ts` 仍包含旧导航和 live trading 文案 | 运行代码尚未进入 Phase 1 | Phase 1 同步改 i18n 和导航 |
| `packages/web/e2e-browser/live-trading.spec.ts` 仍验证实盘入口 | 旧功能测试 | Phase 1/9 改为高级设置或移除主路径测试 |
| `docs/report/e2e-*-audit.*` 仍是旧生成报告 | 自动生成物 | HTML 已加历史提示；更新 E2E 后重新生成 HTML/JSON |
| `.trae/documents/screenshots/*.png` 仍是旧界面截图 | 二进制视觉 baseline | 新 UI 落地后重新截取赛事大厅/模拟投注单/复盘中心 |
| 部分 HTML 原型仍展示旧界面细节 | 历史参考资料 | 已加历史提示；Phase 9 可选择重生成或归档 |
| `src-tauri` bundle 名称可能仍是 PolyRader | 历史兼容 | 发布阶段决定是否迁移 bundle identifier |
| 历史 release notes/changelog 使用 PolyRader | 历史事实 | 已加说明，不重写历史记录 |

## 风险

- 如果先改 UI 文案但不改数据模型，用户会看到“模拟盘”但下注仍走旧 LLM stats 表，容易造成概念混乱。
- 如果保留实盘按钮在比赛详情主区域，会破坏 simulation-first 定位。
- 如果视觉只换颜色而不改布局，产品仍像分析仪表盘，不像练习型 sportsbook。
- 如果不新增 odds_snapshots 和 bet_reviews，复盘中心无法闭环。

## 后续建议

1. **P0 · 前端** 实现 Phase 1：导航重构、VirtualBankrollBar、PracticeBetSlip、OddsButton。
2. **P0 · 数据库/API** 新增 sim_accounts、sim_bets、sim_bet_legs、odds_snapshots、bet_reviews。
3. **P1 · 视觉审计** 更新 Playwright design audit：赛事大厅三栏、移动投注单抽屉、禁用真钱词汇扫描。
