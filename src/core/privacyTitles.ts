import type { Activity } from './types';
import type { Locale } from './i18n';

const TITLES = {
  zh: {
    half: '半程马拉松',
    full: '全程马拉松',
    morning: '清晨跑步',
    midday: '午间跑步',
    afternoon: '午后跑步',
    evening: '傍晚跑步',
    night: '夜晚跑步',
    run: '跑步',
    ride: '骑行',
  },
  en: {
    half: 'Half Marathon',
    full: 'Full Marathon',
    morning: 'Morning Run',
    midday: 'Midday Run',
    afternoon: 'Afternoon Run',
    evening: 'Evening Run',
    night: 'Night Run',
    run: 'Run',
    ride: 'Ride',
  },
} as const;

/** Locale-aware anonymous activity title (morning/noon/… run). */
export function privacyActivityTitle(
  activity: Activity,
  locale: Locale = 'zh'
): string {
  const t = TITLES[locale] ?? TITLES.zh;
  if (activity.type && activity.type !== 'Run') {
    if (activity.type === 'Ride') return t.ride;
    return activity.type;
  }
  const km = activity.distance / 1000;
  const hour = +activity.start_date_local.slice(11, 13);
  if (km > 20 && km < 40) return t.half;
  if (km >= 40) return t.full;
  // Everyday Chinese sense: 傍晚 ≈ sunset window; 20:00+ is 夜晚
  if (hour >= 5 && hour <= 10) return t.morning;
  if (hour >= 11 && hour <= 13) return t.midday;
  if (hour >= 14 && hour <= 17) return t.afternoon;
  if (hour >= 18 && hour <= 19) return t.evening;
  return t.night;
}

/**
 * Display title for lists / profile.
 * anonymous=true → period titles; otherwise activity.name, with period fallback if empty.
 */
export function resolveActivityTitle(
  activity: Activity,
  locale: Locale = 'zh',
  anonymous = false
): string {
  if (anonymous) return privacyActivityTitle(activity, locale);
  const name = activity.name?.trim();
  if (name) return name;
  return privacyActivityTitle(activity, locale);
}
