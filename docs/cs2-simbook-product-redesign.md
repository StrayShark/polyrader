# CS2 Simbook 产品重定位与 UI 设计规划

## 定位

PolyRader 定位为 **CS2 博彩模拟盘练习工具 + 本地数据库**。

产品不做真钱菠菜、不引导充值、不承担交易执行；核心价值是让用户用虚拟本金练习 CS2 赛前/赛中判断、资金管理、赔率理解和赛后复盘，并把所有盘口快照、下注决策、结算表现沉淀到本地 SQLite 数据库。

一句话：

> 像 sportsbook 一样快，像交易日志一样可复盘，但只用虚拟筹码训练 CS2 判断力。

## 参考模式

外部参考仅用于信息架构和交互模式，不复制品牌、营销或真钱激励。

- [BC.GAME Sports](https://bc.game/sports)：可借鉴“一个钱包/账户状态、移动端优先、体育 + 娱乐入口整合”的结构，但本产品替换为虚拟余额和本地练习账户。
- [Stake Esports](https://stake.com/sports/esports)：可借鉴左侧赛事分类、Live & Upcoming、CS2 筛选、赔率格式切换、盘口列表和右侧投注单模式。
- [Rivalry Esports](https://www.rivalry.com/esports)：可借鉴电竞内容导向、CS2 重点叙事、指南/学院/比赛解释，但本产品改为训练课程和复盘素材。

## 产品原则

1. **模拟优先**：页面主按钮永远是“加入模拟单”“提交虚拟下注”“复盘”，不出现 Deposit、Withdraw、Real Bet。
2. **本地优先**：所有练习、注单、盘口快照、AI 判断、复盘结论默认写入本地数据库。
3. **CS2 专精**：不做泛体育导航；围绕 BO1/BO3/BO5、地图池、选手状态、替补、赛事级别、盘口波动设计。
4. **高频操作**：从看盘到下注不超过 2 次点击；右侧投注单常驻；列表密度高但可扫描。
5. **复盘闭环**：每笔模拟下注必须能回看当时盘口、模型概率、下注理由、赛果和错误类型。
6. **安全边界**：明确标注“模拟练习/虚拟本金”，默认关闭任何实盘交易相关入口。

## 目标用户

| 用户 | 需求 | 产品承诺 |
| --- | --- | --- |
| CS2 赛事玩家 | 想练习盘口判断，不想真钱试错 | 低成本模拟、复盘、胜率曲线 |
| 数据型 bettor | 想记录每次判断和结果 | 本地下注日志、盘口快照、校准指标 |
| AI 策略调参者 | 想对比 AI/行为金融/市场概率 | 模拟回测、Brier Score、收益归因 |
| Polymarket 观察者 | 想读市场但不下单 | 只读账户、市场行情、历史统计 |

## 信息架构

新的导航应从“分析工具集合”调整为“模拟投注工作台”：

| 新导航 | 替代/整合现有页面 | 核心任务 |
| --- | --- | --- |
| 赛事大厅 | Dashboard + Daily + Esports | 浏览 Live/Upcoming CS2 比赛、筛选赛事、快速看赔率 |
| 模拟盘 | Match Detail + Simulation | 选择盘口、加入投注单、提交虚拟下注 |
| 投注单 | 新增右侧常驻面板 | 管理待提交注单、串关练习、风险预估 |
| 我的账本 | Simulation + Allocation | 虚拟余额、收益曲线、仓位、风险暴露 |
| 复盘中心 | Signals + AI Stats | 已结算注单、错误归因、Brier/ROI/胜率 |
| 数据库 | Polymarket Account + local DB views | 本地市场、比赛、赔率快照、下注记录 |
| 策略实验室 | AI Config + Prompt Variants + Whales | AI/行为金融/聪明钱信号调参 |
| 设置 | Setup + AI Config subset | 数据源、LLM、本地备份、只读账户 |

后续可以保留快捷入口，但左侧一级导航不应超过 8 个。

## 核心页面设计

### 1. 赛事大厅

布局参考 sportsbook 的赛事列表，但聚焦 CS2：

- 顶部：虚拟余额、今日 PnL、未结算暴露、练习模式状态。
- 左侧筛选：Live、Starting Soon、Today、Tomorrow、Tournament、BO1/BO3/BO5、Tier、地图完整度。
- 中间列表：赛事卡按 tournament 分组，每行展示：
  - 时间/Live 状态/地图进度
  - Team A vs Team B
  - HLTV 排名、近 5 场、替补提示
  - Match Winner 赔率按钮
  - Map Winner、Handicap、Total Maps 的快捷盘口
  - “+N” 展开更多盘口
- 右侧：投注单常驻，移动端变成底部抽屉。

### 2. 模拟盘比赛详情

比赛详情应改成“盘口工作台”：

- 第一屏左侧是比分/赛程/队伍信息，不再把 AI 分析放在最前。
- 中间是盘口矩阵：
  - Match Winner
  - Map 1/2/3 Winner
  - Handicap
  - Total Maps
  - Correct Score
  - Pistol/Round 类盘口可作为后续扩展
- 右侧是本场投注单与风险摘要：
  - 虚拟下注额
  - 潜在返还
  - Kelly 建议
  - 当前总暴露
  - 和已有注单的相关性
- 下方 Tabs：
  - 情报：阵容、地图池、近期状态
  - 市场：价格曲线、盘口深度、成交量
  - AI：多模型概率、理由、分歧
  - 复盘：赛后才显示，归因和时间线

### 3. 投注单

投注单是新定位里最重要的 UI 组件：

- 常驻右栏，宽度 320-380px。
- 支持 Single、Parlay Practice、Round-robin Practice 三种模式。
- 每一项显示：
  - 赛事、盘口、选择项
  - 赔率/隐含概率
  - 用户下注概率
  - 模型概率
  - Edge
  - Stake 输入
  - Remove 按钮
- 提交前显示：
  - 总 stake
  - 最大亏损
  - 预期收益
  - 组合相关性警告
  - 超过单笔/单日限额提示
- 提交按钮文案：`提交模拟下注`。

### 4. 我的账本

从“模拟盘统计”升级成训练账户：

- 虚拟余额卡：初始本金、当前权益、可用余额、未结算暴露。
- 资产曲线：按天/周/月查看。
- 风险面板：
  - 单日最大亏损
  - 最大回撤
  - 平均下注额
  - Kelly 偏离
  - 连续亏损次数
- 持仓表：
  - Open Bets
  - Settled Bets
  - Voided/Cancelled Bets
- 训练目标：
  - 本周只下注高置信度盘口
  - 连续 20 笔记录下注理由
  - 将单笔风险控制在本金 2% 内

### 5. 复盘中心

复盘中心应成为产品的“学习引擎”：

- 统计维度：
  - 胜率
  - ROI
  - Brier Score
  - Closing Line Value
  - 赛前/赛中下注表现
  - BO1/BO3/BO5 表现
  - 不同赛事 Tier 表现
- 错误归因：
  - 高估强队
  - 忽视地图池
  - 追涨盘口
  - 过度相信 AI
  - 仓位过重
  - 临场信息缺失
- 每笔注单复盘：
  - 当时盘口快照
  - 用户下注理由
  - AI/行为金融/市场三类概率
  - 赛果
  - PnL
  - 用户复盘笔记

### 6. 数据库

数据库页应让用户明确知道“本地有哪些数据”：

- Matches：比赛、队伍、赛事、赛制、状态。
- Markets：盘口、赔率、成交量、流动性。
- Odds Snapshots：价格历史、盘口变化。
- Sim Bets：所有模拟下注。
- Settlements：赛果与结算。
- Signals：AI/行为金融/市场概率快照。
- Wallet/Market Observations：只读账户和聪明钱数据。
- Backup/Export：导出 SQLite、CSV、JSON。

## 数据模型规划

新增或重命名时建议采用更贴合模拟盘的领域语言。

| 表 | 作用 |
| --- | --- |
| `sim_accounts` | 本地练习账户，保存虚拟本金、余额、风险参数 |
| `sim_bets` | 每笔模拟下注，包含 stake、odds、selection、status、pnl |
| `sim_bet_legs` | 串关/组合下注的每个 leg |
| `odds_snapshots` | 盘口快照，保存 implied probability、source、timestamp |
| `cs2_match_snapshots` | 比赛情报快照，保存地图池、阵容、排名、状态 |
| `bet_reviews` | 用户复盘笔记、错误标签、学习结论 |
| `training_sessions` | 练习任务、时间段、目标、完成情况 |
| `strategy_profiles` | 固定注、Kelly、保守/激进参数 |

现有表可复用：

- `markets` → 继续作为盘口基础表。
- `matches` / `teams` → 继续作为 CS2 数据库基础。
- `signal_snapshots` → 作为下注时的概率快照。
- `simulation_config` → 可迁移/扩展为 `sim_accounts` + `strategy_profiles`。
- `llm_analyses` / `llm_stats` → 下沉到策略实验室和复盘中心。

## UI 设计方向

### 视觉基调

风格：电竞 sportsbook + 桌面交易终端。

- 背景：深色低对比，减少花哨渐变。
- 主色：现有橙色 `#f54e00` 可保留，用于主操作和选中盘口。
- 盈亏色：绿色表示盈利/正向 edge，红色表示亏损/风险。
- 密度：比当前卡片更紧凑，盘口按钮使用固定宽度，避免列表跳动。
- 卡片半径：保持 8px 内，适合工具型界面。
- 视觉资产：队伍 logo、赛事 logo、地图图标优先；没有资产时用简洁缩写徽章。

### 三栏布局

```text
┌──────────────┬──────────────────────────────────────┬────────────────┐
│ CS2 筛选/导航 │ 赛事大厅 / 盘口矩阵 / 复盘数据          │ 模拟投注单       │
│ Live          │ Tournament Group                     │ Virtual Bankroll│
│ Today         │ Match Row: Team A | odds | Team B     │ Selected Legs   │
│ BO3           │ Market Tabs + Odds Buttons            │ Stake / Payout  │
│ Tier S/A/B    │                                      │ Submit Practice │
└──────────────┴──────────────────────────────────────┴────────────────┘
```

移动端：

- 左侧筛选变成顶部横向 chips。
- 右侧投注单变成底部抽屉。
- 盘口按钮保持双列，长队名换行，不挤压赔率。

### 关键组件

| 组件 | 设计要求 |
| --- | --- |
| `VirtualBankrollBar` | 顶部显示余额、今日 PnL、未结算风险、练习模式 |
| `CS2EventRail` | 左侧赛事/筛选，不放营销内容 |
| `MatchOddsRow` | 固定高度、赔率按钮固定宽度、Live 状态清晰 |
| `OddsButton` | 显示赔率、隐含概率、涨跌闪烁 |
| `PracticeBetSlip` | 右侧常驻，移动端底部抽屉 |
| `RiskMeter` | 显示 stake 占本金比例、单日亏损、相关性 |
| `ReviewTimeline` | 下注前/盘口变化/赛果/复盘笔记 |
| `LocalDatabaseInspector` | 表、记录数、最近同步、导出 |

## 现有功能重排

| 现有功能 | 新定位中的位置 | 处理 |
| --- | --- | --- |
| Dashboard | 赛事大厅 | 重构为 sportsbook lobby |
| Daily | 赛事大厅筛选 | 融入 Today/Starting Soon |
| Match Detail | 模拟盘比赛详情 | 强化盘口矩阵和投注单 |
| Simulation | 我的账本 | 从 LLM 对比改成训练账户 |
| Allocation | 投注单/账本 | 变成资金管理建议 |
| Signals | 复盘中心/策略实验室 | 作为概率校准层 |
| Whales | 策略实验室 | 作为聪明钱观察，不再主导航前置 |
| Polymarket Account | 数据库/设置 | 只读数据源，不作为核心体验 |
| AI Config/Prompt Variants | 设置/策略实验室 | 从主线挪到高级功能 |

## 用户路径

### 赛前练习

1. 打开赛事大厅。
2. 筛选 Today + BO3 + Tier A/S。
3. 选择 Match Winner 或 Map Winner 赔率。
4. 投注单自动计算 implied probability、模型概率和 edge。
5. 用户填写自己的概率和下注理由。
6. 提交模拟下注，写入本地数据库。

### 赛后复盘

1. 进入复盘中心。
2. 查看已结算注单。
3. 打开单笔复盘。
4. 对比当时盘口、收盘盘口、AI 概率和赛果。
5. 选择错误标签，写复盘笔记。
6. 系统更新训练统计和建议。

## 分阶段实施

### Phase 1：定位与导航重构

- 品牌名已统一为 `PolyRader`；`Simbook` 仅保留为模拟盘功能概念。
- 左侧导航调整为新 IA。
- 增加顶部 `VirtualBankrollBar`。
- 隐藏/降级真钱交易入口，默认只读。
- 新建 `PracticeBetSlip` 的前端状态模型。

### Phase 2：模拟投注单与本地账本

- 新增 `sim_accounts`、`sim_bets`、`sim_bet_legs` migration。
- 在比赛详情中支持加入模拟单。
- 提交模拟下注写入本地数据库。
- 我的账本展示余额、open bets、settled bets、资产曲线。

### Phase 3：盘口大厅重构

- Dashboard 改为 sportsbook lobby。
- 增加赛事分组、盘口按钮、盘口展开。
- 支持赔率格式切换：Decimal、Probability、American。
- 价格变化做 up/down flash。

### Phase 4：复盘中心

- 接入赛果结算。
- 计算 ROI、Brier、CLV、回撤。
- 加入错误标签和复盘笔记。
- 支持按赛事、盘口、时间、策略过滤。

### Phase 5：策略实验室

- 将 AI/行为金融/市场概率三类模型放入策略实验室。
- 支持策略配置、回测、参数对比。
- 输出“训练建议”，不输出真钱下注建议。

## 验收标准

- 首页第一屏让用户清楚知道这是“CS2 模拟盘练习工具”。
- 任意赛事能在 2 次点击内加入模拟投注单。
- 提交模拟下注全程不调用真钱交易 API。
- 每笔模拟下注都可在本地数据库查到完整快照。
- 已结算下注能展示 PnL、胜率、Brier、复盘标签。
- 移动端可以完成筛选、加入投注单、提交模拟下注。

## 风险与边界

- 不使用真钱充值、提现、奖金、VIP、返现等激励设计。
- 页面应持续显示“模拟/虚拟本金”状态，避免误解。
- 如果未来保留 Polymarket 只读账户，应只作为数据源和个人历史导入，不放在主路径。
- 实盘下单代码若保留，必须放在高级设置并默认关闭；主 UI 不提供实盘按钮。
- 参考 sportsbook UI 时只借鉴信息密度、盘口组织和投注单交互，不复制品牌视觉或营销文案。

## 下一步工作

1. **高 · 产品/前端** 先实现 Phase 1：导航重构、顶部虚拟余额条、右侧模拟投注单壳。
2. **高 · 数据库** 设计并执行 `sim_accounts`、`sim_bets`、`sim_bet_legs` migration。
3. **中 · UI 验证** 为赛事大厅和比赛详情补 Playwright 截图，验证桌面三栏和移动底部投注单。
