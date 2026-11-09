import { useId, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Activity } from '@/types';
import { parseMovingTime } from '@/hooks/useActivities';
import { formatPaceSeconds } from '@/core/splits';
import type { SummaryPeriod } from '@/utils/summary';
import './ProgressQuestions.css';

interface ProgressQuestionsProps {
  activities: Activity[];
  period: SummaryPeriod;
  periodKey: string;
  locale: string;
}

function formatHours(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function hoursValue(seconds: number): number {
  return Math.round((seconds / 3600) * 10) / 10;
}

function paceSecFromSpeed(speedMs: number): number | null {
  if (!speedMs || !Number.isFinite(speedMs) || speedMs <= 0) return null;
  return 1000 / speedMs;
}

function sportColor(type: string): string {
  if (type === 'Run') return 'var(--color-run, #c45c26)';
  if (type === 'Ride') return '#4f7ce0';
  if (type === 'Hike') return '#c98500';
  return 'var(--color-accent)';
}

function currentStreakDays(activities: Activity[]): number {
  const days = [
    ...new Set(activities.map((a) => a.start_date_local.slice(0, 10))),
  ].sort();
  if (!days.length) return 0;
  const daySet = new Set(days);
  let cursor = days[days.length - 1];
  let streak = 0;
  while (daySet.has(cursor)) {
    streak += 1;
    const d = new Date(`${cursor}T12:00:00`);
    d.setDate(d.getDate() - 1);
    cursor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return streak;
}

type HeatCell = {
  date: string;
  dow: number;
  week: number;
  km: number;
  count: number;
  empty: boolean;
};

export function ProgressQuestions({
  activities,
  period,
  periodKey,
  locale,
}: ProgressQuestionsProps) {
  const tr = (zh: string, en: string) => (locale === 'zh' ? zh : en);
  const gradId = useId().replace(/:/g, '');
  const [attendFocus, setAttendFocus] = useState<string | null>(null);

  const volumeSeries = useMemo(() => {
    if (period === 'year') {
      const buckets = Array.from({ length: 12 }, (_, i) => ({
        key: String(i + 1).padStart(2, '0'),
        label: locale === 'zh' ? `${i + 1}月` : String(i + 1),
        hours: 0,
        km: 0,
      }));
      for (const a of activities) {
        const m = Number(a.start_date_local.slice(5, 7)) - 1;
        if (m < 0 || m > 11) continue;
        buckets[m].hours += parseMovingTime(a.moving_time);
        buckets[m].km += a.distance / 1000;
      }
      return buckets.map((b) => ({
        ...b,
        hours: hoursValue(b.hours),
        km: Math.round(b.km * 10) / 10,
      }));
    }
    if (period === 'month') {
      const y = Number(periodKey.slice(0, 4));
      const m = Number(periodKey.slice(5, 7));
      const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const buckets = Array.from({ length: daysInMonth }, (_, i) => ({
        key: String(i + 1).padStart(2, '0'),
        label: String(i + 1),
        hours: 0,
        km: 0,
      }));
      for (const a of activities) {
        const d = Number(a.start_date_local.slice(8, 10)) - 1;
        if (d < 0 || d >= daysInMonth) continue;
        buckets[d].hours += parseMovingTime(a.moving_time);
        buckets[d].km += a.distance / 1000;
      }
      return buckets.map((b) => ({
        ...b,
        hours: hoursValue(b.hours),
        km: Math.round(b.km * 10) / 10,
      }));
    }
    if (period === 'week') {
      const labels =
        locale === 'zh'
          ? ['一', '二', '三', '四', '五', '六', '日']
          : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const buckets = labels.map((label, i) => ({
        key: String(i + 1),
        label,
        hours: 0,
        km: 0,
      }));
      for (const a of activities) {
        const date = a.start_date_local.slice(0, 10);
        const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
        buckets[dow].hours += parseMovingTime(a.moving_time);
        buckets[dow].km += a.distance / 1000;
      }
      return buckets.map((b) => ({
        ...b,
        hours: hoursValue(b.hours),
        km: Math.round(b.km * 10) / 10,
      }));
    }
    return [];
  }, [activities, period, periodKey, locale]);

  const heatCalendar = useMemo(() => {
    const empty = {
      cells: [] as HeatCell[],
      weekCount: 0,
      maxKm: 1,
      monthMarks: [] as { label: string; week: number }[],
    };
    if (period !== 'year') return empty;
    const year = Number(periodKey.slice(0, 4));
    if (!Number.isFinite(year)) return empty;

    const byDay = new Map<string, { km: number; count: number }>();
    for (const a of activities) {
      const key = a.start_date_local.slice(0, 10);
      if (!key.startsWith(String(year))) continue;
      const cur = byDay.get(key) ?? { km: 0, count: 0 };
      cur.km += a.distance / 1000;
      cur.count += 1;
      byDay.set(key, cur);
    }

    const cells: HeatCell[] = [];
    const start = new Date(year, 0, 1, 12, 0, 0);
    const end = new Date(year, 11, 31, 12, 0, 0);
    const startDow = (start.getDay() + 6) % 7;
    for (let i = 0; i < startDow; i++) {
      cells.push({ date: '', dow: i, week: 0, km: 0, count: 0, empty: true });
    }

    for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
      const d = new Date(t);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dow = (d.getDay() + 6) % 7;
      const week = Math.floor(cells.length / 7);
      const info = byDay.get(key) ?? { km: 0, count: 0 };
      cells.push({
        date: key,
        dow,
        week,
        km: Math.round(info.km * 100) / 100,
        count: info.count,
        empty: false,
      });
    }

    while (cells.length % 7 !== 0) {
      const week = Math.floor(cells.length / 7);
      cells.push({
        date: '',
        dow: cells.length % 7,
        week,
        km: 0,
        count: 0,
        empty: true,
      });
    }

    const weekCount = cells.length / 7;
    const maxKm = Math.max(1, ...cells.map((c) => c.km));
    const monthMarks: { label: string; week: number }[] = [];
    let lastMonth = -1;
    for (const c of cells) {
      if (!c.date) continue;
      const m = Number(c.date.slice(5, 7)) - 1;
      if (m === lastMonth) continue;
      lastMonth = m;
      monthMarks.push({
        label: String(m + 1), // 1–12; avoid "10月" truncating to "1…"
        week: c.week,
      });
    }

    return { cells, weekCount, maxKm, monthMarks };
  }, [activities, period, periodKey]);

  const totalSeconds = useMemo(
    () => activities.reduce((s, a) => s + parseMovingTime(a.moving_time), 0),
    [activities]
  );
  const activeDays = useMemo(
    () => new Set(activities.map((a) => a.start_date_local.slice(0, 10))).size,
    [activities]
  );
  const streak = useMemo(() => currentStreakDays(activities), [activities]);

  // Q3 scatter: Run only (site owner shows running). Pace axis = min/km.
  const scatter = useMemo(() => {
    const pts: {
      id: number;
      km: number;
      pace: number;
      type: string;
      name: string;
    }[] = [];
    for (const a of activities) {
      if (a.type !== 'Run') continue;
      const pace = paceSecFromSpeed(a.average_speed);
      if (pace == null || !Number.isFinite(pace)) continue;
      if (a.distance < 500) continue;
      // Run pace band ~3:00–10:00 min/km (exclude GPS spikes / walks).
      if (pace < 180 || pace > 600) continue;
      pts.push({
        id: a.run_id,
        km: Math.round((a.distance / 1000) * 100) / 100,
        pace,
        type: a.type,
        name: a.name,
      });
    }
    return pts;
  }, [activities]);

  const runCount = scatter.length;
  // Weighted avg pace (total distance / total moving_time), same idea as
  // Summary hero paceFromSpeed(summarize(...).speed). Keep the scatter Run
  // filters so the label matches the points shown — not arithmetic mean.
  const avgPace = useMemo(() => {
    let totalDist = 0;
    let totalTime = 0;
    for (const a of activities) {
      if (a.type !== 'Run') continue;
      const pace = paceSecFromSpeed(a.average_speed);
      if (pace == null || !Number.isFinite(pace)) continue;
      if (a.distance < 500) continue;
      if (pace < 180 || pace > 600) continue;
      const secs = parseMovingTime(a.moving_time);
      if (secs <= 0) continue;
      totalDist += a.distance;
      totalTime += secs;
    }
    if (totalDist <= 0 || totalTime <= 0) return null;
    return (totalTime / totalDist) * 1000;
  }, [activities]);

  const maxHours = Math.max(0.1, ...volumeSeries.map((v) => v.hours));

  // Fit the actual pace range, including slow runs; retain 30s padding for
  // single/identical points instead of forcing a broad or clipped domain.
  const maxKm = Math.max(1, ...scatter.map((p) => p.km)) * 1.05;
  const minPace = scatter.length
    ? Math.min(...scatter.map((p) => p.pace))
    : 300;
  const maxPace = scatter.length
    ? Math.max(...scatter.map((p) => p.pace))
    : 360;
  const paceLo = Math.max(0, Math.floor(minPace / 30) * 30 - 30);
  const paceHi = Math.ceil(maxPace / 30) * 30 + 30;
  if (period === 'day' || period === 'life') return null;
  if (!activities.length && !volumeSeries.length) return null;

  const volumeAria =
    period === 'year'
      ? tr(
          `本年累计 ${formatHours(totalSeconds)}，按月训练小时`,
          `Year total ${formatHours(totalSeconds)}, hours by month`
        )
      : period === 'month'
        ? tr(
            `本月累计 ${formatHours(totalSeconds)}，按日训练小时`,
            `Month total ${formatHours(totalSeconds)}, hours by day`
          )
        : tr(
            `本周累计 ${formatHours(totalSeconds)}，按日训练小时`,
            `Week total ${formatHours(totalSeconds)}, hours by day`
          );

  const trainedMonths = volumeSeries.filter((v) => v.hours > 0).length;

  return (
    <section className="progress-questions" aria-label={tr('进展', 'Progress')}>
      <div className="progress-q card">
        <div className="progress-q-head">
          <h2 className="progress-q-title">{tr('训练量', 'Volume')}</h2>
          <div className="progress-q-stat">
            <strong>{formatHours(totalSeconds)}</strong>
            {period === 'year' ? (
              <>
                {' \u00b7 '}
                {tr('有训月均', 'avg / trained mo')}{' '}
                <strong>
                  {formatHours(totalSeconds / Math.max(1, trainedMonths || 1))}
                </strong>
              </>
            ) : null}
          </div>
        </div>
        <div
          className="progress-chart-surface"
          role="img"
          aria-label={volumeAria}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={volumeSeries}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient
                  id={`pq-vol-${gradId}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor="var(--color-accent)"
                    stopOpacity={0.28}
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
                dataKey="label"
                tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={period === 'month' ? 4 : 0}
              />
              <YAxis
                tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={36}
                domain={[0, Math.ceil(maxHours)]}
                tickFormatter={(v) => `${v}h`}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--color-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value) => [
                  `${value ?? 0} h`,
                  tr('训练小时', 'Hours'),
                ]}
              />
              <Area
                type="monotone"
                dataKey="hours"
                stroke="var(--color-accent)"
                strokeWidth={2.2}
                fill={`url(#pq-vol-${gradId})`}
                dot={{ r: 2.5, fill: 'var(--color-accent)', strokeWidth: 0 }}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {period === 'year' ? (
        <>
            <div className="progress-q card">
        <div className="progress-q-head">
          <h2 className="progress-q-title">{tr('出勤', 'Attendance')}</h2>
          <div className="progress-q-stat">
            {tr('活跃日', 'Active days')} <strong>{activeDays}</strong>
            {' \u00b7 '}
            {tr('本期连续', 'Period streak')} <strong>{streak}</strong>{' '}
            {tr('天', 'd')}
          </div>
        </div>
        <div
          className="progress-heat"
          role="img"
          aria-label={tr('本年出勤日历热力', 'Year attendance calendar heatmap')}
        >
          <div className="progress-heat-months" aria-hidden>
            {heatCalendar.monthMarks.map((m) => (
              <span
                key={`${m.label}-${m.week}`}
                className="progress-heat-month"
                style={{
                  left: `${(m.week / Math.max(1, heatCalendar.weekCount)) * 100}%`,
                }}
              >
                {m.label}
              </span>
            ))}
          </div>
          <div
            className="progress-heat-grid"
            style={{
              gridTemplateColumns: `repeat(${heatCalendar.weekCount}, minmax(0, 1fr))`,
            }}
          >
            {heatCalendar.cells.map((cell) => {
              if (cell.empty || !cell.date) {
                return (
                  <span
                    key={`pad-${cell.week}-${cell.dow}`}
                    className="progress-heat-cell is-pad"
                    aria-hidden
                  />
                );
              }
              const ratio = cell.km / heatCalendar.maxKm;
              const level =
                cell.km <= 0 ? 0 : ratio < 0.33 ? 1 : ratio < 0.66 ? 2 : 3;
              const on = attendFocus === cell.date;
              const aria =
                locale === 'zh'
                  ? `${cell.date} · ${
                      cell.count
                        ? `${cell.count} 次 · ${cell.km.toFixed(1)} km`
                        : '休息'
                    }`
                  : `${cell.date}: ${
                      cell.count
                        ? `${cell.count} · ${cell.km.toFixed(1)} km`
                        : 'rest'
                    }`;
              return (
                <button
                  key={cell.date}
                  type="button"
                  className={`progress-heat-cell level-${level}${on ? ' is-active' : ''}`}
                  title={aria}
                  aria-label={aria}
                  aria-pressed={on}
                  onClick={() =>
                    setAttendFocus((cur) =>
                      cur === cell.date ? null : cell.date
                    )
                  }
                />
              );
            })}
          </div>
          <div className="progress-heat-legend" aria-hidden>
            <span>{tr('少', 'Less')}</span>
            <span className="progress-heat-cell level-0" />
            <span className="progress-heat-cell level-1" />
            <span className="progress-heat-cell level-2" />
            <span className="progress-heat-cell level-3" />
            <span>{tr('多', 'More')}</span>
          </div>
        </div>
        {attendFocus ? (
          <div className="progress-attend-readout" aria-live="polite">
            {(() => {
              const cell = heatCalendar.cells.find((c) => c.date === attendFocus);
              if (!cell) return attendFocus;
              return locale === 'zh'
                ? `${cell.date} · ${
                    cell.count
                      ? `${cell.count} 次 · ${cell.km.toFixed(1)} km`
                      : '休息'
                  }`
                : `${cell.date}: ${
                    cell.count
                      ? `${cell.count} · ${cell.km.toFixed(1)} km`
                      : 'rest'
                  }`;
            })()}
          </div>
        ) : null}
      </div>

<div className="progress-q card">
        <div className="progress-q-head">
          <h2 className="progress-q-title">{tr('配速', 'Pace')}</h2>
          <div className="progress-q-stat">
            <strong>{runCount}</strong> {tr('场', 'runs')}
            {avgPace != null ? (
              <>
                {' \u00b7 '}
                {tr('均配速', 'avg pace')}{' '}
                <strong>{formatPaceSeconds(avgPace)}</strong>
              </>
            ) : null}
          </div>
        </div>
        {scatter.length === 0 ? (
          <p className="progress-empty">
            {tr('本期暂无跑步配速数据', 'No paced runs in this period')}
          </p>
        ) : (
          <div
            className="progress-scatter-wrap"
            role="img"
            aria-label={tr(
              `跑步距离与配速散点（min/km），共 ${runCount} 场；无配速场次已排除`,
              `Run distance vs pace (min/km), ${runCount} activities; runs without pace excluded`
            )}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid
                  stroke="var(--color-border)"
                  strokeDasharray="3 4"
                />
                <XAxis
                  type="number"
                  dataKey="km"
                  domain={[0, maxKm]}
                  tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
                  tickFormatter={(v) => `${Number(v.toFixed(1))} km`}
                  tickCount={4}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="number"
                  dataKey="pace"
                  domain={[paceLo, paceHi]}
                  reversed
                  tickFormatter={formatPaceSeconds}
                  tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
                  tickCount={4}
                  width={44}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    const point = payload?.[0]?.payload as
                      (typeof scatter)[number] | undefined;
                    if (!active || !point) return null;
                    return (
                      <div className="progress-scatter-tip">
                        <strong>{point.name}</strong>
                        <div>
                          {point.km.toFixed(2)} km ·{' '}
                          {formatPaceSeconds(point.pace)} /km
                        </div>
                      </div>
                    );
                  }}
                />
                <Scatter
                  data={scatter}
                  fill={sportColor('Run')}
                  fillOpacity={0.8}
                  isAnimationActive={false}
                  shape={({ cx, cy }) => (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={4}
                      fill={sportColor('Run')}
                      fillOpacity={0.8}
                    />
                  )}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
        </>
      ) : null}
    </section>
  );
}
