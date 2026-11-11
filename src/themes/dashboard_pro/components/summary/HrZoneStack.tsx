import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
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

/** Warm-paper triptych — lilac / sand-ochre / clay (no teal, no traffic light). */
const ZONE_COLORS = {
  easy: 'var(--intensity-easy)',
  moderate: 'var(--intensity-moderate)',
  hard: 'var(--intensity-hard)',
} as const;

/**
 * Monthly intensity mix as three readable stacks (easy / moderate / hard).
 * Collapses device Z1–Z7 so thin multi-zone walls stay legible.
 */
export function HrZoneStack({
  monthly,
  focusYear = null,
  locale,
  tr,
}: {
  monthly: { key: string; seconds: number[] }[];
  focusYear?: string | null;
  locale: string;
  tr: (zh: string, en: string) => string;
}) {
  void locale;

  const scoped = useMemo(
    () => monthly.filter((m) => inChartWindow(m.key, focusYear)),
    [monthly, focusYear]
  );

  const rows = useMemo(() => {
    return scoped.map((m) => {
      const secs = m.seconds;
      const total = secs.reduce((s, v) => s + (v || 0), 0) || 1;
      const easy = (secs[0] ?? 0) + (secs[1] ?? 0);
      const moderate = secs[2] ?? 0;
      const hard = secs.slice(3).reduce((s, v) => s + (v || 0), 0);
      const pct = (n: number) => Math.round((n / total) * 1000) / 10;
      return {
        key: m.key,
        easy: pct(easy),
        moderate: pct(moderate),
        hard: pct(hard),
        // YY/MM — a bare "03" was ambiguous once the 24-month window spans two
        // calendar years, which made the tooltip look like it disagreed with
        // the plotted bar.
        label:
          m.key.length >= 7 ? `${m.key.slice(2, 4)}/${m.key.slice(5)}` : m.key,
      };
    });
  }, [scoped]);

  if (!rows.length) return null;

  const latest = rows[rows.length - 1];

  const swatch = (color: string) => (
    <span
      aria-hidden
      className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
      style={{ background: color }}
    />
  );

  return (
    <section className="card summary-section-compact p-4 md:p-4">
      <SectionTitle
        title={tr('强度分布', 'Intensity mix')}
        tip={tr(
          '轻松 = Z1–Z2（淡紫），中等 = Z3（沙赭），高强度 = Z4+（陶土橙）。极化训练建议轻松约占 80%。选「全部」时只画近 24 个月。',
          'Easy = Z1–Z2 (lilac), moderate = Z3 (sand ochre), hard = Z4+ (clay orange). Polarized training targets ~80% easy. “All” shows the last 24 months.'
        )}
        right={
          <div className="progress-q-stat text-[11px]">
            {!focusYear ? (
              <>
                {tr(
                  `近 ${ALL_YEARS_CHART_MONTHS} 个月`,
                  `Last ${ALL_YEARS_CHART_MONTHS} mo`
                )}
                {' · '}
              </>
            ) : null}
            {/* Percentages below are the newest month only — say so, otherwise
                they read like chart-wide totals and look wrong. */}
            <span className="text-[var(--color-muted)]">{latest.label}</span>{' '}
            {swatch(ZONE_COLORS.easy)}
            {tr('轻松', 'easy')} <strong>{latest.easy.toFixed(0)}%</strong>
            {' · '}
            {swatch(ZONE_COLORS.moderate)}
            {tr('中等', 'mod')} <strong>{latest.moderate.toFixed(0)}%</strong>
            {' · '}
            {swatch(ZONE_COLORS.hard)}
            {tr('高', 'hard')} <strong>{latest.hard.toFixed(0)}%</strong>
          </div>
        }
      />

      <div
        className="progress-chart-surface mt-2.5"
        role="img"
        aria-label={tr('各月强度占比', 'Monthly intensity share')}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            margin={{ top: 8, right: 6, left: 0, bottom: 0 }}
            barCategoryGap="15%"
          >
            <CartesianGrid
              stroke="var(--color-border)"
              strokeDasharray="3 4"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis
              tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={30}
              domain={[0, 100]}
              tickFormatter={(v) => `${Math.round(Number(v))}%`}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--color-card)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                fontSize: 11,
              }}
              formatter={(value, name) => {
                const label =
                  name === 'easy'
                    ? tr('轻松', 'Easy')
                    : name === 'moderate'
                      ? tr('中等', 'Moderate')
                      : tr('高强度', 'Hard');
                return [`${value}%`, label];
              }}
              labelFormatter={(label) => {
                const row = rows.find((r) => r.label === label);
                return row ? row.key : String(label);
              }}
            />
            <Bar
              dataKey="easy"
              stackId="mix"
              fill={ZONE_COLORS.easy}
              fillOpacity={0.92}
              maxBarSize={36}
              isAnimationActive={false}
            />
            <Bar
              dataKey="moderate"
              stackId="mix"
              fill={ZONE_COLORS.moderate}
              fillOpacity={0.95}
              maxBarSize={36}
              isAnimationActive={false}
            />
            <Bar
              dataKey="hard"
              stackId="mix"
              fill={ZONE_COLORS.hard}
              fillOpacity={1}
              radius={[2, 2, 0, 0]}
              maxBarSize={36}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
