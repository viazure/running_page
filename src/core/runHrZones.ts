/**
 * HR / power zone resolution: site %LTHR table when a personal LTHR is
 * available; otherwise real device time-in-zone, then a %MaxHR estimate.
 * Personal LTHR / max HR stay in env (VITE_LTHR / VITE_MAX_HR).
 */
import type { ZoneInfo } from './splits';

export type HrZoneMethod = 'percent_lthr' | 'percent_max_hr';
export type HrZonePrefer = 'auto' | 'lthr' | 'device';

/** High bounds from <Z1 upward: <Z1≤65%, Z1 65–80%, …, Z5 100–107%, then >Z5. */
export const DEFAULT_LTHR_PERCENTS = [65, 80, 89, 95, 100, 107] as const;

/** Fallback %MaxHR high bounds when no LTHR is available. */
export const DEFAULT_MAXHR_PERCENTS = [50, 60, 70, 80, 90, 100] as const;

const CHART_DT_MAX_S = 120;
const CHART_MIN_TOTAL_S = 30;
const BOUND_TOLERANCE_BPM = 1;

export type AnalysisZoneConfig = {
  method?: HrZoneMethod;
  /** @deprecated typo alias — accepted so older callers still work. */
  hr_method?: HrZoneMethod;
  /** Percent of LTHR for each high bound, starting at <Z1. */
  lthr_percents?: number[];
  /** Percent of max HR when estimating without LTHR. */
  maxhr_percents?: number[];
  /**
   * device (default): keep real device time-in-zone; rebin estimates when LTHR is set.
   * auto: rebin estimates; reuse device seconds only when bounds match, else rebin.
   * lthr: always rebin when a heart-rate series exists.
   */
  prefer?: HrZonePrefer;
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

/** Personal LTHR — never commit a real value; use VITE_LTHR or a local override. */
export function personalLthr(configLthr?: number | null): number | null {
  return (
    numEnv('VITE_LTHR') ??
    (configLthr != null && configLthr > 0 ? configLthr : null)
  );
}

/** Personal max HR — VITE_MAX_HR only; used to cap the last %LTHR bound (Z5). */
export function personalMaxHr(override?: number | null): number | null {
  return (
    numEnv('VITE_MAX_HR') ??
    (override != null && override > 0 ? override : null)
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

export function lthrHighBounds(
  lthr: number,
  pcts: number[],
  maxHrCap?: number | null
): number[] {
  const highs = boundsFromPercents(lthr, pcts);
  if (
    maxHrCap != null &&
    maxHrCap > 0 &&
    pcts.length > 0 &&
    pcts[pcts.length - 1] > 100
  ) {
    highs[highs.length - 1] = Math.round(maxHrCap);
  }
  return highs;
}

function zoneMethod(analysis?: AnalysisZoneConfig | null): HrZoneMethod {
  return analysis?.method ?? analysis?.hr_method ?? 'percent_lthr';
}

function zonePrefer(analysis?: AnalysisZoneConfig | null): HrZonePrefer {
  return analysis?.prefer ?? 'device';
}

/** Device session time-in-zone: has bounds + seconds, and is not an estimate. */
export function isDeviceHrZone(fit?: ZoneInfo | null): boolean {
  if (!fit?.high_boundary?.some((b) => b != null && b > 0)) return false;
  if (!fit.seconds?.length) return false;
  return !isEstimatedHrZone(fit);
}

export function isEstimatedHrZone(fit?: ZoneInfo | null): boolean {
  return /estimated|derived/i.test(fit?.calc_type ?? '');
}

export function hrZoneBoundsMatch(
  device: (number | null)[] | null | undefined,
  site: number[],
  thresholdHr?: number | null,
  lthr?: number | null,
  tolerance = BOUND_TOLERANCE_BPM
): boolean {
  if (!device?.length || device.length !== site.length) return false;
  for (let i = 0; i < site.length; i++) {
    const b = device[i];
    if (b == null || !Number.isFinite(b) || Math.abs(b - site[i]) > tolerance) {
      return false;
    }
  }
  if (
    thresholdHr != null &&
    thresholdHr > 0 &&
    lthr != null &&
    lthr > 0 &&
    Math.abs(thresholdHr - lthr) > tolerance
  ) {
    return false;
  }
  return true;
}

function chartDt(t: number[], i: number): number {
  if (i + 1 < t.length) return t[i + 1] - t[i];
  if (i > 0) return t[i] - t[i - 1];
  return 0;
}

/**
 * Time-weighted HR zones from the downsampled chart.
 * Uses the same dt rules as paceZonesFromChart (skip dt ≤ 0 or dt > 120s).
 */
export function hrZonesFromChart(
  hr: (number | null)[] | undefined,
  t: number[] | undefined,
  highs: number[]
): number[] | null {
  if (!hr || !t || !highs.length || t.length !== hr.length || hr.length < 2) {
    return null;
  }
  const secs = Array.from({ length: highs.length + 1 }, () => 0);
  for (let i = 0; i < hr.length; i++) {
    const v = hr[i];
    if (v == null || !Number.isFinite(v) || v <= 0) continue;
    const dt = chartDt(t, i);
    if (dt <= 0 || dt > CHART_DT_MAX_S) continue;
    let z = highs.length;
    for (let b = 0; b < highs.length; b++) {
      if (v <= highs[b]) {
        z = b;
        break;
      }
    }
    secs[z] += dt;
  }
  const total = secs.reduce((a, b) => a + b, 0);
  if (total < CHART_MIN_TOTAL_S) return null;
  return secs.map((s) => Math.round(s));
}

function reuseDeviceSeconds(fit: ZoneInfo, highs: number[]): number[] | null {
  const s = fit.seconds;
  if (!s?.length) return null;
  if (s.length === highs.length + 1) return s;
  if (s.length === highs.length) return [...s, 0];
  return null;
}

function lthrZone(
  highs: number[],
  seconds: number[],
  lthr: number,
  maxHr: number | null,
  fit?: ZoneInfo | null
): ZoneInfo {
  return {
    seconds,
    high_boundary: highs,
    calc_type: 'percent_lthr',
    max_hr: maxHr,
    threshold_hr: lthr,
    resting_hr: fit?.resting_hr ?? null,
  };
}

function resolveLthrZone(args: {
  fit?: ZoneInfo | null;
  highs: number[];
  lthr: number;
  maxHr: number | null;
  prefer: HrZonePrefer;
  hr?: (number | null)[];
  t?: number[];
}): { zone: ZoneInfo; estimated: boolean; source: string } | null {
  const { fit, highs, lthr, maxHr, prefer } = args;
  const rebinned = hrZonesFromChart(args.hr, args.t, highs);
  const device = isDeviceHrZone(fit);
  const consistent =
    device &&
    hrZoneBoundsMatch(fit?.high_boundary, highs, fit?.threshold_hr, lthr);
  const reused = consistent && fit ? reuseDeviceSeconds(fit, highs) : null;

  if (prefer === 'device' && device && fit) {
    return {
      zone: fit,
      estimated: false,
      source: fit.calc_type || 'fit',
    };
  }

  if (prefer === 'lthr') {
    if (rebinned) {
      return {
        zone: lthrZone(highs, rebinned, lthr, maxHr, fit),
        estimated: false,
        source: 'percent_lthr',
      };
    }
    if (reused) {
      return {
        zone: lthrZone(highs, reused, lthr, maxHr, fit),
        estimated: false,
        source: 'percent_lthr',
      };
    }
    return null;
  }

  // auto, and estimated under prefer:device (device branch already returned)
  if (device && reused) {
    return {
      zone: lthrZone(highs, reused, lthr, maxHr, fit),
      estimated: false,
      source: 'percent_lthr',
    };
  }
  if (rebinned) {
    return {
      zone: lthrZone(highs, rebinned, lthr, maxHr, fit),
      estimated: false,
      source: 'percent_lthr',
    };
  }
  // No series (or too short): never paste old seconds onto new LTHR bounds.
  return null;
}

/**
 * Resolve HR zones for the analysis UI.
 * 1) With LTHR and method percent_lthr: keep real device time-in-zone
 *    (default prefer:device). Estimates are rebinned to the site table.
 *    prefer:auto also rebins a device zone when its bounds do not match.
 * 2) Else real device time-in-zone (not estimates).
 * 3) Else %MaxHR estimate from activity max HR (marked estimated).
 */
export function resolveHrZones(args: {
  fit?: ZoneInfo | null;
  activityMaxHr?: number | null;
  analysis?: AnalysisZoneConfig | null;
  /** Optional public/default LTHR — prefer env for personal values. */
  configLthr?: number | null;
  /** Test hook / optional cap; VITE_MAX_HR wins when set. */
  maxHr?: number | null;
  hr?: (number | null)[] | null;
  t?: number[] | null;
}): { zone: ZoneInfo; estimated: boolean; source: string } | null {
  const fit = args.fit;
  const method = zoneMethod(args.analysis);
  const prefer = zonePrefer(args.analysis);
  const lthr = personalLthr(args.configLthr ?? fit?.threshold_hr ?? null);
  const maxHrCap = personalMaxHr(args.maxHr);
  const activityMaxHr =
    (fit?.max_hr != null && fit.max_hr > 0 ? fit.max_hr : null) ??
    (args.activityMaxHr != null && args.activityMaxHr > 0
      ? args.activityMaxHr
      : null);
  const displayMaxHr = maxHrCap ?? activityMaxHr;
  const hr = args.hr ?? undefined;
  const t = args.t ?? undefined;

  if (method === 'percent_lthr' && lthr) {
    const pcts = args.analysis?.lthr_percents?.length
      ? args.analysis.lthr_percents
      : [...DEFAULT_LTHR_PERCENTS];
    const highs = lthrHighBounds(lthr, pcts, maxHrCap);
    return resolveLthrZone({
      fit,
      highs,
      lthr,
      maxHr: displayMaxHr,
      prefer,
      hr: hr ?? undefined,
      t: t ?? undefined,
    });
  }

  if (isDeviceHrZone(fit) && fit) {
    return {
      zone: fit,
      estimated: false,
      source: fit.calc_type || 'fit',
    };
  }

  if (
    isEstimatedHrZone(fit) &&
    fit?.high_boundary?.some((b) => b != null && b > 0) &&
    fit.seconds?.length
  ) {
    return {
      zone: fit,
      estimated: true,
      source: fit.calc_type || 'percent_max_hr_estimated',
    };
  }

  const maxHr = displayMaxHr;
  if (!maxHr)
    return fit?.seconds?.length
      ? { zone: fit, estimated: true, source: fit.calc_type || 'fit' }
      : null;

  const pcts = args.analysis?.maxhr_percents?.length
    ? args.analysis.maxhr_percents
    : [...DEFAULT_MAXHR_PERCENTS];
  const highs = boundsFromPercents(maxHr, pcts);
  const rebinned = hrZonesFromChart(hr ?? undefined, t ?? undefined, highs);
  const seconds =
    rebinned ??
    (fit?.seconds?.length === highs.length
      ? fit.seconds
      : fit?.seconds?.length === highs.length + 1
        ? fit.seconds
        : null);
  if (!seconds) {
    return {
      zone: {
        seconds: Array.from({ length: highs.length }, () => 0),
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
  // Avoid inventing an all-zero table when we had to pad placeholders.
  if (!seconds.some((s) => s > 0) && !rebinned) {
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
