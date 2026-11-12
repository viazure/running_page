export function isPresentElevation(
  value: number | null | undefined
): value is number {
  return value != null && Number.isFinite(value);
}

export function formatElevationMeters(
  totalM: number | null | undefined,
  complete: boolean,
  locale: string = 'zh'
): string {
  if (!isPresentElevation(totalM)) return '—';
  const n = Math.round(totalM).toLocaleString() + ' m';
  if (complete) return n;
  return locale.startsWith('zh') ? n + '（部分）' : n + ' (partial)';
}

/** Sum recorded elevation samples. Missing (null/undefined) is not treated as 0. */
export function summarizeElevation(
  activities: { elevation_gain?: number | null }[]
): {
  totalM: number | null;
  complete: boolean;
} {
  let sampled = 0;
  let totalM = 0;
  for (const activity of activities) {
    if (!isPresentElevation(activity.elevation_gain)) continue;
    sampled += 1;
    totalM += activity.elevation_gain;
  }
  return {
    totalM: sampled > 0 ? totalM : null,
    complete: activities.length > 0 && sampled === activities.length,
  };
}
