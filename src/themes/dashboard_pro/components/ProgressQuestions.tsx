import { useId, useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
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

function sportLabel(type: string, locale: string): string {
  if (locale !== 'zh') return type;
  if (type === 'Run') return '跑步';
  if (type === 'Ride') return '骑行';
  if (type === 'Hike') return '徒步';
  return type;
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

export function ProgressQuestions({
  activities,
  period,
  periodKey,
  locale,
}: ProgressQuestionsProps) {
  const tr = (zh: string, en: string) => (locale === 'zh' ? zh : en);
  const gradId = useId().replace(/:/g, '');

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

  const attendance = useMemo(() => {
    if (period === 'year') {
      const months = Array.from({ length: 12 }, (_, i) => ({
        label: locale === 'zh' ? `${i + 1}月` : String(i + 1),
        days: new Set<string>(),
      }));
      for (const a of activities) {
        const m = Number(a.start_date_local.slice(5, 7)) - 1;
        if (m < 0 || m > 11) continue;
        months[m].days.add(a.start_date_local.slice(0, 10));
      }
      return months.map((m) => ({
        label: m.label,
        count: m.days.size,
        aria:
          locale === 'zh'
            ? `${m.label} · ${m.days.size} 活跃日`
            : `${m.label}: ${m.days.size} active days`,
      }));
    }
    if (period === 'month') {
      // Aggregate active days by week-of-month (days 1–7 → W1, …) so the
      // chart stays ~4–5 readable columns instead of 28–31 binary stubs.
      const y = Number(periodKey.slice(0, 4));
      const m = Number(periodKey.slice(5, 7));
      const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const weekCount = Math.max(1, Math.ceil(daysInMonth / 7));
      const weeks = Array.from({ length: weekCount }, (_, i) => ({
        label: locale === 'zh' ? `第${i + 1}周` : `W${i + 1}`,
        days: new Set<string>(),
      }));
      for (const a of activities) {
        const d = Number(a.start_date_local.slice(8, 10));
        if (!Number.isFinite(d) || d < 1 || d > daysInMonth) continue;
        const wi = Math.min(weekCount - 1, Math.floor((d - 1) / 7));
        weeks[wi].days.add(a.start_date_local.slice(0, 10));
      }
      return weeks.map((w) => ({
        label: w.label,
        count: w.days.size,
        aria:
          locale === 'zh'
            ? `${w.label} · ${w.days.size} 活跃日`
            : `${w.label}: ${w.days.size} active days`,
      }));
    }
    // week: keep 7 day-level presence bars
    return volumeSeries.map((b) => {
      const on = b.hours > 0 || b.km > 0;
      return {
        label: b.label,
        count: on ? 1 : 0,
        aria:
          locale === 'zh'
            ? `${b.label} · ${on ? '有训' : '无训'}`
            : `${b.label}: ${on ? 'active' : 'rest'}`,
      };
    });
  }, [activities, period, periodKey, locale, volumeSeries]);

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
  const avgPace = useMemo(() => {
    if (!scatter.length) return null;
    return scatter.reduce((s, p) => s + p.pace, 0) / scatter.length;
  }, [scatter]);

  const maxAttend = Math.max(1, ...attendance.map((a) => a.count));
  const maxHours = Math.max(0.1, ...volumeSeries.map((v) => v.hours));

  // Scatter plot geometry
  const maxKm = Math.max(5, ...scatter.map((p) => p.km), 1);
  const minPace = Math.min(...scatter.map((p) => p.pace), 270);
  const maxPace = Math.max(...scatter.map((p) => p.pace), 450);
  const paceLo = Math.max(180, Math.floor(minPace / 30) * 30 - 30);
  const paceHi = Math.min(720, Math.ceil(maxPace / 30) * 30 + 30);

  if (period === 'day' || period === 'life') return null;
  if (!activities.length && !volumeSeries.length) return null;

  const volumeCaption =
    period === 'year'
      ? tr('月训练小时曲线', 'Monthly training hours')
      : period === 'month'
        ? tr('日训练小时', 'Daily training hours')
        : tr('本周训练小时', 'Weekly training hours');

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

  const attendCaption =
    period === 'year'
      ? tr('各月活跃天数', 'Active days by month')
      : period === 'month'
        ? tr('各周活跃天数', 'Active days by week')
        : tr('本期出勤', 'Attendance this period');

  const trainedMonths = volumeSeries.filter((v) => v.hours > 0).length;

  return (
    <section
      className="progress-questions"
      aria-label={tr('Progress 三问', 'Progress')}
    >
      <div className="progress-q card">
        <div className="progress-q-num">{tr('问一', 'Q1')}</div>
        <div className="progress-q-head">
          <h2 className="progress-q-title">
            {tr('做得更多？', 'Doing more?')}
          </h2>
          <div className="progress-q-stat">
            {tr('累计', 'Total')} <strong>{formatHours(totalSeconds)}</strong>
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
        <p className="progress-q-caption">{volumeCaption}</p>
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

      <div className="progress-q card">
        <div className="progress-q-num">{tr('问二', 'Q2')}</div>
        <div className="progress-q-head">
          <h2 className="progress-q-title">
            {tr('坚持出现？', 'Showing up?')}
          </h2>
          <div className="progress-q-stat">
            {tr('活跃日', 'Active days')} <strong>{activeDays}</strong>
            {' \u00b7 '}
            {tr('本期连续', 'period streak')} <strong>{streak}</strong>{' '}
            {tr('天', 'd')}
          </div>
        </div>
        <p className="progress-q-caption">{attendCaption}</p>
        <div
          className="progress-attend"
          style={{
            gridTemplateColumns: `repeat(${Math.min(attendance.length || 1, 12)}, minmax(0, 1fr))`,
          }}
        >
          {attendance.map((m) => {
            const h = Math.round((m.count / maxAttend) * 100);
            return (
              <div
                key={m.label}
                className="progress-attend-mon"
                title={m.aria}
                aria-label={m.aria}
              >
                <div className="progress-attend-lab">{m.label}</div>
                <div className="progress-attend-bar">
                  <div
                    className="progress-attend-fill"
                    style={{ height: `${Math.max(m.count ? 6 : 0, h)}%` }}
                  />
                </div>
                <div className="progress-attend-n">
                  {m.count > 0 ? m.count : '—'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="progress-q card">
        <div className="progress-q-num">{tr('问三', 'Q3')}</div>
        <div className="progress-q-head">
          <h2 className="progress-q-title">
            {tr('跑得更快更远？', 'Faster & farther?')}
          </h2>
          <div className="progress-q-stat">
            {tr('跑步场次', 'runs')} <strong>{runCount}</strong>
            {avgPace != null ? (
              <>
                {' \u00b7 '}
                {tr('均配速', 'avg pace')}{' '}
                <strong>{formatPaceSeconds(avgPace)}</strong>
              </>
            ) : null}
          </div>
        </div>
        <p className="progress-q-caption">
          {tr(
            '距离 × 配速散点（跑步，min/km）',
            'Distance × pace (Run, min/km)'
          )}
        </p>
        {scatter.length === 0 ? (
          <p className="progress-empty">
            {tr('本期暂无跑步配速数据', 'No paced runs in this period')}
          </p>
        ) : (
          <div className="progress-scatter-wrap">
            <svg
              className="progress-scatter"
              viewBox="0 0 640 260"
              role="img"
              aria-label={tr(
                `跑步距离与配速散点，共 ${runCount} 场`,
                `Run distance vs pace, ${runCount} activities`
              )}
            >
              <g stroke="var(--color-border)" strokeWidth="1">
                <line x1="56" y1="20" x2="56" y2="210" />
                <line x1="56" y1="210" x2="610" y2="210" />
              </g>
              <text
                x="48"
                y="28"
                textAnchor="end"
                fill="var(--color-muted)"
                fontSize="10"
                fontFamily="var(--font-mono, ui-monospace, monospace)"
              >
                {formatPaceSeconds(paceLo)}
              </text>
              <text
                x="48"
                y="120"
                textAnchor="end"
                fill="var(--color-muted)"
                fontSize="10"
                fontFamily="var(--font-mono, ui-monospace, monospace)"
              >
                {formatPaceSeconds((paceLo + paceHi) / 2)}
              </text>
              <text
                x="48"
                y="210"
                textAnchor="end"
                fill="var(--color-muted)"
                fontSize="10"
                fontFamily="var(--font-mono, ui-monospace, monospace)"
              >
                {formatPaceSeconds(paceHi)}
              </text>
              <text
                x="56"
                y="232"
                fill="var(--color-muted)"
                fontSize="10"
                fontFamily="var(--font-mono, ui-monospace, monospace)"
              >
                0 km
              </text>
              <text
                x="333"
                y="232"
                textAnchor="middle"
                fill="var(--color-muted)"
                fontSize="10"
                fontFamily="var(--font-mono, ui-monospace, monospace)"
              >
                {(maxKm / 2).toFixed(0)} km
              </text>
              <text
                x="610"
                y="232"
                textAnchor="end"
                fill="var(--color-muted)"
                fontSize="10"
                fontFamily="var(--font-mono, ui-monospace, monospace)"
              >
                {maxKm.toFixed(0)} km
              </text>
              {scatter.map((p) => {
                const x = 56 + (p.km / maxKm) * 540;
                const y =
                  20 + ((p.pace - paceLo) / Math.max(1, paceHi - paceLo)) * 190;
                return (
                  <circle
                    key={p.id}
                    cx={x.toFixed(1)}
                    cy={y.toFixed(1)}
                    r="4.5"
                    fill={sportColor(p.type)}
                    opacity="0.85"
                  >
                    <title>
                      {`${p.name}: ${p.km} km \u00b7 ${formatPaceSeconds(p.pace)}`}
                    </title>
                  </circle>
                );
              })}
              <g
                fontFamily="var(--font-mono, ui-monospace, monospace)"
                fontSize="11"
              >
                <circle cx="530" cy="36" r="4.5" fill={sportColor('Run')} />
                <text x="542" y="40" fill="var(--color-muted)">
                  {sportLabel('Run', locale)}
                </text>
              </g>
            </svg>
          </div>
        )}
        <p className="progress-note">
          {tr(
            '※ 仅展示跑步；无配速场次已排除',
            '※ Runs only; activities without pace are excluded'
          )}
        </p>
      </div>
    </section>
  );
}
