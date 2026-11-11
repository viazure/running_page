import type { Activity } from '../types';
import { parseMovingTime } from '../hooks/useActivities';

export type SummaryPeriod = 'year' | 'month' | 'week' | 'day' | 'life';

// Use the recorded local calendar date, independent of the viewer's timezone.
export function summaryKey(date: string, period: SummaryPeriod): string {
  if (period === 'life') return 'Life';
  if (period === 'year') return date.slice(0, 4);
  if (period === 'month') return date.slice(0, 7);
  if (period === 'day') return date.slice(0, 10);
  const day = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  const year = day.getUTCFullYear();
  const week = Math.ceil(
    ((day.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7
  );
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Pace guard shared with the UI's `paceFromSpeed`: anything outside this band is
 * a GPS/clock glitch (a 5 km "run" logged in 21 s is 0:04 /km), not a real best.
 * Without it one bad row collapses the whole card's fastest-pace cell to "—".
 */
const MIN_PACE_SEC_PER_KM = 150;
const MAX_PACE_SEC_PER_KM = 900;

export function summarize(activities: Activity[]) {
  const distance = activities.reduce((sum, a) => sum + a.distance, 0);
  const seconds = activities.reduce(
    (sum, a) => sum + parseMovingTime(a.moving_time),
    0
  );
  const heartRates = activities.filter((a) => (a.average_heartrate ?? 0) > 0);
  // Fastest valid single run: skip implausible pace rather than letting an
  // outlier win the max and then get rejected downstream.
  let maxSpeed = 0;
  for (const a of activities) {
    const time = parseMovingTime(a.moving_time);
    if (!(time > 0) || !(a.distance > 0)) continue;
    const paceSecPerKm = (time / a.distance) * 1000;
    if (
      paceSecPerKm < MIN_PACE_SEC_PER_KM ||
      paceSecPerKm > MAX_PACE_SEC_PER_KM
    )
      continue;
    const speed = a.distance / time;
    if (speed > maxSpeed) maxSpeed = speed;
  }
  return {
    distance,
    seconds,
    count: activities.length,
    speed: seconds > 0 ? distance / seconds : 0,
    maxDistance: Math.max(0, ...activities.map((a) => a.distance)),
    maxSpeed,
    elevation: activities.reduce((sum, a) => sum + (a.elevation_gain ?? 0), 0),
    heartRate: heartRates.length
      ? heartRates.reduce((sum, a) => sum + a.average_heartrate!, 0) /
        heartRates.length
      : null,
  };
}

export function groupSummary(activities: Activity[], period: SummaryPeriod) {
  const groups = new Map<string, Activity[]>();
  for (const activity of activities) {
    const key = summaryKey(activity.start_date_local, period);
    const group = groups.get(key) ?? [];
    group.push(activity);
    groups.set(key, group);
  }
  return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a));
}

export function summaryChart(
  activities: Activity[],
  period: SummaryPeriod,
  key: string
) {
  const buckets = new Map<string, number>();
  const bucketFor = (a: Activity) => {
    const date = a.start_date_local.slice(0, 10);
    if (period === 'life') return date.slice(0, 4);
    if (period === 'year') return date.slice(5, 7);
    if (period === 'month') return date.slice(8, 10);
    if (period === 'week')
      return String(((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1);
    return a.start_date_local.slice(11, 16);
  };
  let length = 0;
  if (period === 'year') length = 12;
  if (period === 'month')
    length = new Date(
      Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)
    ).getUTCDate();
  if (period === 'week') length = 7;
  for (let i = 1; i <= length; i++)
    buckets.set(period === 'week' ? String(i) : String(i).padStart(2, '0'), 0);
  for (const activity of activities) {
    const bucket = bucketFor(activity);
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + activity.distance / 1000);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, km]) => ({ label, km: Number(km.toFixed(2)) }));
}
