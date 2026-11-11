import { useMemo, type CSSProperties, type ReactNode } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Activity } from '@/types';
import { formatPaceSeconds } from '@/core/splits';
import {
  buildSliceStats,
  enumerateYearDates,
  localDateKey,
  todayLocalKey,
} from '../../summary/summaryAggregator';

type YearSeries = {
  year: number;
  color: string;
  points: { i: number; md: string; km: number | null; cum: number | null }[];
  totalKm: number;
  ytdEnd: string | null;
};

/**
 * Distinct hues (not accent×mute purple ramp). Current calendar year is
 * always accent; older years walk this 4-slot history palette.
 */
const HISTORY_COLORS = [
  'var(--color-run)',
  '#3b82f6',
  '#0d9488',
  'var(--color-muted)',
];

function colorForYear(year: number, historyIndex: number): string {
  const thisYear = new Date().getFullYear();
  if (year === thisYear) return 'var(--color-accent)';
  return HISTORY_COLORS[historyIndex % HISTORY_COLORS.length];
}

/**
 * Multi-year cumulative comparison: one line per year, aligned on day-of-year
 * so "this year vs last year" is read at a glance. Uncovered days stay null —
 * a partial import must not draw a fake zero line.
 *
 * `monthly` slots into the left half of the same card (year view), so the
 * 12-month bars no longer take a full-bleed row of their own.
 */
export function MultiYearCompare({
  runs,
  years,
  activeYear,
  locale,
  tr,
  monthly,
}: {
  runs: Activity[];
  years: number[];
  activeYear: number;
  locale: string;
  tr: (zh: string, en: string) => string;
  /** Optional left-hand block (monthly bars) rendered beside the lines. */
  monthly?: ReactNode;
}) {
  void locale;
  const asOf = todayLocalKey();
  const focusOn = activeYear > 0;

  const series: YearSeries[] = useMemo(() => {
    // Compare at most 5 years so the chart stays readable.
    const picked = years.slice(0, 5);
    let histIdx = 0;
    return picked.map((year) => {
      const acts = runs.filter((a) => localDateKey(a).startsWith(String(year)));
      const dates = acts.map(localDateKey).sort();
      const first = dates[0] ?? null;
      const isCurrent = year === new Date().getFullYear();
      const ytdEnd = isCurrent ? asOf : null;
      const color = colorForYear(year, isCurrent ? -1 : histIdx++);

      const byDay = new Map<string, number>();
      for (const a of acts) {
        const k = localDateKey(a);
        byDay.set(k, (byDay.get(k) ?? 0) + a.distance / 1000);
      }

      let cum = 0;
      const allDates = enumerateYearDates(year);
      const points = allDates.map((date, i) => {
        const md = date.slice(5);
        // Only draw between the first activity and the YTD cutoff.
        const inWindow =
          first != null && date >= first && (!ytdEnd || date <= ytdEnd);
        if (!inWindow) return { i, md, km: null, cum: null };
        const km = byDay.get(date) ?? 0;
        cum += km;
        return {
          i,
          md,
          km: Math.round(km * 100) / 100,
          cum: Math.round(cum * 10) / 10,
        };
      });

      const stats = buildSliceStats(acts);
      return {
        year,
        color,
        points,
        totalKm: Math.round(stats.distanceM / 1000),
        ytdEnd,
      };
    });
  }, [runs, years, asOf]);

  const rows = useMemo(() => {
    const maxLen = Math.max(0, ...series.map((s) => s.points.length));
    const out: Record<string, number | string | null>[] = [];
    for (let i = 0; i < maxLen; i++) {
      const row: Record<string, number | string | null> = { i };
      for (const s of series) {
        const p = s.points[i];
        row[`y${s.year}`] = p ? p.cum : null;
        if (i === 0 || !row.md) row.md = p?.md ?? '';
      }
      out.push(row);
    }
    return out;
  }, [series]);

  if (!series.some((s) => s.points.some((p) => p.cum != null))) {
    return (
      <section className="card summary-hero summary-hero-primary p-5">
        <p className="progress-empty">
          {tr('暂无跨年数据', 'No multi-year data yet')}
        </p>
      </section>
    );
  }

  const lines = (
    <div className="summary-year-pair-side min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="progress-q-title">
          {tr('跨年累计', 'Cumulative by year')}
        </h2>
        <span className="text-[11px] text-[var(--color-muted)]">
          {tr('按年内第 N 天对齐', 'Aligned by day of year')}
        </span>
      </div>

      <div
        className="progress-chart-surface mt-3"
        role="img"
        aria-label={tr('逐年累计距离对比', 'Cumulative distance by year')}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            margin={{ top: 8, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              stroke="var(--color-border)"
              strokeDasharray="3 4"
              vertical={false}
            />
            <XAxis
              dataKey="i"
              tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              tickFormatter={(i) => {
                const md = rows[Number(i)]?.md;
                return typeof md === 'string' ? md : '';
              }}
            />
            <YAxis
              tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={40}
              tickFormatter={(v) => `${v}`}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--color-card)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value, name) => [
                value == null ? '—' : `${value} km`,
                String(name).replace(/^y/, ''),
              ]}
              labelFormatter={(i) => {
                const md = rows[Number(i)]?.md;
                return typeof md === 'string' ? md : '';
              }}
            />
            {series.map((s) => {
              const on = focusOn && s.year === activeYear;
              const dim = focusOn && !on;
              return (
                <Line
                  key={s.year}
                  type="monotone"
                  dataKey={`y${s.year}`}
                  stroke={s.color}
                  strokeWidth={on ? 2.9 : dim ? 1.2 : 2}
                  strokeOpacity={on ? 1 : dim ? 0.4 : 0.88}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  return (
    <section className="card summary-hero summary-hero-primary p-4 md:p-5">
      <div
        className={
          monthly ? 'summary-year-pair-grid' : 'grid grid-cols-1 gap-0'
        }
      >
        {monthly ? (
          <div className="summary-year-pair-side min-w-0">{monthly}</div>
        ) : null}
        {lines}
      </div>
      {/* Year chips belong to the whole comparison, so they sit on the card
          floor rather than inside the line column (they used to be squeezed
          under the chart with a big gap above). */}
      <div className="summary-compare-grid mt-4 grid grid-cols-2 gap-2 md:grid-cols-5 md:gap-2">
        {series.map((s) => {
          const on = focusOn && s.year === activeYear;
          return (
            <div
              key={s.year}
              className={`summary-year-chip rounded-[6px] px-3 py-2.5 ${
                on ? 'is-on' : ''
              }`}
              style={
                {
                  '--year-chip': s.color,
                  /* Soft year tint on sunken — avoid washed-out white flash */
                  background: on
                    ? `color-mix(in srgb, ${s.color} 28%, var(--color-sunken))`
                    : 'var(--color-bg)',
                  border: on
                    ? `1.5px solid color-mix(in srgb, ${s.color} 72%, transparent)`
                    : '1px solid transparent',
                  opacity: focusOn && !on ? 0.72 : 1,
                } as CSSProperties
              }
            >
              <div className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: s.color }}
                />
                <span className="metric text-[12px] font-semibold">
                  {s.year}
                </span>
              </div>
              <div className="metric mt-1 text-sm font-semibold">
                {s.totalKm} km
              </div>
              {s.ytdEnd ? (
                <div className="text-[10px] text-[var(--color-muted)]">
                  {tr('截至', 'through')} {s.ytdEnd}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Weighted-pace footnote used by the year view. */
export function weightedPaceLabel(runs: Activity[]): string {
  const s = buildSliceStats(runs);
  return s.weightedPaceSecPerKm != null
    ? formatPaceSeconds(s.weightedPaceSecPerKm)
    : '--';
}
