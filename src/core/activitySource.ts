import type { Locale } from './i18n';

/** Known sync / file sources → [zh, en] display labels. */
const SOURCE_LABELS: Record<string, [string, string]> = {
  garmin: ['Garmin 佳明', 'Garmin'],
  strava: ['Strava', 'Strava'],
  codoon: ['咕咚', 'Codoon'],
  komoot: ['Komoot', 'Komoot'],
  nike: ['Nike Run Club', 'Nike Run Club'],
  keep: ['Keep', 'Keep'],
  coros: ['高驰 COROS', 'COROS'],
  suunto: ['颂拓 Suunto', 'Suunto'],
  polar: ['Polar', 'Polar'],
  apple: ['Apple', 'Apple'],
  oppo: ['OPPO', 'OPPO'],
  gpx: ['GPX', 'GPX'],
  tcx: ['TCX', 'TCX'],
  fit: ['FIT', 'FIT'],
};

/**
 * FIT `garmin_product` / product_name tokens as written by the SDK
 * (e.g. fr255, fenix7x). Used only to infer brand — never expanded to a
 * marketing name.
 */
const GARMIN_DEVICE_RE =
  /^(fr\d|fenix|epix|venu|vivo|instinct|enduro|approach|edge|tactix|marq|quatix|descent|lily|swim|forerunner|garmin)/i;

function pick(locale: Locale, zh: string, en: string): string {
  return locale === 'zh' ? zh : en;
}

function normalizeKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, ' ');
}

/** Map a raw activity/sync source string to a locale-aware label. */
export function formatActivitySourceLabel(
  raw: string,
  locale: Locale = 'zh'
): string {
  const key = normalizeKey(raw);
  if (!key) return raw.trim();
  const compact = key.replace(/\s+/g, '');
  for (const [id, [zh, en]] of Object.entries(SOURCE_LABELS)) {
    if (compact === id || compact.startsWith(id) || key.includes(id)) {
      return pick(locale, zh, en);
    }
  }
  // Unknown sync label: keep as provided (e.g. Oppo deviceName).
  return raw.trim();
}

export function looksLikeGarminDevice(
  device: string | null | undefined
): boolean {
  if (!device) return false;
  const d = device.trim();
  if (!d || d === 'preview-fabricated' || d === 'sample') return false;
  return GARMIN_DEVICE_RE.test(d);
}

/**
 * Resolve analysis-header source label.
 * Prefer activity.source when present; else splits.source; else infer Garmin
 * from FIT device tokens. Returns null when nothing better than a generic
 * FIT filler is known.
 */
export function resolveAnalysisSourceLabel(
  activitySource: string | null | undefined,
  splitsSource: string | null | undefined,
  device: string | null | undefined,
  locale: Locale = 'zh'
): string | null {
  const fromActivity = activitySource?.trim();
  if (fromActivity) return formatActivitySourceLabel(fromActivity, locale);

  const fromSplits = splitsSource?.trim();
  if (fromSplits && fromSplits.toLowerCase() !== 'fit') {
    return formatActivitySourceLabel(fromSplits, locale);
  }

  if (looksLikeGarminDevice(device)) {
    return pick(locale, 'Garmin 佳明', 'Garmin');
  }
  return null;
}
