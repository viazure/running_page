/** When year nav is “全部”, deep charts only draw this many recent months. */
export const ALL_YEARS_CHART_MONTHS = 24;

/** Earliest YYYY-MM included in the “all years” chart window. */
export function chartWindowStartKey(
  months: number = ALL_YEARS_CHART_MONTHS,
  asOf: Date = new Date()
): string {
  const d = new Date(asOf.getFullYear(), asOf.getMonth() - (months - 1), 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Year filter for deep charts.
 * - `focusYear` set → that calendar year only
 * - `focusYear` null → last `ALL_YEARS_CHART_MONTHS` months (not full career)
 */
export function inChartWindow(
  keyOrDate: string,
  focusYear: string | null,
  months: number = ALL_YEARS_CHART_MONTHS
): boolean {
  const ym = keyOrDate.slice(0, 7);
  if (focusYear) return ym.startsWith(focusYear);
  return ym >= chartWindowStartKey(months);
}
