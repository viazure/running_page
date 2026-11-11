# running_page 当前主题 / 视觉 / 组件 Spec

> 采样日期：2026-11-09（Asia/Shanghai）  
> **维护中：** 新组件与汇总改造须与现网风格统一；`src/themes/dashboard_pro/index.css` 的 `@theme` 变更时回写本节 Token 表。  
> 与 handoff mock 冲突时，以 `dashboard_pro` 代码与本 Spec 为准。

---

## 1. 范围与真源

| 项 | 值 |
|----|----|
| 仓库 | 本仓 `viazure/running_page` |
| 现网主题 | `theme_preset: dashboard_pro`（`config.yml`） |
| Token / 工具类真源 | [`src/themes/dashboard_pro/index.css`](../src/themes/dashboard_pro/index.css)（Tailwind v4 `@theme` + `@utility`） |
| 主题入口 | [`src/themes/dashboard_pro/index.tsx`](../src/themes/dashboard_pro/index.tsx) |
| 主题插拔说明 | [`docs/theme-system.md`](theme-system.md) |
| 采样 HEAD | `feat/dashboard-pro-polish` 工作树（汇总跨期对照落地后；基线曾为 `4b166bc`） |
| 对照记忆（非现网） | 外部 handoff `DESIGN-SPEC.md`（11-02；圆角等以本 Spec 为准） |
| 产品 IA | Design `HOME-SUMMARY-IA-DECISION`（首页即时 / 汇总对照） |

**裁决原则：** 与 handoff mock 冲突时，**以 `dashboard_pro` 代码为准**。最显著差异：handoff 卡片圆角 18px；现网 `--radius-xl` = **0.5rem（8px）**。

**仍非「现网已有」：** Demo A/B/C 壳、生产 A|B|C、CTL/TSB、接 Strava/TP——见 §10。

---

## 2. 品牌气质（一句话）

**暖纸安静的个人跑步仪表盘**：米白洗底、发丝线白卡、紫色强调与琥珀热力；克制阴影、表格数字、无霓虹与玻璃拟态。只读进度 / 记录 / 轨迹 / 汇总，不是「开跑」激励 App。

---

## 3. Token 表（代码里叫什么）

真源：`src/themes/dashboard_pro/index.css` 的 `@theme { … }`。Tailwind 工具类映射为 `bg-[var(--color-*)]` / `text-[var(--color-*)]` 等。

### 3.1 颜色 · 浅色（默认产品气质）

| Token（代码） | 值 | 用途 |
|---------------|-----|------|
| `--color-bg` | `#f7f6f3` | 页面洗底（wash） |
| `--color-card` | `#ffffff` | 卡片 / paper |
| `--color-sunken` | `#efece7` | 内凹底、pill 默认底、进度槽、图表垫底 |
| `--color-border` | `#e8e4de` | 发丝边框 |
| `--color-text` | `#141414` | 主文字（ink） |
| `--color-muted` | `#8a8680` | 标签 / 弱提示 / 未选导航 |
| `--color-accent` | `#5b4bdb` | 紫强调：选中 pill、进度填充、主曲线、活跃导航 |
| `--color-all` | `#5b4bdb` | 与 accent 同系（「全部」过滤） |
| `--color-run` / `--color-amber` | `#c45c26` | 热力 / logo 点 / 跑步强调（**不是**主 CTA） |
| `--color-amber-soft` | `#e8a87c` | 热力浅档 |
| `--color-cell` | `#ede9e3` | 热力空格 |

说明：handoff 的 `--soft #3A3A3A` **未**进 `@theme`；次级字统一用 `--color-muted`。硬编码进度槽偶见 `#EFECE7`（与 `--color-sunken` 同色）。

**运动过滤覆盖 accent（浅色）：**

| `data-filter` | `--color-accent` |
|---------------|------------------|
| `all` / `Run` | `#5b4bdb` |
| `Ride` | `#4f7ce0` |

### 3.2 颜色 · 深色（`.dark`）

| Token | 值 |
|-------|-----|
| `--color-bg` | `#0b0d10` |
| `--color-card` | `#14171c` |
| `--color-sunken` / `--color-cell` | `#1b1f26` |
| `--color-border` | `#23272e` |
| `--color-text` | `#e6e8ec` |
| `--color-muted` | `#8b919c` |
| `--color-run` / `--color-amber` | `#e8a87c` |
| `--color-accent` / `--color-all` | `#8b7cf0` |
| `--color-amber-soft` | `#f0c4a8` |

深色卡片阴影改为 inset 高光；hover 才加实阴影（见下）。

### 3.3 圆角

| Token | 值 | 备注 |
|-------|-----|------|
| `--radius-xs` | `0.25rem`（4px） | 紧格 |
| `--radius-sm` | `0.375rem`（6px） | 小结 |
| `--radius-md` / `--radius-lg` / `--radius-xl` / `--radius-2xl` | `0.5rem`（**8px**） | **主卡片**；`@utility card` 默认用 `--radius-xl` |
| `--radius-3xl` | `0.75rem`（12px） | |
| Pill / chip | `9999px` / `rounded-full` | 段控、年份 pill、距离滤镜 |

局部可覆盖：`[--card-radius:…]`（如 RunAnalysis 内层 `[--card-radius:0]`）。

### 3.4 阴影 / 海拔

| Token | 值 |
|-------|-----|
| `--shadow-card`（浅） | `0 1px 2px rgba(20,18,13,.06), 0 8px 24px -4px rgba(20,18,13,.04)` |
| `--shadow-card-hover`（浅） | 略加重；`0 12px 28px -6px …` |
| `--shadow-card`（深） | `inset 0 1px 0 0 rgb(255 255 255 / 0.03)` |
| 遮罩 | `bg-black/40 backdrop-blur-[2px]`（RunAnalysis Sheet） |

**不要**更大投影、彩色 glow、重玻璃拟态。

### 3.5 字体

| Token / 工具 | 内容 |
|--------------|------|
| `--font-sans` | `'Noto Sans SC', 'PingFang SC', ui-sans-serif, system-ui, … 'Microsoft YaHei', sans-serif` |
| `@utility metric` | `tabular-nums` + `lining-nums` + `letter-spacing: -0.02em`（指标数字必挂） |
| `@utility eyebrow` | 英文 uppercase + `letter-spacing: 0.06em`；`:lang(zh)` 取消 uppercase，间距 `0.02em` |

常见字号（已落地）：

| 场景 | 字号 / 字重 |
|------|-------------|
| Section / Progress 题头 | **13px · 600 · text 色 · tracking 0.2px**（`.progress-q-title`，值来自 `--summary-card-title-size` 等三个变量） |
| Section 右侧 meta | 11px · muted（`--summary-card-label-size` / `.progress-q-stat`） |
| 顶栏 logo | `text-xl font-bold`；点号 `text-[var(--color-run)]` → `RUNNING.` |
| 顶栏导航 | `text-sm`；选中 accent medium；未选 muted |
| 本周主数字 | `metric text-[40px] font-bold` → `md:text-[52px]`；单位 `text-base md:text-xl` muted |
| 汇总 hero 距离 | `metric text-[40px] md:text-[48px] font-bold` |
| 侧栏累计等 | `metric text-3xl font-semibold` 量级 |
| 列表 / 表体 | 13px；表头 11px muted |
| Chip / 年 pill | `text-xs font-medium` · `px-3 py-1` · `rounded-full` |
| 汇总段控 tab | 12px · padding `6px 12px` · `rounded-full`（`.summary-period-tab`） |

### 3.6 间距（布局习惯）

| 场景 | 现网 |
|------|------|
| 壳最大宽 | `max-w-[1400px]` |
| 水平 padding | `px-4 md:px-6` |
| 首页主区 | `py-6`；列 gap `gap-6`（lg）；侧栏 gap `gap-4` |
| 卡片内边距 | 常用 `p-4 md:p-5` / `p-5` / `p-6`；小组件可 `p-2 md:p-4` |
| 汇总桌面双栏 gap | `16px`（`.summary-layout`） |
| Progress 卡 gap | 12px（移动）/ 16px（≥900px） |

### 3.7 动效

| 场景 | 现网 |
|------|------|
| 主题色切换 | `body` `transition: background-color/color 0.3s` |
| 导航 / pill hover | `transition-colors` ~默认 |
| 邻期箭头 / 段控 | `0.15s ease` |
| RunAnalysis Sheet | `SHEET_MS = 200`；opacity + translate/scale |
| Boot / PageSkeleton | `sk-breathe` 3.2s opacity 呼吸雾 |
| **禁止** | 对 Mapbox 容器用 CSS `transform`（注释明确：会破坏投影 / marker） |

### 3.8 内置 `@utility`

| 名 | 作用 |
|----|------|
| `card` | `border-radius: var(--card-radius, var(--radius-xl))` + 1px border + card 底 + `--shadow-card` |
| `metric` | 等宽数字特征 |
| `eyebrow` | 小节标签 |
| `progress-track` / `progress-track-fill` | 高 3px、胶囊、槽 `#efece7`、填 `--color-accent` |
| `scrollbar-none` | 隐藏滚动条但可滚 |
| `run-analysis-scroll` | 分析页可见细滚动条 |

---

## 4. 布局与断点

### 4.1 设计验收宽（handoff / Demo 习惯）

| 名称 | 宽 | 用途 |
|------|-----|------|
| Mobile | **390** | 真机对照 |
| Desktop | **1280** | 主桌面画板 |
| 壳 max | **1400** | 实际 `max-w-[1400px]` |

### 4.2 代码里常见断点

| 断点 | 出现处 | 用途 |
|------|--------|------|
| `md` / 768 | Header 桌面导航、padding | Tailwind 默认 |
| `lg` / 1024 | 首页双栏 `lg:grid-cols-[1fr_380px]`；`xl: … 400px` | 主栏 + 侧栏 |
| **900px** | Summary / Progress CSS（`max-width: 899` / `min-width: 900`） | 汇总左右分栏、Progress 堆叠 |
| 640 | Progress 卡内边距收紧 | |
| 1280 | boot skeleton 侧栏加宽到 360 | |

首页桌面：**左主栏 + 右侧约 380–400px**（累计 / PB / 日历等）。  
汇总桌面：**单列对照布局**（年对照 / 月趋势 + Progress；无右侧本期活动大列表）。生涯段全宽嵌入 Life。

---

## 5. 导航与页面壳

### 5.1 顶栏

- 文件：`src/themes/dashboard_pro/components/Header.tsx`
- 结构：`sticky top-0 z-50` + `border-b border-[var(--color-border)]` + `bg-[var(--color-bg)]/70 backdrop-blur-md`
- Logo：`RUNNING` + 琥珀点 `.` + `PAGE`；可点回首页；隐私解锁可多击 logo
- 桌面页导航（`showSummary` 开启时）：**首页 / 轨迹 / 汇总**  
  - 选中：`font-medium text-[var(--color-accent)]`  
  - 未选：`text-[var(--color-muted)] hover:text-[var(--color-text)]`  
  - **不是**胶囊底（与筛选 pill 不同）
- 移动：汉堡展开 `border-t` 列表；选中行 `bg-[var(--color-accent)]/10` + accent 字
- 附属：主题切换、语言、可选 Blog / `NAV_LINKS`

### 5.2 页面状态机

`Page = 'home' | 'tracks' | 'summary'`（`index.tsx`）。  
`summary` / `tracks`：锁视口高度，滚动在内容pane 内，避免整页 + 列表双滚动条。

### 5.3 Boot / Skeleton

- `src/components/boot-shell-pro.css`（仅 `dashboard_pro` 注入 index.html）
- `src/components/PageSkeleton.css` + `DashboardContentSkeleton`
- 气质：短雾带呼吸，对齐真壳比例；默认色偏深启动，浅色跟随 `html.light` / `data-theme='light'`

---

## 6. 组件清单（路径 + 用法要点）

均在 `src/themes/dashboard_pro/components/`，除非另注。

| 组件 | 路径 | 要点 |
|------|------|------|
| 主题壳 | `../index.tsx` | 组页、懒加载 Tracks/Summary、地图 dock、FAB 净空 |
| Header | `Header.tsx` | 见 §5 |
| StatsCards | `StatsCards.tsx` | 本周大数字 + 年/月目标小卡 + 连续；`card` + `metric` + 进度条 |
| ContributionHeatmap | `ContributionHeatmap.tsx` | 年贡献格；Run 用 amber 阶梯；年份 pill + `ChipScrollRow`；可导出 PNG |
| ActivityLog | `ActivityLog.tsx` | 记录表；年 / 距离 pill；`pageSize { mobile:7, desktop:16 }` |
| ProfileCard | `ProfileCard.tsx` | 侧栏头像 + 累计 + 可选 PB / 地点 |
| PersonalBest | `PersonalBest.tsx` | PR 列表 |
| DualCalendarWidget | `DualCalendarWidget.tsx` | 月历距离/路线切换 |
| ChinaMap | `ChinaMap.tsx` | 省份热力 |
| RouteMap | `RouteMap.tsx` + `RouteMap.css` | Mapbox；dock / 播放 |
| PlaybackHud | `PlaybackHud.tsx` | 轨迹播放 HUD |
| MapDockFab | `MapDockFab.tsx` | 地图坞 FAB |
| LatestStrip | `LatestStrip.tsx` + `.css` | 最近活动条（模块可关） |
| TrendChart | `TrendChart.tsx` + `.css` | Recharts 面积；accent 渐变 + 虚线均线 |
| ChipScrollRow | `ChipScrollRow.tsx` + `.css` | 横向 chip 轨；边缘 fade + 桌面箭头 |
| SummaryPage | `SummaryPage.tsx` + `.css` | 汇总五档段控 **年 \| 月 \| 周 \| 日 \| 生涯**（默认年）；年档追加跨年与深度分析 |
| MultiYearCompare | `summary/MultiYearCompare.tsx` | 常年内第 N 天对齐的多年累计线 + 逐年总量卡 |
| ConsistencyPanel | `summary/ConsistencyPanel.tsx` | Eddington / 活跃天 / 日均次数 / 连续（L0） |
| TrainingLoadChart | `summary/TrainingLoadChart.tsx` | CTL/ATL/TSB 体能态（L2，需 training_load） |
| HrZoneStack | `summary/HrZoneStack.tsx` | 月度区间时间堆叠 + 轻松/中等/高强度占比（L3） |
| AerobicTrend | `summary/AerobicTrend.tsx` | VO2max / 有氧解耦 / 步频月中位趋势（L2·L4） |
| BestEfforts | `summary/BestEfforts.tsx` | 各距离滚动最佳与提升次数（L4） |
| HabitDistributions | `summary/HabitDistributions.tsx` | 起跑时刻与配速分布（L0/L1） |
| CapabilityGate | `summary/CapabilityGate.tsx` | 数据不足时整块不渲染 |
| PeriodNavigator | `summary/PeriodNavigator.tsx` | ◀ 标签 ▶ 邻期切换 |
| ProgressQuestions | `ProgressQuestions.tsx` + `.css` | Progress：量（配速分布）/ 出勤 / 配速；散点进「更多」 |
| Aggregator | `../summary/summaryAggregator.ts` + `activitySummaryV1.ts` | L0/YTD/366 槽/加权配速；禁止 JSX 重算配速分母 |
| Capabilities | `../summary/capabilities.ts` | L0–L4 能力探测与门禁阈值 |
| Pro 数据入口 | `../hooks/useProActivities.ts` | 只读 `data/activities.lite.json`，缺失回落全量 |
| 轨迹旁路 | `../../core/trackSidecar.ts` | `data/activities.tracks.json` 按需合入 |
| 聚合加载 | `../hooks/useSummaryAggregates.ts` | `summary/aggregates.json`，缺失即 L0-only |
| TracksPage | `TracksPage.tsx` | 轨迹墙全页 |
| RunAnalysis | `RunAnalysis.tsx` + `runAnalysis/AnalysisCharts.tsx` | 单次分析 Sheet（portal） |
| 通用 RouteMap 样式另册 | `src/components/RouteMap.css` | 非 Pro 专用副本也可能存在；Pro 以主题内为准 |

**卡片惯例：** 根节点加 Tailwind 工具类 `card`，再补 `p-*`。  
**选中 pill 惯例：**

```
选中: bg-[var(--color-accent)] text-white
默认: bg-[var(--color-sunken)] text-[var(--color-muted)] hover:text-[var(--color-text)]
形状: rounded-full px-3 py-1 text-xs font-medium
```

汇总段控用 CSS 类 `.summary-period-tab` / `.is-active`（同色语义）。

---

## 7. 图表与数据可视化（已落地）

### 7.1 贡献 / 出勤热力

- 空格：`var(--color-cell)` / `.level-0`
- **跑步强度（Progress 出勤）：**  
  - L1 `--color-amber-soft`  
  - L2 `color-mix(amber 72%, amber-soft)`  
  - L3 `--color-amber`  
  - 选中：`outline: 2px solid var(--color-text)`
- **ContributionHeatmap：** 按运动类型 palette；Run → amber 四级 `color-mix(accent×25/50/78%, sunken)`；Ride `#4f7ce0`；其它类型有固定色（Hike 绿、Training 粉等）
- 格圆角：出勤约 **2px**；勿做成大圆点霓虹

### 7.2 趋势 / 训练量（Recharts）

- 描边：`stroke="var(--color-accent)"`，宽约 2–2.2
- 填充：accent 渐变 `stopColor="var(--color-accent)"` 降透明
- 网格 / 均线：`stroke="var(--color-border)"` + dash `3 3` 或 `3 4`
- 轴字：`fill: var(--color-muted)` · `fontSize: 10`
- Tooltip：card 底 + border + 小圆角
- 图区垫底：sunken / 混合 wash；圆角 8px
- 表面类名：`.trend-chart-surface` / `.progress-chart-surface`（去掉系统 focus 黑环）

### 7.3 配速（Progress）

- 默认首屏：加权均配速对照（Aggregator）；同距离块 `n<3` → `insufficient_sample`，不进默认首屏
- 散点在「更多」折叠内：仅 Run；配速轴约 **180–600 s/km**；点色 `var(--color-run)`；Y **reversed**（快上慢下）
- 空态：`.progress-empty` · muted · 13px

### 7.4 汇总柱

- `.summary-chart` 内柱：`bg-[var(--color-accent)]` · 顶圆角 4px
- Life / 年 SVG 填色经 `.summary-life-classic` 桥到 `--color-card` / border / accent / run（见 `SummaryPage.css`）

### 7.5 进度条

- 本周主轨：高 **3px** · 槽 `#EFECE7` · 填 accent · `rounded-full`（与 `@utility progress-track` 一致）
- 年/月小卡：常见 `h-1` / `h-1.5` + sunken 槽（略粗于设计 utility，但同色语义）

---

## 8. 文案与空态

| 模式 | 现网做法 |
|------|----------|
| 语气 | 短、中性、可中英 `tr()`；避免喊麦文案 |
| 空列表 | muted 13px，如汇总「本期暂无活动」 |
| 空图表 | `.progress-empty` 一句说明即可 |
| 缺字段 | 分析页用 `--`（`fmt`） |
| 对比正向 | `text-emerald-600` / `text-emerald-500`；负向多用 muted 或 `text-rose-500`（分析对比） |
| 隐私 | `privacy_mode` 等开启时匿名标题；视觉仍走同一 token |
| Section 标签 | 11px muted + tracking；中文不用硬 uppercase |

---

## 9. 新组件对齐清单

### Do

- 用 `card` + `--color-*` token，不要私自引入第二套灰紫板
- 指标数字挂 `metric`；小节标题统一用 `.progress-q-title`（13px/600，三个 `--summary-card-title-*` 变量），不要再随手写 11px/12px/14px
- 卡片指标块统一用 `.summary-period-tiles`（3 列）；顺序 **均* → 最* → 爬升**，缺值给 `—` 不要折行
- 筛选 / 年份 / 距离用 **sunken→accent 实心 pill**
- 热力跑量走 **amber 阶梯**；主 CTA / 选中态走 **accent 紫**
- 壳宽与顶栏对齐 `max-w-[1400px]` + `px-4 md:px-6`
- 弹层：遮罩 `black/40` + 轻 blur；面板 `color-card`；圆角 **8px**（移动顶圆角 `rounded-t-[0.5rem]`）
- 深浅色都测：token 已分 `.dark`
- 地图相关动画只动非 Mapbox 投影层

### Don’t

- 不要把 handoff 的 **18px** 大圆角当现网标准（现网主卡 **8px**）
- 不要拿 amber 当主按钮底（logo 点与热力专用）
- 不要高饱和霓虹热力、大阴影、厚玻璃、渐变炫光背景
- 不要第二套全局播放器 / 第二顶栏
- 不要 chips 做成「互斥整页 Tab」却把下方内容藏掉（分析页锚点 chips 是滚动定位）
- 不要负步幅/乱配速轴、双口径均速不说明
- 不要在汇总主路径再堆一套与首页同构的年贡献热力（产品约束，见 §10）

---

## 10. 汇总对照（已落地）与仍须遵守的约束

产品分工：首页 = 即时；汇总 = 跨期对照。视觉仍吃 §3–§9。

### 10.1 现网已有（汇总）

| 项 | 说明 |
|----|------|
| 段控 | 五档「年 \| 月 \| 周 \| 日 \| 生涯」· `.summary-period-tab` |
| 年档 | Hero（总量/指标/月柱）+ 跨年累计 + 深度分析分区 |
| 跨年累计 | 年内第 N 天对齐；逐年总量卡；进行中标注截至日期 |
| 深度分析 | 按能力分层：持续性(L0) → 负荷(L2) → 区间(L3) → 有氧/最佳(L4) |
| 月/周 | Hero + 邻期；出勤以活跃日为主 |
| 生涯 | Life 嵌入；无选年 |
| Progress | 量（配速分布）/ 出勤 / 配速；散点进「更多」 |
| Aggregator | 构建期 `run_page/gen_summary.py` → `summary/aggregates.json`（约 30KB） |
| 数据入口 | `useProActivities` 读 `data/activities.lite.json`；轨迹走 sidecar |

### 10.2 必须继续沿用

| 必须沿用 | 说明 |
|----------|------|
| Token 与 `card` / `metric` / `eyebrow` | 对照卡、段控、图表垫底全部吃 `@theme` |
| 顶栏三页壳 | 汇总仍是 Header `summary`，不另造站点导航 |
| 选中态 / 邻期 | accent 实心 pill；`.summary-period-nav*` |
| 图表色 | 面积/柱/主线 → accent；跑步热力 → amber；轴 → border + muted |
| 圆角 8px + 轻 shadow | 勿回 18px / handoff `--ink`/`--wash` |
| 空态 | 无覆盖 / 样本不足安静文案；不画假 0 线 |
| 验收画板 | 至少 **390** 与 **≥1280** |

### 10.3 数据能力矩阵（公开仓必须成立）

别人的部署可能只有 GPX。缺数据时 **整块不渲染**，不留空卡片、不画假 0。

| 层 | 数据来源 | 支撑内容 | 无此数据时 |
|---|---|---|---|
| L0 | `activities.json` 日期/距离/时长/类型 | 五档浏览、跨年累计、Eddington、习惯分布 | 不可缺（页面基础） |
| L1 | `average_heartrate` / `elevation_gain` | 心率概览、爬升 | 对应指标显示 `--` |
| L2 | `splits.summary` 的 training_load / vo2max / cadence | 训练负荷态、VO2max、步频 | 整块隐藏 |
| L3 | `splits.zones` | 区间时间堆叠 | 整块隐藏 |
| L4 | `splits.chart` 逐点流 | Best efforts、有氧解耦 | 整块隐藏 |
| L5 | life-data `health/daily` | HRV/睡眠/Body Battery | **不进公开站** |

阈值：覆盖 0 → 隐藏；覆盖 < 3 → 仅一句说明；`null` 永不当 0。
门禁实现见 `summary/capabilities.ts` 的 `gate()` 与 `summary/CapabilityGate.tsx`。

### 10.4 构建脚本（主题内改动，不碰共享 core）

| 脚本 | 作用 | 产物（均 gitignore） |
|---|---|---|
| `run_page/gen_lite.mjs` | 拆 lite 与轨迹旁路 | `public/data/activities.lite.json`（168KB）、`activities.tracks.json` |
| `run_page/gen_summary.py` | 聚合跨期统计 | `public/summary/aggregates.json`（约 30KB） |
| `run_page/import_life_data.py` | 本地接入 life-data | 写 `src/static/activities.json`（提交前须还原） |

任一派生文件缺失时主题仍可用：回落读全量 activities，深层分析自动隐藏。

### 10.5 仍非现网 / 禁动

Demo A/B/C 壳、生产实验开关、接 Strava/TP、改后端拓扑、暗色大改、首页主模块本轮勿动，**共享 `src/core` 与其它主题不改**。

---

## 11. 相关文件速查

```
src/themes/dashboard_pro/index.css             # Token / utilities
src/themes/dashboard_pro/index.tsx             # 壳与分页
src/themes/dashboard_pro/components/*          # UI 组件
src/themes/dashboard_pro/components/summary/*  # 跨年与深度分析组件
src/themes/dashboard_pro/summary/*             # Aggregator + 能力门禁
src/themes/dashboard_pro/hooks/*               # Pro 数据入口与聚合加载
run_page/gen_lite.mjs                          # lite + 轨迹旁路
run_page/gen_summary.py                        # 跨期聚合
run_page/import_life_data.py                   # 本地数据接入
docs/CURRENT-THEME-SPEC.md                     # 本文件
docs/theme-system.md                           # 主题插拔说明
src/components/boot-shell-pro.css              # 启动雾壳
src/components/PageSkeleton.css                # 主包骨架
config.yml                                     # theme_preset: dashboard_pro
```

对照（非真源覆盖，仓外）：handoff `DESIGN-SPEC.md`、Design `HOME-SUMMARY-IA-DECISION.md`。

---

*若 `dashboard_pro/index.css` 的 `@theme` 变更，以代码为最高真源并回写 §3 Token 表。*
