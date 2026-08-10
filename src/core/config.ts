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

interface AppConfig {
  locale: Locale;
  theme: 'light' | 'dark' | 'system';
  theme_preset: string;
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
export const AVATAR: string = config.avatar ?? '';
export const NAV_LINKS: NavLink[] = config.nav_links ?? [];
export const BLOG_URL: string = (config.blog_url ?? '').trim();
export const GITHUB_URL: string = (config.github_url ?? '').trim();
export const MAPBOX_TOKEN: string =
  import.meta.env.VITE_MAPBOX_TOKEN ||
  import.meta.env.MAPBOX_TOKEN ||
  config.mapbox_token ||
  '';
