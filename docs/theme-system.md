# 主题系统 (3.0)

Running Page 3.0 引入了可插拔的主题架构。你可以切换内置主题或创建自己的主题，无需修改源代码。

## 工作原理

主题位于 `src/themes/<name>/` 目录下，每个主题导出一个 React 组件。应用入口 (`src/App.tsx`) 维护一个**主题注册表**，将主题名称映射到懒加载的组件：

```typescript
// src/App.tsx
const themes: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  dashboard: lazy(() => import('./themes/dashboard')),
  dashboard_pro: lazy(() => import('./themes/dashboard_pro')),
  classic: lazy(() => import('./themes/classic')),
  // 在此添加自定义主题
}
```

构建时，`config.yml` 中的 `theme_preset` 决定加载哪个主题。所有主题共享核心层 (`src/core/`)——类型、i18n 翻译、活动数据钩子和语言工具。

## 内置主题

### Dashboard

Dashboard 主题是为跑者设计的现代化单页布局，提供丰富的小部件：

- **统计卡片** — 年度/月度/周度进度条，含连续运动追踪
- **热力图** — GitHub 风格的活动网格，每日详情，支持导出 PNG
- **活动日志** — 分页表格，支持距离筛选（10km+、20km+、40km+），运动类型图标
- **路线地图** — 基于 Mapbox 的路线可视化，点击活动高亮轨迹
- **轨迹墙** — 全页轨迹网格，智能聚类（按起终点），支持导出 PNG
- **中国地图** — 省份级活动热力图，点击筛选
- **个人最佳** — 自动检测 PR（5K、10K、半马、全马）
- **日历小部件** — 月度日历，气泡显示距离
- **深色/浅色模式** — 跟随系统或手动切换

主要特性：
- 所有数据在一个页面展示（无需路由跳转）
- 点击任意活动即可在地图和日志中查看
- 热力图和轨迹墙支持导出为 PNG 图片
- 响应式两栏网格布局

### Dashboard Pro

本仓库新增的主题：基于 Dashboard 的**隐私增强 + 移动端优化**个人站点主题。选择 `dashboard` / `classic` 不受影响。

启用：

```yaml
theme_preset: dashboard_pro
privacy_mode: true                 # 按需
privacy_unlock: true               # 按需
privacy_anonymous_titles: true     # 按需
```

相对 Dashboard，本主题额外提供：

- 首页默认选中当前年
- 移动端更短的活动记录分页
- 移动端首页模块顺序调整、路线图置顶固定、年度趋势图
- Summary 汇总页
- ProfileCard 路线图标与内嵌个人最佳
- 隐私模式（关灯底图、匿名标题、可解锁）
- 月历支持距离视图与路线视图切换

定制建议：优先改 `src/themes/dashboard_pro/`，通过可选 props 开启共享组件增强，避免直接改写 `src/components/` 默认行为。

本主题常用可选 props（细节见主题代码）：

| 组件 | Prop | Pro 用法 |
|------|------|----------|
| `ActivityLog` | `pageSize` | `{ mobile: 7, desktop: 16 }` |
| `ProfileCard` | `showRouteIcon` / `showPersonalBest` / `showLocationStats` | 开启图标、内嵌 PB、地点统计 |
| `ProfileCard` / `PersonalBest` | `getTitle` | 隐私匿名标题 |
| `Header` | `showSummary` / `enablePrivacyUnlock` | Summary 导航 + 解锁 |

Summary 嵌入页的 Life / year SVG 宽度上限写在 [`SummaryPage.css`](../src/components/SummaryPage.css)，仅作用于 `dashboard_pro` 的 Summary。

### Classic

Classic 主题保留了原始的多页面布局，每个视图有独立路由。使用 `react-router-dom` 导航和 `react-map-gl` 地图。如果你更喜欢原始风格，或从 v2.x 升级，推荐选择此主题。

> **注意：** 如果你从 v2.x 升级，可在 `config.yml` 中设置 `theme_preset: classic`。

## 隐私相关配置（Dashboard Pro）

以下配置供 `dashboard_pro` 使用（代码侧默认均为 `false`，需在 `config.yml` 显式开启）：

| 配置项 | 含义 |
|--------|------|
| `privacy_mode` | 关灯底图；配合匿名标题与解锁 |
| `privacy_unlock` | 是否允许临时解除隐私（Logo 连点 / Konami） |
| `privacy_anonymous_titles` | 锁定时用时段匿名标题替代活动名 |

这与同步脚本里的 polyline `IGNORE_*` 环境变量隐私保护是不同层面（数据入库 vs UI 展示）。

## 创建自定义主题

1. 在 `src/themes/<your-theme>/` 下创建新目录，例如 `src/themes/minimal/`
2. 创建 `index.tsx` 导出默认 React 组件
3. 使用共享核心层获取数据和 i18n：

```tsx
// src/themes/minimal/index.tsx
import { getActivityData } from '@/hooks/useActivities'
import { useTheme } from '@/hooks/useTheme'
import { useLocale } from '@/hooks/useLocale'
import type { Activity } from '@/types'

export default function Minimal() {
  const activities = getActivityData() as Activity[]
  const { t } = useLocale()
  // ... 你的自定义布局
}
```

4. 在 `src/App.tsx` 中注册你的主题：

```typescript
const themes = {
  dashboard: lazy(() => import('./themes/dashboard')),
  dashboard_pro: lazy(() => import('./themes/dashboard_pro')),
  classic: lazy(() => import('./themes/classic')),
  minimal: lazy(() => import('./themes/minimal')), // 添加这行
}
```

5. 在 `config.yml` 中设置 `theme_preset: minimal`

## 共享核心层 API

所有主题可用的钩子和工具：

| 模块 | 导出 |
|--------|---------|
| `@/hooks/useActivities` | `getActivityData()`、`useFilteredActivities()`、`getAvailableYears()`、`formatDistance()`、`formatPace()`、`formatDuration()`、`parseMovingTime()`、`extractProvince()` |
| `@/hooks/useLocale` | `useLocale()` → `{ t, locale }` 用于 i18n |
| `@/hooks/useTheme` | `useTheme()` → `{ dark, toggle }` 用于深/浅色模式 |
| `@/types` | `Activity`、`SportFilter` 类型 |
| `@/config` | `MAPBOX_TOKEN`、`AVATAR`、`GOALS`、`DEFAULT_LOCALE`、`THEME_PRESET`、`PRIVACY_MODE`、`PRIVACY_UNLOCK`、`PRIVACY_ANONYMOUS_TITLES` |

Dashboard 主题的组件 (`src/components/`) 也可复用 —— 如需要可在自定义主题中导入。
