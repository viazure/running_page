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
import type { Activity } from '@/types';
import { formatPaceSeconds } from '@/core/splits';
import { PaceScatter, type PacePoint } from './summary/PaceScatter';
import {
  buildSliceStats,
  currentStreakDays,
  isPaceValid,
  movingTimeSec,
} from '../summary/summaryAggregator';
import './ProgressQuestions.css';

interface ProgressQuestionsProps {
  activities: Activity[];
  locale: string;
}

function formatHours(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function paceSecFromActivity(a: Activity): number | null {
  if (!isPaceValid(a)) return null;
  const secs = movingTimeSec(a.moving_time);
  return (secs / a.distance) * 1000;
}

type Bucket = { label: string; count: number };

/**
 * Progress — volume + pace for the focused year (or all years).
 * Pace + distance share thin vertical bars; scatter stays collapsed by default.
 */
export function ProgressQuestions({
  activities,
  locale,
}: ProgressQuestionsProps) {
  const tr = (zh: string, en: string) => (locale === 'zh' ? zh : en);

  const stats = useMemo(() => buildSliceStats(activities), [activities]);
  const streak = useMemo(() => currentStreakDays(activities), [activities]);

  const distanceBuckets = useMemo<Bucket[]>(() => {
    const bands: { label: string; min: number; max: number }[] = [
      { label: '<5', min: 0, max: 5000 },
      { label: '5–10', min: 5000, max: 10000 },
      { label: '10–15', min: 10000, max: 15000 },
      { label: '15–21', min: 15000, max: 21000 },
      { label: '21–30', min: 21000, max: 30000 },
      { label: '30+', min: 30000, max: Infinity },
    ];
    return bands
      .map((b) => ({
        label: b.label,
        count: activities.filter(
          (a) => a.distance >= b.min && a.distance < b.max
        ).length,
      }))
      .filter((b) => b.count > 0);
  }, [activities]);

  const paceBuckets = useMemo<Bucket[]>(() => {
    const map = new Map<number, number>();
    for (const a of activities) {
      const p = paceSecFromActivity(a);
      if (p == null || p < 180 || p > 900) continue;
      const band = Math.floor(p / 60) * 60;
      map.set(band, (map.get(band) ?? 0) + 1);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a - b)
      .map(([band, count]) => ({
        label: `${Math.floor(band / 60)}:${String(band % 60).padStart(2, '0')}`,
        count,
      }));
  }, [activities]);

  const scatter = useMemo<PacePoint[]>(() => {
    const pts: PacePoint[] = [];
    for (const a of activities) {
      const pace = paceSecFromActivity(a);
      if (pace == null || !Number.isFinite(pace)) continue;
      if (a.distance < 500) continue;
      if (pace < 180 || pace > 600) continue;
      pts.push({
        id: a.run_id,
        km: Math.round((a.distance / 1000) * 100) / 100,
        pace,
        // Date is the stable label: activity names repeat ("清晨跑步") and made
        // the tooltip heading inconsistent run to run.
        day: (a.start_date_local ?? '').slice(5, 10),
      });
    }
    // Oldest → newest so later runs paint on top of earlier ones.
    return pts.sort((a, b) => a.day.localeCompare(b.day));
  }, [activities]);

  if (!activities.length) return null;

  return (
    <section
      className="progress-questions summary-progress-soft"
      aria-label={tr('进展', 'Progress')}
    >
      <div className="progress-q card summary-section-compact">
        <div className="progress-q-head">
          <h2 className="progress-q-title">{tr('训练量', 'Volume')}</h2>
          <div className="progress-q-stat">
            <strong>{formatHours(stats.movingTimeSec)}</strong>
            {' \u00b7 '}
            <strong>{Math.round(stats.distanceM / 1000)}</strong> km
            {' \u00b7 '}
            {tr('活跃日', 'Active days')} <strong>{stats.activeDays}</strong>
            {' \u00b7 '}
            {tr('连续', 'Streak')} <strong>{streak}</strong>
            {tr('天', 'd')}
          </div>
        </div>

        {paceBuckets.length > 0 ? (
          <>
            <div className="mt-1 text-[11px] text-[var(--color-muted)]">
              {tr('配速分布（按次）', 'Pace distribution (by run)')}
            </div>
            <div
              className="progress-chart-surface"
              role="img"
              aria-label={tr('配速分布', 'Pace distribution')}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={paceBuckets}
                  margin={{ top: 8, right: 6, left: 0, bottom: 0 }}
                  barCategoryGap="22%"
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
                  />
                  <YAxis
                    tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={28}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--color-card)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                    formatter={(v) => [
                      `${v} ${tr('次', 'runs')}`,
                      tr('次数', 'Count'),
                    ]}
                    labelFormatter={(l) => `${l} /km`}
                  />
                  <Bar
                    dataKey="count"
                    fill="var(--color-accent)"
                    radius={[2, 2, 0, 0]}
                    maxBarSize={32}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : null}

        {distanceBuckets.length > 0 ? (
          <>
            <div className="mt-3 text-[11px] text-[var(--color-muted)]">
              {tr('距离分布', 'Distance spread')}
            </div>
            <div
              className="progress-chart-surface"
              role="img"
              aria-label={tr('距离分布', 'Distance spread')}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={distanceBuckets}
                  margin={{ top: 8, right: 6, left: 0, bottom: 0 }}
                  barCategoryGap="22%"
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
                  />
                  <YAxis
                    tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={28}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--color-card)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                    formatter={(v) => [
                      `${v} ${tr('次', 'runs')}`,
                      tr('次数', 'Count'),
                    ]}
                    labelFormatter={(l) => `${l} km`}
                  />
                  <Bar
                    dataKey="count"
                    fill="var(--color-accent)"
                    fillOpacity={0.72}
                    radius={[2, 2, 0, 0]}
                    maxBarSize={32}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : null}
      </div>

      <div className="progress-q card summary-section-compact summary-progress-pace">
        <div className="progress-q-head">
          <h2 className="progress-q-title">{tr('配速', 'Pace')}</h2>
          <div className="progress-q-stat">
            {stats.weightedPaceSecPerKm != null ? (
              <>
                {tr('加权均配速', 'Weighted avg')}{' '}
                <strong>{formatPaceSeconds(stats.weightedPaceSecPerKm)}</strong>
              </>
            ) : (
              <span>{tr('暂无有效配速', 'No valid pace')}</span>
            )}
          </div>
        </div>

        {scatter.length === 0 ? (
          <p className="progress-empty">
            {tr('本期暂无跑步配速数据', 'No paced runs in this period')}
          </p>
        ) : (
          <PaceScatter
            points={scatter}
            label={tr(
              `跑步距离与配速散点（min/km），共 ${scatter.length} 场`,
              `Run distance vs pace (min/km), ${scatter.length} activities`
            )}
          />
        )}
      </div>
    </section>
  );
}
