import { Suspense, useMemo, useState } from 'react';
import type { Activity } from '@/types';
import { getActivityData, parseMovingTime } from '@/hooks/useActivities';
import { useLocale } from '@/hooks/useLocale';
import {
  groupSummary,
  summarize,
  summaryChart,
  type SummaryPeriod,
} from '@/utils/summary';
import { formatPaceSeconds } from '@/core/splits';
import ActivityList from '@/themes/classic/components/ActivityList';
import { ChipScrollRow } from './ChipScrollRow';
import './SummaryPage.css';

interface SummaryPageProps {
  onBack?: () => void;
}

const PERIODS: { id: SummaryPeriod; zh: string; en: string }[] = [
  { id: 'year', zh: '年', en: 'Year' },
  { id: 'month', zh: '月', en: 'Month' },
  { id: 'week', zh: '周', en: 'Week' },
  { id: 'day', zh: '日', en: 'Day' },
  { id: 'life', zh: 'Life', en: 'Life' },
];

function formatHours(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatKm(meters: number, digits = 2): string {
  return (meters / 1000).toFixed(digits);
}

function paceFromSpeed(speedMs: number): string {
  if (!speedMs || !Number.isFinite(speedMs)) return '--';
  return formatPaceSeconds(1000 / speedMs);
}

function periodLabel(
  period: SummaryPeriod,
  key: string,
  locale: string
): string {
  if (period === 'life') return 'Life';
  if (period === 'year') return locale === 'zh' ? `${key} 年` : key;
  if (period === 'month') {
    const [y, m] = key.split('-');
    return locale === 'zh' ? `${y} 年 ${Number(m)} 月` : `${y}-${m}`;
  }
  if (period === 'week') {
    const [y, w] = key.split('-W');
    return locale === 'zh' ? `${y} 第 ${Number(w)} 周` : `${y} W${w}`;
  }
  return key;
}

function chartEdgeLabels(
  period: SummaryPeriod,
  bars: { label: string; km: number }[],
  locale: string
): [string, string] | [string, string, string] {
  if (!bars.length) return ['', ''];
  if (period === 'year') {
    return locale === 'zh' ? ['1 月', '6 月', '12 月'] : ['Jan', 'Jun', 'Dec'];
  }
  if (period === 'week') {
    return locale === 'zh' ? ['一', '日'] : ['Mon', 'Sun'];
  }
  if (period === 'life') {
    return [bars[0].label, bars[bars.length - 1].label];
  }
  return [bars[0].label, bars[bars.length - 1].label];
}

function SummaryInner({ onBack }: SummaryPageProps) {
  const activities = getActivityData() as Activity[];
  const { locale } = useLocale();
  const tr = (zh: string, en: string) => (locale === 'zh' ? zh : en);

  const [period, setPeriod] = useState<SummaryPeriod>('year');
  const groups = useMemo(
    () => groupSummary(activities, period),
    [activities, period]
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hoverBar, setHoverBar] = useState<number | null>(null);
  const [pinnedBar, setPinnedBar] = useState<number | null>(null);
  const focusBar = pinnedBar ?? hoverBar;
  const clearBarFocus = () => {
    setHoverBar(null);
    setPinnedBar(null);
  };

  const activeKey =
    selectedKey && groups.some(([k]) => k === selectedKey)
      ? selectedKey
      : (groups[0]?.[0] ?? (period === 'life' ? 'Life' : ''));

  const periodActivities = useMemo(() => {
    const found = groups.find(([k]) => k === activeKey);
    const list = found?.[1] ?? [];
    return [...list].sort((a, b) =>
      b.start_date_local.localeCompare(a.start_date_local)
    );
  }, [groups, activeKey]);

  const stats = useMemo(() => summarize(periodActivities), [periodActivities]);

  const bars = useMemo(
    () =>
      period === 'day' || period === 'life'
        ? []
        : summaryChart(periodActivities, period, activeKey),
    [periodActivities, period, activeKey]
  );

  const maxBar = Math.max(0.01, ...bars.map((b) => b.km));
  const edges = chartEdgeLabels(period, bars, locale);
  const avgDistance = stats.count ? stats.distance / stats.count : 0;
  const periodKeys = groups.map(([k]) => k);
  return (
    <div className="summary-page-root mx-auto flex h-full min-h-0 w-full max-w-[1400px] flex-col overflow-hidden px-4 pt-3 md:px-6 md:pt-4">
      <div className="flex shrink-0 items-center gap-3.5 pb-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="cursor-pointer text-[13px] text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)]"
          >
            ← {tr('返回', 'Back')}
          </button>
        ) : null}
        <h1 className="text-lg font-bold">{tr('汇总', 'Summary')}</h1>
      </div>

      <div
        className="summary-period-tabs"
        role="tablist"
        aria-label={tr('汇总周期', 'Summary period')}
      >
        {PERIODS.map((p) => {
          const on = period === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => {
                setPeriod(p.id);
                setSelectedKey(null);
                clearBarFocus();
              }}
              className={`summary-period-tab ${on ? 'is-active' : ''}`}
            >
              {locale === 'zh' ? p.zh : p.en}
            </button>
          );
        })}
      </div>

      {period === 'life' || period === 'day' ? (
        <div
          className={`summary-life-classic min-h-0 flex-auto overflow-hidden ${
            period === 'day' ? 'summary-day-classic' : ''
          }`}
        >
          {/* Local Suspense: day/Life lazy SVG/chart must not bubble to
              DashboardContentSkeleton (that wiped 返回 / 汇总 / period tabs). */}
          <Suspense
            fallback={
              <div
                className="summary-embed-pending"
                role="status"
                aria-live="polite"
              >
                {tr('加载中…', 'Loading…')}
              </div>
            }
          >
            <ActivityList embedded initialInterval={period} hideIntervalChips />
          </Suspense>
        </div>
      ) : (
        <>
          {periodKeys.length > 1 ? (
            <ChipScrollRow
              className="summary-period-chips mb-3 shrink-0 pb-1.5"
              contentClassName="gap-1.5"
              fadeFrom="var(--color-bg)"
            >
              {periodKeys.map((k) => {
                const on = k === activeKey;
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setSelectedKey(k);
                      clearBarFocus();
                    }}
                    className={`summary-period-chip ${on ? 'is-active' : ''}`}
                  >
                    {periodLabel(period, k, locale)}
                  </button>
                );
              })}
            </ChipScrollRow>
          ) : null}

          <div className="summary-layout min-h-0 flex-auto overflow-y-auto overscroll-contain pb-6">
            <section className="card summary-hero p-5 md:p-5">
              <div className="text-[11px] tracking-[1.2px] text-[var(--color-muted)]">
                {periodLabel(period, activeKey, locale) || '—'}
              </div>
              <div className="mt-1">
                <span className="metric text-[40px] leading-none font-bold tracking-tight md:text-[48px]">
                  {formatKm(stats.distance)}
                </span>
                <span className="ml-1.5 text-lg font-medium text-[var(--color-muted)]">
                  km
                </span>
              </div>
              <div className="mt-2 text-[13px] text-[var(--color-muted)]">
                {formatHours(stats.seconds)} · {stats.count} {tr('次', 'runs')}
              </div>

              <div className="summary-stat-grid mt-[18px] grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-2.5">
                {(
                  [
                    [tr('均配速', 'Avg pace'), paceFromSpeed(stats.speed)],
                    [
                      tr('均心率', 'Avg HR'),
                      stats.heartRate != null
                        ? `${Math.round(stats.heartRate)} bpm`
                        : '--',
                    ],
                    [
                      tr('最远', 'Longest'),
                      `${formatKm(stats.maxDistance)} km`,
                    ],
                    [
                      tr('最快配速', 'Best pace'),
                      paceFromSpeed(stats.maxSpeed),
                    ],
                    [tr('均距', 'Avg dist'), `${formatKm(avgDistance)} km`],
                    [
                      tr('爬升', 'Elevation'),
                      `${Math.round(stats.elevation).toLocaleString()} m`,
                    ],
                  ] as [string, string][]
                ).map(([k, v]) => (
                  <div
                    key={k}
                    className="rounded-[6px] bg-[var(--color-bg)] px-3 py-3.5"
                  >
                    <div className="mb-1.5 text-[11px] tracking-[0.8px] text-[var(--color-muted)]">
                      {k}
                    </div>
                    <div className="metric text-base font-semibold text-[var(--color-text)]">
                      {v}
                    </div>
                  </div>
                ))}
              </div>

              {bars.length > 0 ? (
                <>
                  <div className="summary-chart scrollbar-none mt-4 flex h-36 items-stretch gap-1.5 overflow-x-auto rounded-[8px] bg-[var(--color-bg)] px-4 pt-5 pb-4 md:h-40">
                    {bars.map((b, i) => {
                      const h = Math.max(4, (b.km / maxBar) * 100);
                      const peak = b.km === maxBar && b.km > 0;
                      const on = focusBar === i;
                      return (
                        <button
                          key={`${b.label}-${i}`}
                          type="button"
                          title={`${b.label}: ${b.km} km`}
                          aria-pressed={on}
                          onPointerEnter={(e) => {
                            if (e.pointerType === 'mouse') setHoverBar(i);
                          }}
                          onPointerLeave={(e) => {
                            if (e.pointerType === 'mouse') {
                              setHoverBar((cur) => (cur === i ? null : cur));
                            }
                          }}
                          onFocus={() => setHoverBar(i)}
                          onBlur={() =>
                            setHoverBar((cur) => (cur === i ? null : cur))
                          }
                          onPointerDown={(e) => {
                            // Touch: pin readout (mouse keeps hover-only).
                            if (e.pointerType === 'mouse') return;
                            setPinnedBar((cur) => (cur === i ? null : i));
                          }}
                          className="flex h-full min-w-[14px] flex-1 cursor-pointer touch-manipulation flex-col justify-end border-0 bg-transparent p-0 md:min-w-0"
                        >
                          <span
                            aria-hidden
                            className="block w-full rounded-t-md rounded-b-sm bg-[var(--color-accent)] transition-opacity"
                            style={{
                              height: `${h}%`,
                              minHeight: 4,
                              opacity: on
                                ? 1
                                : peak
                                  ? 0.92
                                  : 0.35 + Math.min(0.5, b.km / maxBar) * 0.5,
                            }}
                          />
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex min-h-[1.25rem] items-center justify-between gap-2 text-[11px] text-[var(--color-muted)]">
                    {focusBar != null && bars[focusBar] ? (
                      <span className="metric text-[12px] font-semibold text-[var(--color-text)]">
                        {bars[focusBar].label}: {bars[focusBar].km} km
                      </span>
                    ) : (
                      edges.map((e) => <span key={e}>{e}</span>)
                    )}
                  </div>
                </>
              ) : null}
            </section>

            <section className="card summary-list mt-3 p-5 md:mt-0 md:p-5">
              <div className="text-[11px] tracking-[1.2px] text-[var(--color-muted)]">
                {tr('本期活动', 'Activities')}
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="text-left text-[11px] font-normal text-[var(--color-muted)]">
                      <th className="border-b border-[var(--color-border)] pr-2 pb-2.5 font-normal">
                        {tr('日期', 'Date')}
                      </th>
                      <th className="border-b border-[var(--color-border)] pr-2 pb-2.5 font-normal">
                        {tr('距离', 'Dist')}
                      </th>
                      <th className="border-b border-[var(--color-border)] pr-2 pb-2.5 font-normal">
                        {tr('配速', 'Pace')}
                      </th>
                      <th className="hidden border-b border-[var(--color-border)] pb-2.5 text-right font-normal md:table-cell">
                        {tr('时间', 'Time')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodActivities.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="pt-3 text-[var(--color-muted)]"
                        >
                          {tr('本期暂无活动', 'No activities in this period')}
                        </td>
                      </tr>
                    ) : (
                      periodActivities.map((a) => {
                        const date = a.start_date_local.slice(5, 10);
                        const secs = parseMovingTime(a.moving_time);
                        return (
                          <tr
                            key={a.run_id}
                            className="text-[var(--color-text)]/80"
                          >
                            <td className="pt-3 pr-2 whitespace-nowrap">
                              {date}
                            </td>
                            <td className="metric pt-3 pr-2 font-medium whitespace-nowrap text-[var(--color-text)]">
                              {formatKm(a.distance)} km
                            </td>
                            <td className="metric pt-3 pr-2 whitespace-nowrap">
                              {paceFromSpeed(a.average_speed)}
                            </td>
                            <td className="metric hidden pt-3 text-right whitespace-nowrap md:table-cell">
                              {formatHours(secs)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Dashboard Summary — warm-paper layout for year/month/week;
 * day keeps classic flip-card browsing, restyled to warm-paper hierarchy;
 * Life restores classic Month-of-Life.
 */
export function SummaryPage(props: SummaryPageProps) {
  return <SummaryInner {...props} />;
}
