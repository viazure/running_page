import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
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

/**
 * Aerobic fitness trends.
 *
 * Three signals, all from device/stream data and all optional:
 * - VO2max (per activity, Garmin estimate)
 * - efficiency factor proxy: cadence trend (form drift)
 * - aerobic decoupling (Pa:HR) monthly median — lower is fitter
 *
 * Only the blocks with data render; a GPX-only deploy shows nothing here.
 * `focusYear` null → last 24 months.
 */
export function AerobicTrend({
  vo2max,
  decouplingMonthly,
  cadenceMonthly,
  focusYear = null,
  locale,
  tr,
}: {
  vo2max: { date: string; value: number }[];
  decouplingMonthly: { key: string; median: number | null }[];
  cadenceMonthly: { key: string; median: number | null }[];
  /** YYYY, or null → last {@link ALL_YEARS_CHART_MONTHS} months. */
  focusYear?: string | null;
  locale: string;
  tr: (zh: string, en: string) => string;
}) {
  const vo2Rows = useMemo(() => {
    // Thin to monthly medians: per-activity points are noisy and dense.
    const byMonth = new Map<string, number[]>();
    for (const p of vo2max) {
      if (!inChartWindow(p.date, focusYear)) continue;
      const k = p.date.slice(0, 7);
      const list = byMonth.get(k) ?? [];
      list.push(p.value);
      byMonth.set(k, list);
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, values]) => {
        const sorted = [...values].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        return { key, value: Math.round(median * 10) / 10 };
      });
  }, [vo2max, focusYear]);

  const decRows = useMemo(
    () =>
      decouplingMonthly
        .filter((d) => d.median != null && inChartWindow(d.key, focusYear))
        .map((d) => ({ key: d.key, value: d.median as number })),
    [decouplingMonthly, focusYear]
  );

  const cadRows = useMemo(
    () =>
      cadenceMonthly
        .filter((d) => d.median != null && inChartWindow(d.key, focusYear))
        .map((d) => ({ key: d.key, value: d.median as number })),
    [cadenceMonthly, focusYear]
  );

  const latestVo2 = vo2Rows[vo2Rows.length - 1];
  const latestDec = decRows[decRows.length - 1];

  // A card with no drawable series is worse than no card: when a single year is
  // selected but only one point survives the window, skip the whole section.
  const showVo2 = vo2Rows.length > 1;
  const showDec = decRows.length > 1;
  const showCad = cadRows.length > 1;
  if (!showVo2 && !showDec && !showCad) return null;

  return (
    <section className="card summary-section-compact p-4 md:p-4">
      <SectionTitle
        title={tr('有氧能力', 'Aerobic fitness')}
        tip={tr(
          '解耦 = (前半程效率 − 后半程效率) / 前半程效率。效率 = 配速 / 心率。低于 5% 说明有氧基础扎实；仅统计 ≥30 分钟的稳态跑，间歇与含停顿的跑不参与。',
          'Decoupling = (first-half EF − second-half EF) / first-half EF, where EF = pace / HR. Under 5% means a solid aerobic base. Steady runs ≥30 min only; intervals and stop-start runs are excluded.'
        )}
        right={
          <div className="progress-q-stat">
            {!focusYear ? (
              <>
                {tr(
                  `近 ${ALL_YEARS_CHART_MONTHS} 个月`,
                  `Last ${ALL_YEARS_CHART_MONTHS} mo`
                )}
                {latestVo2 || latestDec ? ' · ' : ''}
              </>
            ) : null}
            {latestVo2 ? (
              <>
                VO2max <strong>{latestVo2.value}</strong>
              </>
            ) : null}
            {latestDec ? (
              <>
                {' · '}
                {tr('解耦', 'decoupling')} <strong>{latestDec.value}%</strong>
              </>
            ) : null}
          </div>
        }
      />

      {showVo2 ? (
        <>
          <div className="mt-2 text-[11px] text-[var(--color-muted)]">
            {tr('VO2max（月中位）', 'VO2max (monthly median)')}
          </div>
          <div
            className="progress-chart-surface"
            style={{ height: 130 }}
            role="img"
            aria-label={tr('VO2max 趋势', 'VO2max trend')}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={vo2Rows}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  stroke="var(--color-border)"
                  strokeDasharray="3 4"
                  vertical={false}
                />
                <XAxis
                  dataKey="key"
                  tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={30}
                />
                <YAxis
                  domain={['dataMin - 2', 'dataMax + 2']}
                  tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--color-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v) => [v as number, 'VO2max']}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--color-accent)"
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: 'var(--color-accent)', strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : null}

      {showDec ? (
        <>
          <div className="mt-3 text-[11px] text-[var(--color-muted)]">
            {tr(
              '有氧解耦 Pa:HR（越低越好，月中位）',
              'Aerobic decoupling (lower is better)'
            )}
          </div>
          <div
            className="progress-chart-surface"
            style={{ height: 120 }}
            role="img"
            aria-label={tr('有氧解耦趋势', 'Aerobic decoupling trend')}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={decRows}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  stroke="var(--color-border)"
                  strokeDasharray="3 4"
                  vertical={false}
                />
                <XAxis
                  dataKey="key"
                  tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={30}
                />
                <YAxis
                  tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--color-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v) => [`${v}%`, tr('解耦', 'decoupling')]}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--color-run)"
                  strokeWidth={1.8}
                  dot={{ r: 2.5, fill: 'var(--color-run)', strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : null}

      {showCad ? (
        <>
          <div className="mt-3 text-[11px] text-[var(--color-muted)]">
            {tr('步频（月中位 spm）', 'Cadence (monthly median spm)')}
          </div>
          <div
            className="progress-chart-surface"
            style={{ height: 110 }}
            role="img"
            aria-label={tr('步频趋势', 'Cadence trend')}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={cadRows}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  stroke="var(--color-border)"
                  strokeDasharray="3 4"
                  vertical={false}
                />
                <XAxis
                  dataKey="key"
                  tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={30}
                />
                <YAxis
                  domain={['dataMin - 4', 'dataMax + 4']}
                  tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--color-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v) => [`${v} spm`, tr('步频', 'cadence')]}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--color-muted)"
                  strokeWidth={1.6}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : null}
    </section>
  );
}
