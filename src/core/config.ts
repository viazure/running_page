/**
 * 配置从根目录 config.yml 加载，由 Vite 在构建时转换。
 * 直接编辑 config.yml 即可，无需改动此文件。
 */
import rawConfig from '@config';
import type { Locale } from './i18n';

export interface GoalConfig {
  yearly: number;
  monthly: number;
  weekly: number;
  /** 'distance' (km) | 'time' (minutes) */
  unit: 'distance' | 'time';
}

export interface NavLink {
  /** Fallback label when zh/en specific names are omitted */
  name?: string;
  name_zh?: string;
  name_en?: string;
  url: string;
}

export function navLinkLabel(link: NavLink, locale: Locale): string {
  if (locale === 'zh') {
    return link.name_zh || link.name || link.name_en || link.url;
  }
  return link.name_en || link.name || link.name_zh || link.url;
}

export interface DashboardProModules {
  /** 本周目标 */
  weekly: boolean;
  /** 年目标 */
  yearly_goal: boolean;
  /** 月目标 */
  monthly_goal: boolean;
  /** 连续 */
  streak: boolean;
  /** 贡献热力 */
  heatmap: boolean;
  /** 足迹（中国地图） */
  footprint: boolean;
  /** 本月快览（首页右下角槽） */
  month_glance: boolean;
}

export interface DashboardProConfig {
  modules?: Partial<DashboardProModules>;
  /**
   * 首页目标卡的显示顺序。缺省为 `yearly, monthly, weekly, streak`。
   * 只影响排列，不影响任何统计口径；不在列表里的卡片仍然会显示（追加在末尾），
   * 未知名称会被忽略。
   */
  stats_order?: StatsCardKey[];
  /**
   * 哪张目标卡作为 hero（独占一整行、字号更大）。会永远排在最前。
   *
   * 只取第一个。可选值：yearly / monthly / weekly —— streak（连续记录）不支持，
   * 它的内容是「数字 + 一周七天」，独占整行时要么挤在左边留一大片空白，要么
   * 被迫拉成七个小格子，两种都难看，所以它始终以紧凑网格卡渲染。
   *
   * 传 [] 则所有卡片等权并排、无 hero（默认值）。
   */
  stats_hero?: StatsCardKey[];
}

/** 目标卡标识，用于 `stats_order` / `stats_hero`。 */
export type StatsCardKey = 'yearly' | 'monthly' | 'weekly' | 'streak';

/**
 * Cards that may render as the full-width hero row.
 *
 * `streak` is excluded on purpose: its content is a number plus a seven-day
 * strip, which either bunches into the left corner with a large empty area
 * beside it, or has to be stretched into seven wide tiles. Neither reads well
 * at full width, so it always renders as a compact grid tile.
 */
export const STATS_HERO_ALLOWED: StatsCardKey[] = [
  'yearly',
  'monthly',
  'weekly',
];

interface AppConfig {
  locale: Locale;
  theme: 'light' | 'dark' | 'system';
  theme_preset: string;
  /** Public identity, YYYY-MM. Used to estimate max HR when no LTHR is set. */
  birthday_month?: string;
  privacy_mode?: boolean;
  /** Allow temporary unlock of privacy mode (easter egg). Default true. */
  privacy_unlock?: boolean;
  /** When privacy is locked, replace activity.name with period titles */
  privacy_anonymous_titles?: boolean;
  goals: Record<string, GoalConfig>;
  avatar?: string;
  mapbox_token?: string;
  nav_links?: NavLink[];
  /** Optional blog URL — shown as emphasized CTA on the far right when set */
  blog_url?: string;
  /** Optional GitHub repo URL — shown in footer when set */
  github_url?: string;
  dashboard_pro?: DashboardProConfig;
}

const config = rawConfig as unknown as AppConfig;

export const DEFAULT_LOCALE: Locale = config.locale ?? 'zh';
export const DEFAULT_THEME: 'light' | 'dark' | 'system' =
  config.theme ?? 'system';
export const THEME_PRESET: string = config.theme_preset ?? 'default';
/** When true: lights-off map, unlock sequence available if enabled */
export const PRIVACY_MODE: boolean = config.privacy_mode ?? false;
/** When false: privacy stays locked; unlock triggers are disabled */
export const PRIVACY_UNLOCK: boolean = config.privacy_unlock ?? false;
/**
 * When true: locked privacy shows period titles (清晨跑步…);
 * unlocked / privacy_mode false shows original activity.name.
 */
export const PRIVACY_ANONYMOUS_TITLES: boolean =
  config.privacy_anonymous_titles ?? false;
export const GOALS: Record<string, GoalConfig> = config.goals ?? {};
export const DEFAULT_GOAL: GoalConfig = GOALS.all ?? {
  yearly: 2000,
  monthly: 150,
  weekly: 35,
  unit: 'distance',
};
export const AVATAR: string = (config.avatar ?? '').trim();
export const NAV_LINKS: NavLink[] = config.nav_links ?? [];
export const BLOG_URL: string = (config.blog_url ?? '').trim();
export const GITHUB_URL: string = (config.github_url ?? '').trim();
export const MAPBOX_TOKEN: string =
  import.meta.env.VITE_MAPBOX_TOKEN ||
  import.meta.env.MAPBOX_TOKEN ||
  config.mapbox_token ||
  '';

const DEFAULT_DASHBOARD_PRO_MODULES: DashboardProModules = {
  weekly: true,
  yearly_goal: true,
  monthly_goal: true,
  streak: true,
  heatmap: true,
  footprint: true,
  month_glance: true,
};

const rawDashboardPro = config.dashboard_pro ?? {};

/**
 * Homepage goal-card order and hero selection.
 *
 * `stats_hero` decides which cards get a full-width row; everything else falls
 * into the grid in `stats_order` sequence. Keeping these as card *names* rather
 * than a layout enum means every card can be a hero, and order is free — the
 * old `stats_layout: weekly-hero | grid-4` could only express two fixed shapes.
 */
const STATS_CARD_KEYS: StatsCardKey[] = [
  'yearly',
  'monthly',
  'weekly',
  'streak',
];

function parseStatsCardKeys(
  raw: unknown,
  fallback: StatsCardKey[]
): StatsCardKey[] {
  if (!Array.isArray(raw)) return fallback;
  const seen = new Set<StatsCardKey>();
  const out: StatsCardKey[] = [];
  for (const item of raw) {
    const key = String(item).trim().toLowerCase() as StatsCardKey;
    if (!STATS_CARD_KEYS.includes(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** Default order: year → month → week → streak. */
const DEFAULT_STATS_ORDER = STATS_CARD_KEYS;

export const DASHBOARD_PRO_STATS_ORDER: StatsCardKey[] = (() => {
  const parsed = parseStatsCardKeys(rawDashboardPro.stats_order, []);
  if (parsed.length === 0) return DEFAULT_STATS_ORDER;
  // Cards omitted from the config still render — append them in default order.
  for (const key of STATS_CARD_KEYS) {
    if (!parsed.includes(key)) parsed.push(key);
  }
  return parsed;
})();

/**
 * Default: no hero. Every goal card starts as an equal grid tile, and the
 * project's own config picks which one (if any) should be emphasised.
 */
const DEFAULT_STATS_HERO: StatsCardKey[] = [];

/**
 * The single hero card, if any.
 *
 * Two rules beyond the raw config:
 * - only the first entry counts: a hero is one emphasised row, and listing
 *   several would stack full-width rows and push everything below far down;
 * - only `STATS_HERO_ALLOWED` cards qualify, so configuring `streak` here is
 *   ignored rather than producing a stretched, bad-looking row.
 */
export const DASHBOARD_PRO_STATS_HERO: StatsCardKey[] = parseStatsCardKeys(
  rawDashboardPro.stats_hero,
  DEFAULT_STATS_HERO
)
  .filter((key) => STATS_HERO_ALLOWED.includes(key))
  .slice(0, 1);

/**
 * Homepage module visibility.
 * `yearly_distance` is the pre-rename key for the bottom-right slot; map it
 * onto `month_glance` so older config.yml still works.
 */
export const DASHBOARD_PRO_MODULES: DashboardProModules = (() => {
  const raw = (rawDashboardPro.modules ??
    {}) as Partial<DashboardProModules> & {
    yearly_distance?: boolean;
  };
  const { yearly_distance, month_glance, ...rest } = raw;
  return {
    ...DEFAULT_DASHBOARD_PRO_MODULES,
    ...rest,
    month_glance:
      month_glance ??
      yearly_distance ??
      DEFAULT_DASHBOARD_PRO_MODULES.month_glance,
  };
})();

export interface AnalysisHrZonesConfig {
  method?: 'percent_lthr' | 'percent_max_hr';
  lthr_percents?: number[];
  maxhr_percents?: number[];
  prefer?: 'auto' | 'lthr' | 'device';
}

export interface AnalysisConfig {
  hr_zones?: AnalysisHrZonesConfig;
  /** Optional public default only — prefer VITE_LTHR for personal values. */
  lthr?: number;
  /** Optional public default only — prefer VITE_FTP for personal values. */
  ftp?: number;
}

interface AppConfigWithAnalysis extends AppConfig {
  analysis?: AnalysisConfig;
}

const analysisConfig = (config as AppConfigWithAnalysis).analysis;

export const ANALYSIS_HR_ZONES: AnalysisHrZonesConfig = {
  method: analysisConfig?.hr_zones?.method ?? 'percent_lthr',
  lthr_percents: analysisConfig?.hr_zones?.lthr_percents,
  maxhr_percents: analysisConfig?.hr_zones?.maxhr_percents,
  prefer: analysisConfig?.hr_zones?.prefer ?? 'device',
};

export const ANALYSIS_CONFIG_LTHR: number | null =
  analysisConfig?.lthr != null && Number.isFinite(analysisConfig.lthr)
    ? Number(analysisConfig.lthr)
    : null;

export const ANALYSIS_CONFIG_FTP: number | null =
  analysisConfig?.ftp != null && Number.isFinite(analysisConfig.ftp)
    ? Number(analysisConfig.ftp)
    : null;

function parseBirthdayMonthConfig(raw?: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec((raw ?? '').trim());
  if (!m) return null;
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? `${m[1]}-${m[2]}` : null;
}

/** Public identity from config.yml (`YYYY-MM`), or null if missing/invalid. */
export const BIRTHDAY_MONTH: string | null = parseBirthdayMonthConfig(
  (config as AppConfig).birthday_month
);
