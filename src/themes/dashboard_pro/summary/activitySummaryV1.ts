/**
 * ActivitySummaryV1 — dashboard_pro 汇总聚合契约（前端 only）。
 * L0 必接；L1+ 非空才挂载；缺失 ≠ 0。
 */

import type { Activity } from '../../../core/types';

export type CoverageStatus = 'complete' | 'partial' | 'unknown';

/** Period slice totals. Pace is weighted; null when no valid pace set. */
export type SliceStats = {
  distanceM: number;
  movingTimeSec: number;
  runCount: number;
  activeDays: number;
  /** Seconds per km from Σtime / Σdistance; null if empty valid set. */
  weightedPaceSecPerKm: number | null;
};

export type DaySlot = {
  /** YYYY-MM-DD local calendar day */
  date: string;
  /**
   * Distance km that day.
   * `null` = no coverage / future / gap — do not draw fake 0 line.
   * `0` = covered rest day.
   */
  km: number | null;
};

export type PaceBlock = {
  id: string;
  labelZh: string;
  labelEn: string;
  /** Inclusive distance band in meters */
  minM: number;
  maxM: number;
  n: number;
  weightedPaceSecPerKm: number | null;
  insufficient_sample: boolean;
};

export type VolumeBucket = {
  key: string;
  label: string;
  hours: number;
  km: number;
};

export type YtdCompare = {
  anchorYear: number;
  priorYear: number;
  /** MM-DD end of YTD window (local); full year uses 12-31 */
  ytdEnd: string;
  current: SliceStats;
  prior: SliceStats;
  deltas: {
    distanceM: number | null;
    runCount: number | null;
    activeDays: number | null;
    weightedPaceSecPerKm: number | null;
  };
};

export type ActivitySummaryV1 = {
  sportFilter: 'Run';
  /** L0 filtered activities (date / distance / moving_time / type present) */
  activities: Activity[];
  coverage: CoverageStatus;
  /** Imported year that does not start at Jan 1 — not a full calendar year */
  endedYearImported: boolean;
  /** For in-progress years: MM-DD of as-of; null for complete past years */
  ytdEnd: string | null;
  totals: SliceStats;
  daySlots: DaySlot[];
  ytdCompare: YtdCompare | null;
  /** L1 — null when no HR samples */
  heartRateAvg: number | null;
  /** L1 — null when no elevation samples */
  elevationM: number | null;
  paceBlocks: PaceBlock[];
  volumeBuckets: VolumeBucket[];
};
