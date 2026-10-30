/**
 * HR / power zone resolution: FIT device zones first; else configurable
 * %LTHR (or %MaxHR estimate). Personal LTHR/FTP stay in env / local override.
 */
import type { ZoneInfo } from './splits';

export type HrZoneMethod = 'percent_lthr' | 'percent_max_hr';

/** Garmin-style %LTHR high bounds for Z1..Z5 (Z6 is above last). */
export const DEFAULT_LTHR_PERCENTS = [65, 80, 89, 95, 100] as const;

/** Fallback %MaxHR high bounds when no LTHR is available. */
export const DEFAULT_MAXHR_PERCENTS = [50, 60, 70, 80, 90, 100] as const;

export type AnalysisZoneConfig = {
  hr_method?: HrZoneMethod;
  /** Percent of LTHR for zone high boundaries (length 5 → Z1..Z5). */
  lthr_percents?: number[];
  /** Percent of max HR when estimating without LTHR. */
  maxhr_percents?: number[];
};

function numEnv(name: string): number | null {
  try {
    const raw = (import.meta as ImportMeta & { env?: Record<string, string> })
      .env?.[name];
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Personal LTHR — never commit a real value; use VITE_LTHR or config override. */
export function personalLthr(configLthr?: number | null): number | null {
  return (
    numEnv('VITE_LTHR') ??
    (configLthr != null && configLthr > 0 ? configLthr : null)
  );
}

export function personalFtp(configFtp?: number | null): number | null {
  return (
    numEnv('VITE_FTP') ??
    (configFtp != null && configFtp > 0 ? configFtp : null)
  );
}

function boundsFromPercents(anchor: number, pcts: number[]): number[] {
  return pcts.map((p) => Math.round((anchor * p) / 100));
}

/**
 * Resolve HR zones for the analysis UI.
 * 1) FIT zones with real boundaries (any calc_type) win.
 * 2) Else %LTHR from personal/config LTHR + public percent defaults.
 * 3) Else %MaxHR estimate from activity max HR (marked estimated).
 */
export function resolveHrZones(args: {
  fit?: ZoneInfo | null;
  activityMaxHr?: number | null;
  analysis?: AnalysisZoneConfig | null;
  /** Optional public/default LTHR — prefer env for personal values. */
  configLthr?: number | null;
}): { zone: ZoneInfo; estimated: boolean; source: string } | null {
  const fit = args.fit;
  if (
    fit?.high_boundary?.some((b) => b != null && b > 0) &&
    fit.seconds?.length
  ) {
    return {
      zone: fit,
      estimated: false,
      source: fit.calc_type || 'fit',
    };
  }

  const method = args.analysis?.hr_method ?? 'percent_lthr';
  const lthr = personalLthr(args.configLthr ?? fit?.threshold_hr ?? null);
  const maxHr =
    (fit?.max_hr != null && fit.max_hr > 0 ? fit.max_hr : null) ??
    (args.activityMaxHr != null && args.activityMaxHr > 0
      ? args.activityMaxHr
      : null);

  if (method === 'percent_lthr' && lthr) {
    const pcts = args.analysis?.lthr_percents?.length
      ? args.analysis.lthr_percents
      : [...DEFAULT_LTHR_PERCENTS];
    const highs = boundsFromPercents(lthr, pcts);
    // Keep FIT time-in-zone seconds when length matches; else empty placeholders.
    const seconds =
      fit?.seconds?.length === highs.length + 1
        ? fit.seconds
        : fit?.seconds?.length === highs.length
          ? fit.seconds
          : Array.from({ length: highs.length + 1 }, () => 0);
    return {
      zone: {
        seconds,
        high_boundary: highs,
        calc_type: 'percent_lthr',
        max_hr: maxHr,
        threshold_hr: lthr,
        resting_hr: fit?.resting_hr ?? null,
      },
      estimated: !fit?.seconds?.length,
      source: 'percent_lthr',
    };
  }

  if (!maxHr)
    return fit?.seconds?.length
      ? { zone: fit, estimated: true, source: fit.calc_type || 'fit' }
      : null;

  const pcts = args.analysis?.maxhr_percents?.length
    ? args.analysis.maxhr_percents
    : [...DEFAULT_MAXHR_PERCENTS];
  const highs = boundsFromPercents(maxHr, pcts);
  const seconds =
    fit?.seconds?.length === highs.length
      ? fit.seconds
      : Array.from({ length: highs.length }, () => 0);
  return {
    zone: {
      seconds,
      high_boundary: highs,
      calc_type: 'percent_max_hr_estimated',
      max_hr: maxHr,
      threshold_hr: lthr,
      resting_hr: fit?.resting_hr ?? null,
    },
    estimated: true,
    source: 'percent_max_hr_estimated',
  };
}

/** Power zones: FIT only — never invent. */
export function resolvePowerZones(fit?: ZoneInfo | null): ZoneInfo | null {
  if (!fit?.seconds?.length) return null;
  if (!fit.high_boundary?.some((b) => b != null && b > 0) && !fit.ftp) {
    // Time-in-zone without bounds is still useful as a bar; keep it.
    return fit;
  }
  return fit;
}
