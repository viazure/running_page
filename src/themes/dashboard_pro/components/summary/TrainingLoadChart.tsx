import { useMemo } from 'react';
import {
  Area,
  ComposedChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SectionTitle } from './InfoTip';
import {
  ALL_YEARS_CHART_MONTHS,
  inChartWindow,
} from '../../summary/chartWindow';

const CTL_TC = 42; // chronic (fitness)
const ATL_TC = 7; // acute (fatigue)

type Point = {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
  load: number;
};

/**
 * Fitness / fatigue / form from per-day training load.
 *
 * EWMA over *calendar* days (not training days) so rest weeks actually lower
 * fatigue — the whole point of the model. Requires device `training_load`, which
 * GPX-only deployments do not have, so callers gate this block.
 *
 * `focusYear` (YYYY) scopes the drawn window; EWMA still warms up on earlier
 * days so January is not a cold start. `null` = last 24 months (not full career).
 */
export function TrainingLoadChart({
  loadDays,
  focusYear = null,
  locale,
  tr,
}: {
  loadDays: { date: string; load: number }[];
  /** YYYY, or null → last {@link ALL_YEARS_CHART_MONTHS} months. */
  focusYear?: string | null;
  locale: string;
  tr: (zh: string, en: string) => string;
}) {
  void locale;

  const series = useMemo<Point[]>(() => {
    if (!loadDays.length) return [];
    const byDay = new Map(loadDays.map((d) => [d.date, d.load] as const));
    const dates = loadDays.map((d) => d.date).sort();
    const start = new Date(`${dates[0]}T12:00:00`);
    const end = new Date(`${dates[dates.length - 1]}T12:00:00`);

    let ctl = 0;
    let atl = 0;
    const out: Point[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const load = byDay.get(key) ?? 0;
      ctl += (load - ctl) / CTL_TC;
      atl += (load - atl) / ATL_TC;
      if (!inChartWindow(key, focusYear)) continue;
      out.push({
        date: key,
        ctl: Math.round(ctl * 10) / 10,
        atl: Math.round(atl * 10) / 10,
        tsb: Math.round((ctl - atl) * 10) / 10,
        load,
      });
    }
    return out;
  }, [loadDays, focusYear]);

  if (!series.length) return null;

  const latest = series[series.length - 1];

  return (
    <section className="card summary-section-compact p-4 md:p-4">
      <SectionTitle
        title={tr('训练负荷', 'Training load')}
        tip={tr(
          `由设备训练负荷推算：体能取 42 天指数加权（CTL），疲劳取 7 天（ATL），状态为两者之差（TSB）。休息日按 0 计入。选「全部」时只画近 ${ALL_YEARS_CHART_MONTHS} 个月；切换年份时仍用更早数据预热。`,
          `Derived from device training load: fitness is a 42-day EWMA (CTL), fatigue 7-day (ATL), form is the difference (TSB). Rest days count as zero. “All” shows the last ${ALL_YEARS_CHART_MONTHS} months; earlier days still warm the EWMA when you pick a year.`
        )}
        right={
          <div className="progress-q-stat">
            {!focusYear ? (
              <>
                {tr(
                  `近 ${ALL_YEARS_CHART_MONTHS} 个月`,
                  `Last ${ALL_YEARS_CHART_MONTHS} mo`
                )}
                {' · '}
              </>
            ) : null}
            {latest ? (
              <>
                {tr('体能', 'Fitness')} <strong>{latest.ctl}</strong>
                {' · '}
                {tr('疲劳', 'Fatigue')} <strong>{latest.atl}</strong>
                {' · '}
                {tr('状态', 'Form')} <strong>{latest.tsb}</strong>
              </>
            ) : null}
          </div>
        }
      />

      <div
        className="progress-chart-surface mt-3"
        role="img"
        aria-label={tr(
          '体能、疲劳与状态曲线（CTL/ATL/TSB）',
          'Fitness, fatigue and form (CTL/ATL/TSB)'
        )}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={series}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="ctl-fill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--color-accent)"
                  stopOpacity={0.24}
                />
                <stop
                  offset="100%"
                  stopColor="var(--color-accent)"
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="var(--color-border)"
              strokeDasharray="3 4"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={40}
              tickFormatter={(v: string) =>
                focusYear ? v.slice(5) : v.slice(2, 7)
              }
            />
            <YAxis
              tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={34}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--color-card)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(v) => String(v)}
              formatter={(value, name) => [value as number, String(name)]}
            />
            <Area
              type="monotone"
              dataKey="ctl"
              name={tr('体能 CTL', 'Fitness CTL')}
              stroke="var(--color-accent)"
              strokeWidth={2}
              fill="url(#ctl-fill)"
              isAnimationActive={false}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="atl"
              name={tr('疲劳 ATL', 'Fatigue ATL')}
              stroke="var(--color-run)"
              strokeWidth={1.6}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="tsb"
              name={tr('状态 TSB', 'Form TSB')}
              stroke="var(--color-muted)"
              strokeWidth={1.2}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
