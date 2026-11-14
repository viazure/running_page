/**
 * HR / power zone resolution.
 * Priority: real device time-in-zone, then site %LTHR rebin, then
 * 220−age from config.yml birthday_month. Never use this activity's
 * peak HR, and never use VITE_MAX_HR as the 100% anchor without LTHR.
 * Personal LTHR / max HR stay in env (VITE_LTHR / VITE_MAX_HR).
 */
import type { ZoneInfo } from './splits';

export type HrZoneMethod = 'percent_lthr' | 'percent_max_hr';
export type HrZonePrefer = 'auto' | 'lthr' | 'device';
export type HrZoneSource = 'device' | 'lthr' | 'maxhr_age' | 'none';
export type HrZoneEmptyReason = 'no_baseline' | 'no_hr_data';

export type ResolvedHrZones = {
  zone: ZoneInfo | null;
  estimated: boolean;
  source: HrZoneSource;
  emptyReason?: HrZoneEmptyReason;
};

/** High bounds from <Z1 upward: <Z1≤65%, Z1 65–80%, …, Z5 100–107%, then >Z5. */
export const DEFAULT_LTHR_PERCENTS = [65, 80, 89, 95, 100, 107] as const;

/** Fallback %MaxHR high bounds when estimating from age (no LTHR). */
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
  /** Percent of estimated max HR (220−age) when no LTHR is available. */
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

function none(reason: HrZoneEmptyReason): ResolvedHrZones {
  return {
    zone: null,
    estimated: false,
    source: 'none',
    emptyReason: reason,
  };
}

/** Public identity `YYYY-MM` from config.yml; missing day is treated as the 1st. */
export function parseBirthdayMonth(
  raw?: string | null
): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec((raw ?? '').trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  return { year, month };
}

/** Calendar date `YYYY-MM-DD`, optionally followed by a time. */
export function parseActivityDate(
  raw?: string | null
): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((raw ?? '').trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (
    !Number.isFinite(year) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  return { year, month, day };
}

/**
 * Age in whole years on the activity date, not today.
 * birthday_month uses day 1 of that month.
 */
export function ageOnActivityDate(
  birthdayMonth?: string | null,
  activityDate?: string | null
): number | null {
  const born = parseBirthdayMonth(birthdayMonth);
  const on = parseActivityDate(activityDate);
  if (!born || !on) return null;
  let age = on.year - born.year;
  if (on.month < born.month || (on.month === born.month && on.day < 1)) {
    age -= 1;
  }
  if (age <= 0 || age >= 220) return null;
  return age;
}

/** 220−age. A later defaultMaxHeartRate hook would sit just before this. */
export function estimatedMaxHrFromAge(age: number): number {
  return 220 - age;
}

export function estimatedMaxHrFromBirthday(
  birthdayMonth?: string | null,
  activityDate?: string | null
): number | null {
  const age = ageOnActivityDate(birthdayMonth, activityDate);
  if (age == null) return null;
  const maxHr = estimatedMaxHrFromAge(age);
  return maxHr > 0 ? maxHr : null;
}

function resolveLthrRebin(args: {
  fit?: ZoneInfo | null;
  highs: number[];
  lthr: number;
  maxHr: number | null;
  prefer: HrZonePrefer;
  hr?: (number | null)[];
  t?: number[];
}): ResolvedHrZones {
  const { fit, highs, lthr, maxHr, prefer } = args;
  const rebinned = hrZonesFromChart(args.hr, args.t, highs);
  const device = isDeviceHrZone(fit);
  const consistent =
    device &&
    hrZoneBoundsMatch(fit?.high_boundary, highs, fit?.threshold_hr, lthr);
  const reused = consistent && fit ? reuseDeviceSeconds(fit, highs) : null;

  if (prefer === 'lthr') {
    if (rebinned) {
      return {
        zone: lthrZone(highs, rebinned, lthr, maxHr, fit),
        estimated: false,
        source: 'lthr',
      };
    }
    if (reused) {
      return {
        zone: lthrZone(highs, reused, lthr, maxHr, fit),
        estimated: false,
        source: 'lthr',
      };
    }
    return none('no_hr_data');
  }

  // auto (device + matching bounds already returned as source:device)
  if (device && reused) {
    return {
      zone: lthrZone(highs, reused, lthr, maxHr, fit),
      estimated: false,
      source: 'lthr',
    };
  }
  if (rebinned) {
    return {
      zone: lthrZone(highs, rebinned, lthr, maxHr, fit),
      estimated: false,
      source: 'lthr',
    };
  }
  return none('no_hr_data');
}

/**
 * Resolve HR zones for the analysis UI.
 * 1) Real device time-in-zone (not percent_max_hr_estimated).
 * 2) With LTHR and method percent_lthr: rebin chart.hr to the site table.
 *    VITE_MAX_HR only corrects the Z5 high bound; source stays lthr.
 * 3) Else 220−age from birthday_month vs the activity date (source maxhr_age).
 *    Skip VITE_MAX_HR and this activity's peak HR.
 * 4) Else source none — no all-zero placeholder chart.
 */
export function resolveHrZones(args: {
  fit?: ZoneInfo | null;
  analysis?: AnalysisZoneConfig | null;
  /** Optional public/default LTHR — prefer env for personal values. */
  configLthr?: number | null;
  /** Test hook / optional Z5 cap; VITE_MAX_HR wins when set. Ignored without LTHR. */
  maxHr?: number | null;
  hr?: (number | null)[] | null;
  t?: number[] | null;
  /** Public identity from config.yml, `YYYY-MM`. */
  birthdayMonth?: string | null;
  /** Activity start date (`YYYY-MM-DD` or local datetime), not today. */
  activityDate?: string | null;
}): ResolvedHrZones {
  const fit = args.fit;
  const method = zoneMethod(args.analysis);
  const prefer = zonePrefer(args.analysis);
  const lthr = personalLthr(args.configLthr ?? fit?.threshold_hr ?? null);
  const maxHrCap = personalMaxHr(args.maxHr);
  const hr = args.hr ?? undefined;
  const t = args.t ?? undefined;
  const device = isDeviceHrZone(fit);

  const lthrPcts = args.analysis?.lthr_percents?.length
    ? args.analysis.lthr_percents
    : [...DEFAULT_LTHR_PERCENTS];
  const lthrHighs =
    method === 'percent_lthr' && lthr
      ? lthrHighBounds(lthr, lthrPcts, maxHrCap)
      : null;

  const mustRebinDevice =
    Boolean(device && lthr && lthrHighs) &&
    (prefer === 'lthr' ||
      (prefer === 'auto' &&
        !hrZoneBoundsMatch(
          fit?.high_boundary,
          lthrHighs!,
          fit?.threshold_hr,
          lthr
        )));

  if (device && fit && !mustRebinDevice) {
    return { zone: fit, estimated: false, source: 'device' };
  }

  if (method === 'percent_lthr' && lthr && lthrHighs) {
    return resolveLthrRebin({
      fit,
      highs: lthrHighs,
      lthr,
      maxHr: maxHrCap,
      prefer,
      hr,
      t,
    });
  }

  // No LTHR: skip VITE_MAX_HR / activity peak. Age estimate only.
  // A defaultMaxHeartRate hook would be inserted here, before 220−age.
  const ageMaxHr = estimatedMaxHrFromBirthday(
    args.birthdayMonth,
    args.activityDate
  );
  if (ageMaxHr) {
    const pcts = args.analysis?.maxhr_percents?.length
      ? args.analysis.maxhr_percents
      : [...DEFAULT_MAXHR_PERCENTS];
    const highs = boundsFromPercents(ageMaxHr, pcts);
    const rebinned = hrZonesFromChart(hr, t, highs);
    if (!rebinned) return none('no_hr_data');
    return {
      zone: {
        seconds: rebinned,
        high_boundary: highs,
        calc_type: 'percent_max_hr_age_estimated',
        max_hr: ageMaxHr,
        threshold_hr: null,
        resting_hr: fit?.resting_hr ?? null,
      },
      estimated: true,
      source: 'maxhr_age',
    };
  }

  return none('no_baseline');
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
