import type { Locale } from './i18n';

/** Brand / sync / file-kind labels → [zh, en]. */
const SOURCE_LABELS: Record<string, [string, string]> = {
  garmin: ['Garmin 佳明', 'Garmin'],
  strava: ['Strava', 'Strava'],
  codoon: ['咕哮', 'Codoon'],
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

function pick(locale: Locale, zh: string, en: string): string {
  return locale === 'zh' ? zh : en;
}

function normalizeKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, ' ');
}

/** Map a raw brand / sync / file-kind string to a locale-aware label. */
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
  return raw.trim();
}

/** FIT file_id.manufacturer → display label, or null if absent. */
export function formatManufacturerLabel(
  manufacturer: string | null | undefined,
  locale: Locale = 'zh'
): string | null {
  const raw = manufacturer?.trim();
  if (!raw) return null;
  return formatActivitySourceLabel(raw, locale);
}

/**
 * Brand / source line for the analysis header.
 *
 * Prefer FIT `manufacturer` from splits (hardware brand written in the file).
 * Else `activity.source` when the sync pipeline recorded one.
 * Else file-kind from `splits.source` (gpx/tcx/fit) — a file type, not a brand.
 *
 * Never infer brand from device tokens alone (fr255 ≠ Garmin sync source).
 */
export function resolveAnalysisBrandLabel(
  manufacturer: string | null | undefined,
  activitySource: string | null | undefined,
  splitsSource: string | null | undefined,
  locale: Locale = 'zh'
): string | null {
  const fromMfr = formatManufacturerLabel(manufacturer, locale);
  if (fromMfr) return fromMfr;

  const fromActivity = activitySource?.trim();
  if (fromActivity) return formatActivitySourceLabel(fromActivity, locale);

  const fromSplits = splitsSource?.trim();
  if (fromSplits) return formatActivitySourceLabel(fromSplits, locale);

  return null;
}
