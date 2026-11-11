/**
 * Pure aggregators for dashboard_pro Summary.
 * Presenters must not recompute pace denominators in JSX.
 */

import type { Activity } from '../../../core/types';
import type {
  ActivitySummaryV1,
  CoverageStatus,
  DaySlot,
  PaceBlock,
  SliceStats,
  VolumeBucket,
  YtdCompare,
} from './activitySummaryV1';

/**
 * Local moving-time parser (aligned with parseMovingTime for H:MM:SS / MM:SS).
 * Kept in-module so Node tests need no Vite `@/` alias or React hook graph.
 */
export function movingTimeSec(
  time: string | number | undefined | null
): number {
  if (time == null || time === '') return 0;
  if (typeof time === 'number') return Number.isFinite(time) ? time : 0;
  let str = String(time).trim();
  let extra = 0;
  if (str.includes('day')) {
    const dayMatch = str.match(/(\d+)\s+day/);
    if (dayMatch) extra += parseInt(dayMatch[1], 10) * 86400;
    str = str.split(',').pop()?.trim() || str;
  }
  if (str.includes(' ')) {
    const parts = str.split(' ');
    const datePart = parts[0];
    str = parts[1] ?? str;
    const dc = datePart.split('-');
    if (dc.length === 3) {
      const dayNum = parseInt(dc[2], 10);
      if (!Number.isNaN(dayNum) && dayNum > 1) extra += (dayNum - 1) * 86400;
    }
  }
  if (str.includes('.')) str = str.split('.')[0];
  const parts = str.split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return 0;
  let seconds = 0;
  if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  else if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
  else if (parts.length === 1) seconds = parts[0];
  return seconds + extra;
}

const PACE_BLOCKS: Omit<
  PaceBlock,
  'n' | 'weightedPaceSecPerKm' | 'insufficient_sample'
>[] = [
  {
    id: '5k',
    labelZh: '5K',
    labelEn: '5K',
    minM: 4500,
    maxM: 5500,
  },
  {
    id: '10k',
    labelZh: '10K',
    labelEn: '10K',
    minM: 9500,
    maxM: 10500,
  },
  {
    id: 'half',
    labelZh: '半马',
    labelEn: 'Half marathon',
    minM: 20000,
    maxM: 22000,
  },
  {
    id: 'full',
    labelZh: '全马',
    labelEn: 'Full marathon',
    minM: 41000,
    maxM: 44000,
  },
];

export function localDateKey(a: Activity): string {
  return a.start_date_local.slice(0, 10);
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

/** Local calendar "today" as YYYY-MM-DD (viewer clock; activities use local keys). */
export function todayLocalKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function filterL0(
  activities: Activity[],
  sportFilter: 'Run' = 'Run'
): Activity[] {
  return activities.filter((a) => {
    if (sportFilter === 'Run' && a.type !== 'Run') return false;
    const date = localDateKey(a);
    if (!date || date.length < 10) return false;
    if (!Number.isFinite(a.distance)) return false;
    if (a.moving_time == null || a.moving_time === '') return false;
    if (!a.type) return false;
    return true;
  });
}

/** Pace-valid set: distance > 0 and moving_time > 0. */
export function isPaceValid(a: Activity): boolean {
  if (!(a.distance > 0)) return false;
  return movingTimeSec(a.moving_time) > 0;
}

/**
 * Weighted pace (sec/km): Σmoving_time / Σdistance * 1000.
 * Never arithmetic-mean per-activity paces. Fractional seconds accumulate first.
 */
export function weightedPaceSeconds(activities: Activity[]): number | null {
  let dist = 0;
  let time = 0;
  for (const a of activities) {
    if (!isPaceValid(a)) continue;
    dist += a.distance;
    time += movingTimeSec(a.moving_time);
  }
  if (dist <= 0 || time <= 0) return null;
  return (time / dist) * 1000;
}

export function buildSliceStats(activities: Activity[]): SliceStats {
  let distanceM = 0;
  let moving = 0;
  const days = new Set<string>();
  for (const a of activities) {
    distanceM += a.distance;
    moving += movingTimeSec(a.moving_time);
    days.add(localDateKey(a));
  }
  return {
    distanceM,
    movingTimeSec: moving,
    runCount: activities.length,
    activeDays: days.size,
    weightedPaceSecPerKm: weightedPaceSeconds(activities),
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Enumerate local calendar days for a year (365 or 366). */
export function enumerateYearDates(year: number): string[] {
  const out: string[] = [];
  const start = new Date(year, 0, 1, 12, 0, 0);
  const end = new Date(year, 11, 31, 12, 0, 0);
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    const d = new Date(t);
    out.push(
      `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    );
  }
  return out;
}

/**
 * 365/366 day slots. Uncovered / future days → km null (no fake 0 line).
 * Covered rest days → 0.
 */
export function buildLocalDaySlots(
  year: number,
  activities: Activity[],
  opts: {
    asOf?: string;
    firstCovered?: string | null;
    lastCovered?: string | null;
  } = {}
): DaySlot[] {
  const byDay = new Map<string, number>();
  for (const a of activities) {
    const key = localDateKey(a);
    if (!key.startsWith(String(year))) continue;
    byDay.set(key, (byDay.get(key) ?? 0) + a.distance / 1000);
  }

  const dates = enumerateYearDates(year);
  const asOf = opts.asOf;
  const first = opts.firstCovered ?? null;
  const last = opts.lastCovered ?? null;

  return dates.map((date) => {
    if (asOf && date > asOf) {
      return { date, km: null };
    }
    if (first && date < first) {
      return { date, km: null };
    }
    if (last && date > last && (!asOf || date <= asOf)) {
      // After last known activity but still before asOf → gap / unknown
      // Only mark null when we know coverage ends early (imported / partial).
      if (opts.lastCovered != null && date > opts.lastCovered) {
        return { date, km: null };
      }
    }
    if (byDay.has(date)) {
      return { date, km: Math.round(byDay.get(date)! * 100) / 100 };
    }
    // Inside covered window with no run → rest day 0
    if (first && last && date >= first && date <= last) {
      return { date, km: 0 };
    }
    if (!first && !last) {
      return { date, km: null };
    }
    return { date, km: null };
  });
}

function inferCoverage(
  year: number,
  yearActivities: Activity[],
  asOf: string | null,
  firstDate: string | null
): { coverage: CoverageStatus; endedYearImported: boolean } {
  if (!yearActivities.length) {
    return { coverage: 'unknown', endedYearImported: false };
  }
  const startsJan1 = firstDate === `${year}-01-01`;
  const yearOngoing = asOf != null && asOf.startsWith(String(year));
  if (!startsJan1) {
    return { coverage: 'partial', endedYearImported: true };
  }
  if (yearOngoing) {
    return { coverage: 'partial', endedYearImported: false };
  }
  return { coverage: 'complete', endedYearImported: false };
}

function inYtdWindow(date: string, year: number, ytdEnd: string): boolean {
  if (!date.startsWith(String(year))) return false;
  const md = date.slice(5, 10);
  return md <= ytdEnd;
}

export function buildYearYtdCompare(
  activities: Activity[],
  anchorYear: number,
  asOfDate: string
): YtdCompare {
  const asOfYear = Number(asOfDate.slice(0, 4));
  const ytdEnd = asOfYear === anchorYear ? asOfDate.slice(5, 10) : '12-31';
  const priorYear = anchorYear - 1;

  const currentActs = activities.filter((a) =>
    inYtdWindow(localDateKey(a), anchorYear, ytdEnd)
  );
  const priorActs = activities.filter((a) =>
    inYtdWindow(localDateKey(a), priorYear, ytdEnd)
  );

  const current = buildSliceStats(currentActs);
  const prior = buildSliceStats(priorActs);

  const paceDelta =
    current.weightedPaceSecPerKm != null && prior.weightedPaceSecPerKm != null
      ? current.weightedPaceSecPerKm - prior.weightedPaceSecPerKm
      : null;

  return {
    anchorYear,
    priorYear,
    ytdEnd,
    current,
    prior,
    deltas: {
      distanceM: current.distanceM - prior.distanceM,
      runCount: current.runCount - prior.runCount,
      activeDays: current.activeDays - prior.activeDays,
      weightedPaceSecPerKm: paceDelta,
    },
  };
}

export function buildPaceBlocks(activities: Activity[]): PaceBlock[] {
  return PACE_BLOCKS.map((def) => {
    const hits = activities.filter(
      (a) => a.distance >= def.minM && a.distance <= def.maxM && isPaceValid(a)
    );
    const n = hits.length;
    return {
      ...def,
      n,
      weightedPaceSecPerKm: weightedPaceSeconds(hits),
      insufficient_sample: n < 3,
    };
  });
}

export function buildMonthVolumeBuckets(
  activities: Activity[],
  year: number,
  locale: string
): VolumeBucket[] {
  const buckets = Array.from({ length: 12 }, (_, i) => ({
    key: pad2(i + 1),
    label: locale === 'zh' ? `${i + 1}月` : String(i + 1),
    hoursSec: 0,
    km: 0,
  }));
  for (const a of activities) {
    const key = localDateKey(a);
    if (!key.startsWith(String(year))) continue;
    const m = Number(key.slice(5, 7)) - 1;
    if (m < 0 || m > 11) continue;
    buckets[m].hoursSec += movingTimeSec(a.moving_time);
    buckets[m].km += a.distance / 1000;
  }
  return buckets.map((b) => ({
    key: b.key,
    label: b.label,
    hours: Math.round((b.hoursSec / 3600) * 10) / 10,
    km: Math.round(b.km * 10) / 10,
  }));
}

export function buildDayVolumeBuckets(
  activities: Activity[],
  yearMonth: string
): VolumeBucket[] {
  const y = Number(yearMonth.slice(0, 4));
  const m = Number(yearMonth.slice(5, 7));
  const daysInMonth = new Date(y, m, 0).getDate();
  const buckets = Array.from({ length: daysInMonth }, (_, i) => ({
    key: pad2(i + 1),
    label: String(i + 1),
    hoursSec: 0,
    km: 0,
  }));
  for (const a of activities) {
    const key = localDateKey(a);
    if (!key.startsWith(yearMonth)) continue;
    const d = Number(key.slice(8, 10)) - 1;
    if (d < 0 || d >= daysInMonth) continue;
    buckets[d].hoursSec += movingTimeSec(a.moving_time);
    buckets[d].km += a.distance / 1000;
  }
  return buckets.map((b) => ({
    key: b.key,
    label: b.label,
    hours: Math.round((b.hoursSec / 3600) * 10) / 10,
    km: Math.round(b.km * 10) / 10,
  }));
}

/** Month bar chart: km by day (same shape as summaryChart month). */
export function buildMonthBarSeries(
  activities: Activity[],
  yearMonth: string
): { label: string; km: number | null }[] {
  const buckets = buildDayVolumeBuckets(activities, yearMonth);
  const first = activities
    .map(localDateKey)
    .filter((d) => d.startsWith(yearMonth))
    .sort()[0];
  const last = activities
    .map(localDateKey)
    .filter((d) => d.startsWith(yearMonth))
    .sort()
    .at(-1);
  return buckets.map((b) => {
    const date = `${yearMonth}-${b.key}`;
    if (!first) return { label: b.label, km: null };
    if (date < first || (last && date > last && b.km === 0)) {
      // Before first activity in month → no coverage
      if (date < first) return { label: b.label, km: null };
    }
    return { label: b.label, km: b.km };
  });
}

function heartRateAvg(activities: Activity[]): number | null {
  const hrs = activities.filter((a) => (a.average_heartrate ?? 0) > 0);
  if (!hrs.length) return null;
  return hrs.reduce((s, a) => s + (a.average_heartrate ?? 0), 0) / hrs.length;
}

function elevationTotal(activities: Activity[]): number | null {
  const withElev = activities.filter(
    (a) => a.elevation_gain != null && Number.isFinite(a.elevation_gain)
  );
  if (!withElev.length) return null;
  return withElev.reduce((s, a) => s + (a.elevation_gain ?? 0), 0);
}

export function currentStreakDays(activities: Activity[]): number {
  const days = [...new Set(activities.map(localDateKey))].sort();
  if (!days.length) return 0;
  const daySet = new Set(days);
  let cursor = days[days.length - 1];
  let streak = 0;
  while (daySet.has(cursor)) {
    streak += 1;
    const d = new Date(`${cursor}T12:00:00`);
    d.setDate(d.getDate() - 1);
    cursor = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  return streak;
}

export type BuildSummaryOpts = {
  year: number;
  /** YYYY-MM for month trend volume; optional */
  yearMonth?: string;
  locale?: string;
  /** Override "today" for tests (YYYY-MM-DD) */
  asOf?: string;
};

/**
 * Build ActivitySummaryV1 for a focus year (and optional month for volume).
 * Default sportFilter = Run.
 */
export function buildActivitySummaryV1(
  raw: Activity[],
  opts: BuildSummaryOpts
): ActivitySummaryV1 {
  const locale = opts.locale ?? 'zh';
  const asOf = opts.asOf ?? todayLocalKey();
  const activities = filterL0(raw, 'Run');
  const year = opts.year;

  const yearActs = activities.filter((a) =>
    localDateKey(a).startsWith(String(year))
  );
  const focusActs = opts.yearMonth
    ? activities.filter((a) => localDateKey(a).startsWith(opts.yearMonth!))
    : yearActs;
  const dates = yearActs.map(localDateKey).sort();
  const firstDate = dates[0] ?? null;
  const lastDate = dates[dates.length - 1] ?? null;

  const asOfForYear = asOf.startsWith(String(year)) ? asOf : `${year}-12-31`;
  const { coverage, endedYearImported } = inferCoverage(
    year,
    yearActs,
    asOf.startsWith(String(year)) ? asOf : null,
    firstDate
  );

  const daySlots = buildLocalDaySlots(year, yearActs, {
    asOf: asOf.startsWith(String(year)) ? asOf : `${year}-12-31`,
    firstCovered: firstDate,
    // For in-progress year, last covered is asOf (rest days until today).
    // For partial import, don't extend past last activity unless complete Jan-start year.
    lastCovered:
      coverage === 'complete' ||
      (asOf.startsWith(String(year)) && !endedYearImported)
        ? asOfForYear
        : lastDate,
  });

  const ytdCompare = buildYearYtdCompare(activities, year, asOf);
  const ytdEnd = asOf.startsWith(String(year)) ? asOf.slice(5, 10) : null;

  const volumeBuckets = opts.yearMonth
    ? buildDayVolumeBuckets(focusActs, opts.yearMonth)
    : buildMonthVolumeBuckets(yearActs, year, locale);

  return {
    sportFilter: 'Run',
    activities: focusActs,
    coverage,
    endedYearImported,
    ytdEnd,
    totals: buildSliceStats(focusActs),
    daySlots,
    ytdCompare,
    heartRateAvg: heartRateAvg(focusActs),
    elevationM: elevationTotal(focusActs),
    paceBlocks: buildPaceBlocks(focusActs),
    volumeBuckets,
  };
}

/** Available years that have L0 Run activities (desc). */
export function listRunYears(raw: Activity[]): number[] {
  const years = new Set<number>();
  for (const a of filterL0(raw)) {
    const y = Number(localDateKey(a).slice(0, 4));
    if (Number.isFinite(y)) years.add(y);
  }
  return [...years].sort((a, b) => b - a);
}

/** Available YYYY-MM keys for Run activities (desc). */
export function listRunYearMonths(raw: Activity[]): string[] {
  const keys = new Set<string>();
  for (const a of filterL0(raw)) {
    keys.add(localDateKey(a).slice(0, 7));
  }
  return [...keys].sort((a, b) => b.localeCompare(a));
}
