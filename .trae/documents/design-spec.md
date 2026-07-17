# PolyRader — 视觉与交互规范

## 1. 定位

PolyRader 是 **CS2 博彩模拟盘练习工具 + 本地复盘数据库**。`Simbook` 仅作为“模拟盘”功能概念使用，不再作为产品名。

视觉目标是把 sportsbook 的高效率盘口浏览、电竞网站的赛事理解、交易终端的风险纪律，以及 Cursor 式工作台的克制质感结合起来：

> 像 sportsbook 一样快，像 Cursor 工作台一样安静，像交易日志一样可复盘。

主路径必须始终表达：

- 虚拟本金
- 模拟下注
- 本地数据库
- 复盘训练
- CS2 专精

主路径不得表达：

- 充值、提现、奖金、VIP、返现
- 真实资金收益承诺
- AI 确定性预测
- 实盘下单作为默认能力

## 2. 参考来源与取舍

外部网站只用于抽象信息架构和交互模式，不复制品牌、配色、促销或真钱博彩激励。

| 参考 | 可借鉴 | 在 PolyRader 中的转译 | 禁止复制 |
| --- | --- | --- | --- |
| [BC.GAME Sports](https://bc.game/sports) | 顶部账户状态、移动优先、赛事入口聚合、快速投注路径 | 顶部改为虚拟余额、今日 PnL、未结算暴露；账户状态只表示练习账户 | 赌场入口、充值入口、奖励、促销、会员体系 |
| [Stake Esports](https://stake.com/sports/esports) | 左侧赛事分类、Live/Upcoming、赔率格式切换、右侧 bet slip、盘口列表密度 | 左侧改为 CS2 筛选；右侧改为 Practice Bet Slip；赔率格式支持 Decimal/Probability/American | 品牌色、真钱钱包、真实下注主按钮、营销语气 |
| [Rivalry Esports](https://www.rivalry.com/esports) | 电竞内容叙事、CS2 语境、赛事解释、学院/指南式学习路径 | 策略实验室和复盘中心加入 CS2 地图池、阵容、赛制、错误标签 | 娱乐化促销、导流文案、真钱下注引导 |
| Cursor / 本项目现有主题 | 暖灰背景、橙色 primary、8px 圆角、hairline border、低阴影、工作台密度、三主题 | 保留 Dark+ / Light+ / Matrix 三主题；页面像桌面工具，不像营销 landing page | 大面积渐变、发光装饰球、重阴影、过度卡片化 |

### 2.1 BC.GAME Firefox 访问记录（2026-07-10）

本轮使用 Firefox/Playwright 访问了以下公开入口：

- `https://bc.game/sports`
- `https://bc.game/sports/counter-strike-109`
- `https://bc.game/sports/live`
- `https://bc.game/help/terms-sports`
- `https://betting.bc.game/`
- `https://betting.bc.game/predictions/esports/`
- `https://betting.bc.game/predictions/esports/counter-strike/`
- `https://betting.bc.game/betting-academy/sports/esports/`

访问结论：

- `bc.game/sports`、`bc.game/sports/counter-strike-109`、`bc.game/sports/live`、sports rules 在当前环境均跳转到登录页，未绕过登录、年龄或地区限制。
- 登录页公开导航可见 Sports Home、Live、Rules、Sport Betting Insights，以及 Soccer、Basketball、Counter-Strike、Dota 2 等体育分类入口。
- `betting.bc.game/predictions/esports/counter-strike/` 可公开访问，页面结构包含 CS2 预测列表、Yesterday/Today/Tomorrow 时间筛选、赛事名称、队伍、赛果状态、赔率和详情入口。
- `betting.bc.game/betting-academy/sports/esports/` 可公开访问，可作为策略学习和复盘知识库的信息架构参考。

转译到 PolyRader：

- Sports Home / Counter-Strike category -> `赛事大厅` 和左侧 CS2 专用筛选。
- Live -> `Live` chip 和比分/地图进度状态，不做真实 in-play 下注承诺。
- 预测列表 -> `MatchOddsRow`，展示赛事、队伍、BO 赛制、地图信息、Decimal odds、模型概率、用户概率、edge。
- Detail -> `比赛工作台`，展示概率栈、地图 veto、赔率快照和决策时间线。
- Betting Academy -> `策略实验室` 与 `复盘中心`，沉淀训练策略和错误标签。
- 账户/钱包模式 -> `VirtualBankrollBar`，只显示虚拟余额、可用余额、未结算风险和今日 PnL。

禁止转译：

- 充值、提现、奖金、VIP、返现、真实下注按钮、促销弹窗。
- “赢钱”“必中”“专家推荐”等结果承诺。
- 任何需要登录后才能确认的专有样式或数据结构。

## 3. 设计原则

### 3.1 模拟优先

所有下注行为都是模拟行为。按钮、状态、表格、toast、空状态都必须明确使用“模拟”“虚拟”“练习”“复盘”等词。

### 3.2 高密度但可扫描

赛事大厅和盘口矩阵要像 sportsbook 一样快速浏览，但每一行必须有稳定尺寸、清晰分组和足够留白。

### 3.3 Cursor 式工具质感

界面应像工作台而不是活动页：

- 低饱和暖灰背景
- 细边框分隔
- 无卡片阴影或极弱阴影
- 8px 以内圆角
- 小字号、高信息密度
- 工具栏、表格、tabs、侧栏优先

### 3.4 CS2 专精

页面信息围绕 BO1/BO3/BO5、地图池、战队排名、替补、赛事 Tier、Live 进度、赔率变化设计，不做泛体育导航。

### 3.5 可复盘

每次模拟下注都要能回看下注时盘口、用户概率、模型概率、市场概率、下注理由、收盘线、赛果和错误标签。

## 4. 应用骨架

### 4.1 桌面布局

```text
┌──────────────┬─────────────────────────────────────────┬──────────────────┐
│ CS2 Rail      │ Main Workspace                          │ Practice Slip    │
│ 220-248       │ Event Lobby / Match Workbench / Review  │ 320-376          │
│               │                                         │                  │
│ Live          │ VirtualBankrollBar                       │ Balance          │
│ Today         │ Tournament Group                         │ Selected Legs    │
│ BO3           │ MatchOddsRow                             │ Stake / Risk     │
│ Tier S/A      │ Odds Matrix / Charts / Tables            │ Submit Sim Bet   │
└──────────────┴─────────────────────────────────────────┴──────────────────┘
```

| 区域 | 尺寸 | 视觉规则 |
| --- | --- | --- |
| 左侧导航/筛选 | 220-248px | 固定宽度，深浅主题均使用 sidebar token；分组标题 11px uppercase |
| 主工作区 | 自适应，最小 640px | 不使用浮动大卡片；以工具栏、分组、表格、盘口矩阵为主 |
| 右侧投注单 | 320-376px | 桌面常驻，独立滚动，不能遮挡主区 |
| 顶部虚拟余额条 | 48-56px | 显示余额、今日 PnL、未结算暴露、练习模式 |
| 底部状态栏 | 26-30px | 数据源、SQLite、WS、最近同步、离线状态 |

### 4.2 平板布局

- 左侧 rail 可折叠为图标栏。
- Practice Slip 变为右侧窄抽屉，默认显示摘要。
- 主工作区盘口按钮保持固定尺寸，优先减少列数而不是压缩文字。

### 4.3 移动布局

- 左侧筛选变成顶部横向 chips。
- Practice Slip 变成底部抽屉。
- 底部抽屉常驻摘要：`已选 N 项 · Stake · 风险%`。
- 赛事行单列展示，赔率按钮 2 列优先，极窄屏改 1 列。

## 5. 主题系统

主题实现必须沿用 `packages/web/src/styles/themes.css`，视觉审计沿用 `packages/web/e2e-browser/design/cursor-tokens.ts`。

### 5.1 Cursor-like Token

| Token | Dark+ | Light+ | Matrix |
| --- | --- | --- | --- |
| `--background` | `#1a1916` | `#f7f7f4` | `#0d1117` |
| `--foreground` | `#f7f7f4` | `#26251e` | `#c9d1d9` |
| `--card` | `#242320` | `#ffffff` | `#161b22` |
| `--primary` | `#f54e00` | `#f54e00` | `#00ff41` |
| `--border` | `#3d3b34` | `#e6e5e0` | `#30363d` |
| `--muted` | `#2e2c28` | `#efeee8` | `#21262d` |
| `--muted-foreground` | `#a09c92` | `#807d72` | `#8b949e` |

Matrix 的绿色 primary 是产品例外；其余主题保持 Cursor 风格橙色 primary。

### 5.2 语义颜色

| 语义 | Token | 使用场景 |
| --- | --- | --- |
| 主操作 | `--primary` | 选中盘口、提交模拟下注、当前导航、重点控件 |
| 正向结果 | `--green` | PnL > 0、Edge > 0、赔率上涨、命中 |
| 风险/负向 | `--red` / `--destructive` | PnL < 0、风险超限、赔率下跌、错误 |
| 警告 | `--yellow` | 样本不足、未结算、置信度不足、数据延迟 |
| 信息 | `--blue` / `--cyan` | 数据源、同步、AI 参考、只读状态 |
| 中性面 | `--card` / `--muted` | 面板、表格、投注单、筛选项 |

颜色不能作为唯一状态表达，必须配合文本、图标或数值。

### 5.3 Surface 层级

| 层级 | 用法 | 样式 |
| --- | --- | --- |
| Page | 页面背景 | `background`，无装饰图案 |
| Panel | 主要容器 | `card` + `1px border` |
| Raised Control | 按钮、输入、chip | `muted` 或透明 + border |
| Active | 当前 nav、选中 odds | primary border/background |
| Overlay | 弹窗、抽屉、菜单 | card/popover，边框清楚，阴影极弱 |

禁用大面积渐变背景、装饰性光球、bokeh、重阴影。

## 6. 布局、间距与形状

| 项 | 规范 |
| --- | --- |
| 基础网格 | 4px |
| 常用间距 | 4 / 8 / 12 / 16 / 24 / 32 |
| 页面 padding | 桌面 16-24px，移动 12-16px |
| Panel padding | 12-16px；密集表格可 8-12px |
| 圆角 | 默认 8px；小按钮 6px；赔率按钮 8px；不要超过 12px |
| 边框 | 1px solid `--border` |
| 阴影 | 默认 none；overlay 可极弱阴影 |
| 分隔 | 优先 hairline border，不用厚色块 |

不要把页面 section 做成浮动大卡片；卡片只用于重复条目、弹窗、投注单、数据面板。

## 7. 字体与数字

| 类型 | 尺寸 | 规则 |
| --- | --- | --- |
| Page title | 20-24px / 600 | 工具页面标题，不做 hero |
| Section title | 14-16px / 600 | 面板、分组、表格区 |
| Body | 13-14px / 400 | 默认内容 |
| Label | 11-12px / 500 | muted foreground，短标签 |
| Odds value | 15-18px / 700 | 使用 `tabular-nums` |
| Table cell | 12-13px | 数字右对齐或 tabular |
| Status bar | 11-12px | 信息压缩展示 |

规则：

- 金额、赔率、概率、PnL、盘口价格必须使用 `tabular-nums`。
- 不使用负 letter-spacing。
- 不按 viewport 缩放字体。
- 长战队名允许换行或截断，但赔率数字不得被压缩。

## 8. 图标与视觉资产

- 图标优先使用 lucide。
- 按钮里能用图标表达的工具操作优先用图标，例如删除、展开、刷新、导出、设置。
- 不手绘 SVG 图标，除非是 CS2 地图/战队专用资产。
- 队伍 logo、赛事 logo、地图图标是优先视觉资产。
- 缺失 logo 时用 2-4 字母缩写徽章，不用随机渐变头像。
- 图标按钮必须有 tooltip。

## 9. 核心组件

### 9.1 AppShell

组成：

- `CS2Rail`
- `VirtualBankrollBar`
- `MainWorkspace`
- `PracticeBetSlip`
- `StatusBar`

规则：

- 左 rail 和右 slip 高度撑满窗口。
- 主区独立滚动，右 slip 独立滚动。
- 顶部余额条在桌面保持可见，移动端折叠为摘要。

### 9.2 CS2Rail

必须包含：

- Live
- Starting Soon
- Today
- Tomorrow
- Tournament
- BO1 / BO3 / BO5
- Tier S / A / B
- Map data complete

规则：

- 一级导航不超过 8 个。
- 筛选 chip 用 icon + text 或短文本。
- Active 使用 primary 左边条或背景，不能只靠颜色。

### 9.3 VirtualBankrollBar

必须展示：

- Practice Mode / 模拟练习
- 虚拟余额
- 可用余额
- 今日 PnL
- 未结算暴露
- SQLite 状态

禁止展示：

- Deposit
- Withdraw
- Bonus
- VIP
- Real balance
- Cashout

建议结构：

```text
Practice Mode  |  Balance 10,000  |  Available 8,740  |  Open Risk 12.6%  |  Today +240  |  SQLite synced
```

### 9.4 OddsButton

赔率按钮是最高频组件，必须固定尺寸。

建议尺寸：

| 场景 | 宽 | 高 |
| --- | --- | --- |
| MatchOddsRow 主盘口 | 92-112px | 44-52px |
| 盘口矩阵 | 120-160px | 52-64px |
| 移动端 | 自适应 2 列 | 48-56px |

结构：

```text
┌────────────────────┐
│ NaVi                │
│ 1.72   58.1%        │
└────────────────────┘
```

状态：

| 状态 | 视觉 |
| --- | --- |
| Default | card/muted 背景 + border |
| Hover | border 提亮，背景轻微变化 |
| Selected | primary border，左上角或背景有选中态 |
| Price up | 600ms green flash，不改变尺寸 |
| Price down | 600ms red flash，不改变尺寸 |
| Suspended | 降低透明度，显示锁定/暂停原因 |
| Disabled | 不可点击，tooltip 说明原因 |

点击规则：

- 点击 OddsButton 只加入 PracticeBetSlip，不跳转页面。
- 点击赛事行才进入比赛详情。

### 9.5 MatchOddsRow

固定行高：64-88px。

布局：

```text
[时间/Live] [赛事/BO3/Tier] [Team A | rank | form] [odds] [odds] [+N]
```

必须显示：

- 开赛时间或 Live 状态
- Tournament
- BO 类型
- Team A / Team B
- 主胜赔率
- 更多盘口入口

可选显示：

- HLTV 排名
- 近 5 场
- 替补/阵容警告
- 地图池完整度

### 9.6 PracticeBetSlip

桌面右栏，移动底部抽屉。它是核心操作面板，不是营销面板。

必须包含：

- 虚拟余额摘要
- Single / Parlay Practice / Round-robin Practice
- 已选 legs
- 每个 leg 的 selection、market、odds、implied probability、user probability、model probability、edge
- Stake input
- 总 stake
- 最大亏损
- 潜在返还
- EV
- 风险占本金比例
- 提交模拟下注按钮

交互：

- 删除 leg 使用图标按钮。
- Stake 使用数字输入，支持快捷 chip：0.5%、1%、2% bankroll。
- 用户概率可编辑，不得藏在高级设置。
- 风险超限时按钮禁用，并展示明确原因。
- 提交成功后显示 toast，并写入本地数据库。

### 9.7 RiskMeter

显示：

- 单笔 stake / bankroll
- 今日总风险
- 未结算暴露
- 相关性风险
- Kelly 偏离

阈值：

| 风险 | 颜色 | 文案 |
| --- | --- | --- |
| 0-2% | green | 纪律内 |
| 2-5% | yellow | 注意仓位 |
| >5% | red | 超出练习限制 |

### 9.8 DataTable

适用于账本、复盘、数据库。

规则：

- 行高 40-48px。
- 表头 11px uppercase 或中文短标签。
- 数字列右对齐，使用 tabular。
- 工具栏固定在表格上方。
- 支持筛选、排序、导出，但不要把按钮塞进表格标题里。

### 9.9 ChartPanel

适用于资产曲线、赔率曲线、Brier 校准。

规则：

- 图表背景与 card 一致。
- 网格线低对比。
- 关键事件用 vertical marker：下注时刻、收盘线、赛果。
- tooltip 使用 tabular 数字。
- 图例不超过 4 项。

### 9.10 ReviewTimeline

节点：

1. 发现盘口
2. 加入模拟单
3. 提交模拟下注
4. 赔率变化
5. 收盘盘口
6. 赛果结算
7. 用户复盘

每个节点必须能显示时间、赔率、概率、理由或结果。

### 9.11 LocalDatabaseInspector

展示：

- 数据库路径
- 表名
- 记录数
- 最近更新时间
- 数据来源
- 导出按钮
- 备份状态

默认不暴露原始 SQL；开发者模式可展示查询。

## 10. 页面规范

### 10.1 赛事大厅

第一屏必须出现：

- `VirtualBankrollBar`
- CS2 筛选 rail
- Live / Upcoming 分组
- 至少一组 tournament
- MatchOddsRow
- PracticeBetSlip 空状态

空状态：

- 说明当前筛选无比赛。
- 提供清除筛选按钮。
- 不出现营销文案。

### 10.2 模拟盘详情

第一屏必须出现：

- 双方队伍与赛事信息
- 主盘口矩阵
- PracticeBetSlip
- 情报 / 市场 / AI / 复盘 tabs

AI 区域：

- AI 只显示为参考概率。
- 必须同时展示市场概率和用户概率。
- 必须展示置信度、样本不足和数据来源。
- 不输出真钱下注建议。

### 10.3 我的账本

必须包含：

- 虚拟余额卡
- 资产曲线
- Open Bets 表
- Settled Bets 表
- 风险纪律面板
- 训练目标

### 10.4 复盘中心

必须包含：

- 胜率、ROI、Brier Score、CLV、最大回撤
- 筛选器
- 已结算模拟注单表
- 错误标签统计
- 单笔复盘入口

### 10.5 本地数据库

必须包含：

- 本地数据库路径
- 表列表和记录数
- 最近同步状态
- 导出/备份工具
- 数据来源说明

### 10.6 策略实验室

必须包含：

- AI / 行为金融 / 市场价格三类概率对比
- 权重配置
- 历史回测
- Brier / ROI / CLV 校准
- 策略版本记录

输出文案必须是“训练建议”或“复盘建议”，不是“下注建议”。

## 11. 文案规范

### 11.1 推荐用语

| 中文 | 英文 |
| --- | --- |
| 模拟下注 | Simulated bet |
| 虚拟本金 | Virtual bankroll |
| 加入模拟单 | Add to practice slip |
| 提交模拟下注 | Submit simulated bet |
| 模拟练习 | Practice mode |
| 复盘 | Review |
| 本地数据库 | Local database |
| 训练账户 | Practice account |
| 参考概率 | Reference probability |
| 盘口快照 | Odds snapshot |
| 风险纪律 | Risk discipline |

### 11.2 禁止用语

- 充值 / Deposit
- 提现 / Withdraw
- 奖金 / Bonus
- VIP
- 返现 / Cashback
- Cashout
- Real balance
- 稳赚 / Guaranteed profit
- 实盘买入作为主按钮
- Live trading ready 作为主路径状态

如果技术上仍保留 live trading 能力，只能在高级设置中说明，且默认关闭。

## 12. 图表规范

| 图表 | 页面 | 规则 |
| --- | --- | --- |
| 资产曲线 | 我的账本 | Y 轴使用虚拟本金；正负 PnL 清楚 |
| 赔率曲线 | 模拟盘详情 / 复盘 | 显示下注时刻、收盘点、价格变化 |
| Brier 校准图 | 复盘中心 / 策略实验室 | 分桶展示预测概率 vs 实际命中率 |
| 风险条 | 投注单 / 账本 | 使用阈值分段，不使用复杂图例 |
| 地图池对比 | 情报 Tab | 横向条，队伍颜色一致 |
| 收益归因 | 策略实验室 | AI、行为金融、市场价格分组 |

## 13. 响应式与可访问性

| 断点 | 行为 |
| --- | --- |
| < 640px | 投注单底部抽屉；赛事行单列；盘口按钮 2 列或 1 列 |
| 640-1024px | 左侧筛选折叠；投注单抽屉或窄栏 |
| >= 1024px | 三栏常驻 |
| >= 1440px | 主工作区展示更多盘口列 |

可访问性：

- 所有图标按钮必须有 accessible label 或 tooltip。
- 状态不能只靠颜色。
- 表单错误必须靠近输入框。
- 键盘可操作：Tab 顺序从 rail -> workspace -> slip。
- 不在容器内遮挡文本。

## 14. E2E 视觉审计标准

必须覆盖：

- 三主题 token：background、foreground、primary、border。
- Cursor-like 规则：card shadow 为 none、primary button min-height >= 40px、圆角不超过 8px。
- 赛事大厅桌面三栏截图。
- 赛事大厅移动投注单抽屉截图。
- OddsButton default / hover / selected / disabled / price flash。
- PracticeBetSlip 空状态、已选 legs、风险超限禁用态。
- 我的账本资产曲线。
- 复盘中心错误标签。
- 本地数据库表列表和导出按钮。
- 禁止真钱词汇扫描。

验收：

- 无横向溢出。
- 盘口按钮刷新不跳动。
- 页面没有充值、提现、奖金、VIP、Cashback 等真钱词汇。
- Matrix 主题绿色 primary 被视为允许例外。

## 15. 与现有实现的迁移

| 现有 UI | 新规范处理 |
| --- | --- |
| Dashboard | 重构为赛事大厅 |
| Daily | 合入赛事大厅筛选和 Today 分组 |
| Match Detail | 重构为模拟盘详情 |
| Simulation | 重命名/重构为我的账本 |
| Allocation | 合入投注单风险和资金纪律 |
| Signals | 合入复盘中心和策略实验室 |
| Whales | 下沉为策略实验室的聪明钱信号 |
| Polymarket Account | 下沉为数据库/设置里的只读账户 |
| AI Config/Stats | 下沉为策略实验室和设置 |

## 16. 实施顺序

1. 更新前端品牌展示为 `PolyRader`。
2. 实现 AppShell：左 rail、顶部虚拟余额条、右侧 PracticeBetSlip。
3. 实现 OddsButton、MatchOddsRow、RiskMeter。
4. 将首页改为赛事大厅三栏布局。
5. 将比赛详情改为模拟盘详情。
6. 增加我的账本、复盘中心、本地数据库页面。
7. 更新 E2E 视觉审计和截图 baseline。

## 17. 设计检查清单

提交任何新页面前必须检查：

- 页面第一屏是否清楚表达模拟练习。
- 是否没有真钱充值/提现/奖励入口。
- 是否使用主题 token，而不是硬编码颜色。
- 是否遵守 Cursor-like 低阴影、8px 圆角、hairline border。
- 是否至少包含一个可复盘数据点。
- 赔率、金额、概率是否使用 tabular 数字。
- 移动端是否能打开投注单并提交模拟下注。
- 价格刷新、loading、empty、error、disabled 状态是否完整。

## 18. 下一步视觉任务

1. **高 · UI 壳** 按 `.trae/documents/ui-design.html` 新原型实现 `CS2Rail`、`VirtualBankrollBar`、`PracticeBetSlip`、`OddsButton`。
2. **高 · 页面** 将首页、比赛详情、复盘中心、本地数据库和策略实验室迁移到新版三栏工作台。
3. **中 · 审计** 更新 Playwright 视觉审计报告标题和覆盖范围，从旧 routes 调整为 PolyRader 模拟盘 routes。
