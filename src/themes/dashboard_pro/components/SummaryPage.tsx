import { Suspense, useMemo, useState } from 'react';
import type { Activity } from '@/types';
import { useLocale } from '@/hooks/useLocale';
import {
  groupSummary,
  summarize,
  summaryChart,
  type SummaryPeriod,
} from '@/utils/summary';
import { formatPaceSeconds } from '@/core/splits';
import ActivityList from '@/themes/classic/components/ActivityList';
import { ProgressQuestions } from './ProgressQuestions';
import { MultiYearCompare } from './summary/MultiYearCompare';
import { PeriodCompare } from './summary/PeriodCompare';
import { PeriodNavigator } from './summary/PeriodNavigator';
import { CapabilityGate } from './summary/CapabilityGate';
import { TrainingLoadChart } from './summary/TrainingLoadChart';
import { HrZoneStack } from './summary/HrZoneStack';
import { AerobicTrend } from './summary/AerobicTrend';
import { BestEfforts } from './summary/BestEfforts';
import { HabitDistributions } from './summary/HabitDistributions';
import { ConsistencyPanel } from './summary/ConsistencyPanel';
import { useSummaryAggregates } from '../hooks/useSummaryAggregates';
import {
  buildSliceStats,
  currentStreakDays,
} from '../summary/summaryAggregator';
import { getProActivityData } from '../hooks/useProActivities';
import './SummaryPage.css';

interface SummaryPageProps {
  onBack?: () => void;
}

/** Period granularities — the original Summary browsing, restored. */
const PERIODS: { id: SummaryPeriod; zh: string; en: string }[] = [
  { id: 'year', zh: '年', en: 'Year' },
  { id: 'month', zh: '月', en: 'Month' },
  { id: 'week', zh: '周', en: 'Week' },
  { id: 'day', zh: '日', en: 'Day' },
  { id: 'life', zh: '生涯', en: 'Life' },
];

/** Shared toolbar year key for “all years”. */
const YEAR_ALL = 'all';

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
  if (!speedMs || !Number.isFinite(speedMs)) return '—';
  const sec = 1000 / speedMs;
  // Guard GPS glitches (e.g. 0'04"/km) from stealing the hero grid.
  if (sec < 150 || sec > 900) return '—';
  return formatPaceSeconds(sec);
}

function periodLabel(
  period: SummaryPeriod,
  key: string,
  locale: string
): string {
  if (period === 'life') return locale === 'zh' ? '生涯' : 'Life';
  if (period === 'year') return locale === 'zh' ? `${key} 年` : key;
  if (period === 'month') {
    const [y, m] = key.split('-');
    return locale === 'zh' ? `${y} 年 ${Number(m)} 月` : `${y}-${m}`;
  }
  if (period === 'week') {
    const [y, w] = key.split('-W');
    return locale === 'zh' ? `${y} 第 ${Number(w)} 周` : `${y} W${w}`;
  }
  if (period === 'day' && key.length >= 10) {
    const [y, m, d] = key.slice(0, 10).split('-');
    return locale === 'zh'
      ? `${y} 年 ${Number(m)} 月 ${Number(d)} 日`
      : key.slice(0, 10);
  }
  return key;
}

function chartEdgeLabels(
  period: SummaryPeriod,
  bars: { label: string }[],
  locale: string
): string[] {
  if (!bars.length) return ['', ''];
  if (period === 'year') {
    return locale === 'zh' ? ['1 月', '6 月', '12 月'] : ['Jan', 'Jun', 'Dec'];
  }
  if (period === 'week') return locale === 'zh' ? ['一', '日'] : ['Mon', 'Sun'];
  return [bars[0].label, bars[bars.length - 1].label];
}

/** L0 fallback: Eddington from daily totals, no aggregates needed. */
function estimateEddington(activities: Activity[]): number {
  const byDay = new Map<string, number>();
  for (const a of activities) {
    const k = a.start_date_local.slice(0, 10);
    byDay.set(k, (byDay.get(k) ?? 0) + a.distance / 1000);
  }
  const sorted = [...byDay.values()].sort((a, b) => b - a);
  let e = 0;
  for (const km of sorted) {
    if (km >= e + 1) e += 1;
    else break;
  }
  return e;
}

/** L0 fallback: start-hour histogram straight from activity dates. */
function fallbackHourDistribution(activities: Activity[]): number[] {
  const hours = new Array(24).fill(0) as number[];
  for (const a of activities) {
    const h = Number(a.start_date_local.slice(11, 13));
    if (Number.isFinite(h) && h >= 0 && h < 24) hours[h] += 1;
  }
  return hours;
}

function SummaryInner({ onBack }: SummaryPageProps) {
  const raw = getProActivityData();
  const { locale } = useLocale();
  const tr = (zh: string, en: string) => (locale === 'zh' ? zh : en);

  const activities = useMemo(() => raw.filter((a) => a.type === 'Run'), [raw]);

  const [period, setPeriod] = useState<SummaryPeriod>('year');
  /** Shared year focus for every tab — sticky toolbar (`all` = every year). */
  const [focusYear, setFocusYear] = useState<string>(YEAR_ALL);
  const [hoverBar, setHoverBar] = useState<number | null>(null);
  const [pinnedBar, setPinnedBar] = useState<number | null>(null);
  const focusBar = pinnedBar ?? hoverBar;

  const yearKeys = useMemo(
    () =>
      [
        ...new Set(
          activities.map((a) => a.start_date_local.slice(0, 4)).filter(Boolean)
        ),
      ].sort((a, b) => b.localeCompare(a)),
    [activities]
  );
  const navYearKeys = useMemo(() => [YEAR_ALL, ...yearKeys], [yearKeys]);
  const activeYearKey =
    focusYear === YEAR_ALL || yearKeys.includes(focusYear)
      ? focusYear
      : YEAR_ALL;
  const isAllYears = activeYearKey === YEAR_ALL;
  const activeYear = isAllYears ? 0 : Number(activeYearKey) || 0;
  /** Day/Life ActivityList: null = all years. */
  const controlledEmbedYear = isAllYears ? null : activeYearKey;

  const groups = useMemo(
    () => groupSummary(activities, period),
    [activities, period]
  );

  /** Month / week cards scoped to the toolbar year (`all` = every period). */
  const yearScopedGroups = useMemo(() => {
    if (period !== 'month' && period !== 'week') return groups;
    if (isAllYears) return groups;
    return groups.filter(([k]) => k.startsWith(`${activeYearKey}-`));
  }, [groups, period, activeYearKey, isAllYears]);

  const yearGroups = useMemo(
    () => groupSummary(activities, 'year'),
    [activities]
  );

  const periodActivities = useMemo(() => {
    if (period !== 'year') return [] as Activity[];
    const list = isAllYears
      ? activities
      : (yearGroups.find(([k]) => k === activeYearKey)?.[1] ?? []);
    return [...list].sort((a, b) =>
      b.start_date_local.localeCompare(a.start_date_local)
    );
  }, [period, isAllYears, activities, yearGroups, activeYearKey]);

  const stats = useMemo(() => summarize(periodActivities), [periodActivities]);
  const bars = useMemo(() => {
    if (period !== 'year') return [];
    if (isAllYears) {
      // One bar per calendar year (oldest → newest).
      return [...yearGroups]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, list]) => ({
          label: k,
          km:
            Math.round((list.reduce((s, a) => s + a.distance, 0) / 1000) * 10) /
            10,
        }));
    }
    return summaryChart(periodActivities, 'year', activeYearKey);
  }, [period, isAllYears, yearGroups, periodActivities, activeYearKey]);
  const maxBar = Math.max(0.01, ...bars.map((b) => b.km));
  const edges = isAllYears
    ? bars.length
      ? [bars[0].label, bars[bars.length - 1].label]
      : ['', '']
    : chartEdgeLabels(period, bars, locale);
  const avgDistance = stats.count ? stats.distance / stats.count : 0;

  /** Cross-period aggregates + capability report (deeper blocks gate on this). */
  const {
    aggregates,
    capabilities,
    loading: aggregatesLoading,
  } = useSummaryAggregates(activities);

  const onFocusYearChange = (key: string) => {
    setFocusYear(key);
    setHoverBar(null);
    setPinnedBar(null);
  };

  const showYearNav = yearKeys.length > 0;

  return (
    <div className="summary-page-root mx-auto flex h-full min-h-0 w-full max-w-[1400px] flex-col overflow-hidden px-4 pt-3 md:px-6 md:pt-4">
      {/* Nav already exposes Summary — skip redundant「← 返回 汇总」chrome. */}
      {!onBack ? (
        <div className="flex shrink-0 items-center gap-3.5 pb-3">
          <h1 className="text-lg font-bold">{tr('汇总', 'Summary')}</h1>
        </div>
      ) : null}

      <div className="summary-period-toolbar">
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
                  setHoverBar(null);
                  setPinnedBar(null);
                }}
                className={`summary-period-tab ${on ? 'is-active' : ''}`}
              >
                {locale === 'zh' ? p.zh : p.en}
              </button>
            );
          })}
        </div>
        {showYearNav ? (
          <PeriodNavigator
            periodKeys={navYearKeys}
            activeKey={activeYearKey}
            labelFor={(k) =>
              k === YEAR_ALL
                ? tr('全部', 'All')
                : locale === 'zh'
                  ? `${k} 年`
                  : k
            }
            selectAria={tr('选择年份', 'Select year')}
            onChange={onFocusYearChange}
            tr={tr}
          />
        ) : null}
      </div>

      {period === 'life' || period === 'day' ? (
        <div
          className={`summary-panel summary-life-classic min-h-0 flex-auto overflow-hidden ${
            period === 'day' ? 'summary-day-classic' : ''
          }`}
        >
          {/* Local Suspense: day/Life lazy SVG/chart must not bubble to the page skeleton. */}
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
            <ActivityList
              embedded
              activities={activities}
              initialInterval={period}
              hideIntervalChips
              hideYearChips
              controlledYear={controlledEmbedYear}
            />
          </Suspense>
        </div>
      ) : period === 'month' || period === 'week' ? (
        <div className="summary-panel summary-layout min-h-0 flex-auto overflow-y-auto overscroll-contain pb-6">
          <PeriodCompare
            key={`${period}-${activeYearKey}`}
            groups={yearScopedGroups}
            period={period}
            locale={locale}
            tr={tr}
            labelFor={(k) => {
              // When a single year is selected in the toolbar, keep titles short.
              if (!isAllYears && period === 'month') {
                const m = Number(k.slice(5, 7));
                return locale === 'zh'
                  ? `${m} 月`
                  : new Date(2000, m - 1, 1).toLocaleString('en', {
                      month: 'short',
                    });
              }
              if (!isAllYears && period === 'week') {
                const w = Number(k.split('-W')[1]);
                return locale === 'zh' ? `第 ${w} 周` : `W${w}`;
              }
              return periodLabel(period, k, locale);
            }}
          />
        </div>
      ) : (
        <div className="summary-panel summary-layout min-h-0 flex-auto overscroll-contain pb-6">
          <div className="summary-main">
            <section className="card summary-hero summary-hero-primary p-5 md:p-6">
              <div className="mt-0">
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

              {/* Same tile grid as the month/week cards: one shape, one type
                  scale, averages first → peaks → elevation last. */}
              <dl className="summary-period-tiles">
                {(
                  [
                    [tr('均配速', 'Avg pace'), paceFromSpeed(stats.speed)],
                    [
                      tr('均心率', 'Avg HR'),
                      stats.heartRate != null
                        ? `${Math.round(stats.heartRate)} bpm`
                        : '—',
                    ],
                    [tr('均距', 'Avg dist'), `${formatKm(avgDistance)} km`],
                    [
                      tr('最远', 'Longest'),
                      `${formatKm(stats.maxDistance)} km`,
                    ],
                    [
                      tr('最快配速', 'Best pace'),
                      paceFromSpeed(stats.maxSpeed),
                    ],
                    [
                      tr('爬升', 'Elevation'),
                      `${Math.round(stats.elevation).toLocaleString()} m`,
                    ],
                  ] as [string, string][]
                )
                  // Keep all six so the grid stays a stable 3×2 — a missing
                  // metric shows an em dash instead of collapsing the row.
                  .map(([k, v]) => (
                    <div key={k} className="summary-period-tile">
                      <dt>{k}</dt>
                      <dd className="metric">{v}</dd>
                    </div>
                  ))}
              </dl>
            </section>

            <MultiYearCompare
              runs={activities}
              years={yearKeys.map(Number)}
              activeYear={activeYear}
              locale={locale}
              tr={tr}
              monthly={
                bars.length > 0 ? (
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h2 className="progress-q-title">
                        {isAllYears
                          ? tr('年度总量', 'Yearly volume')
                          : tr('月度分布', 'Monthly volume')}
                      </h2>
                      <span className="metric text-[11px] text-[var(--color-muted)]">
                        {focusBar != null && bars[focusBar]
                          ? `${bars[focusBar].label}: ${bars[focusBar].km} km`
                          : `${edges[0]} – ${edges[1]}`}
                      </span>
                    </div>
                    <div
                      className="summary-year-pair-bars"
                      role="img"
                      aria-label={tr('月度跑量分布', 'Monthly distance')}
                    >
                      {bars.map((b, i) => {
                        const h = Math.max(3, (b.km / maxBar) * 100);
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
                              if (e.pointerType === 'mouse') return;
                              setPinnedBar((cur) => (cur === i ? null : i));
                            }}
                          >
                            <span
                              aria-hidden
                              className="summary-year-bar block rounded-t-[2px] bg-[var(--color-accent)] transition-opacity"
                              style={{
                                height: `${h}%`,
                                minHeight: 3,
                                opacity: on
                                  ? 1
                                  : peak
                                    ? 0.95
                                    : 0.28 +
                                      Math.min(0.55, b.km / maxBar) * 0.55,
                              }}
                            />
                          </button>
                        );
                      })}
                    </div>
                    {/* Month (or year) labels: the card previously ended in
                        dead space under the bars. */}
                    <div className="summary-year-pair-axis" aria-hidden>
                      {bars.map((b, i) => (
                        <span key={`ax-${b.label}-${i}`}>
                          {isAllYears ? b.label.slice(2) : b.label}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null
              }
            />

            <div className="summary-deep-grid">
              <ConsistencyPanel
                eddington={
                  aggregates?.eddington ?? estimateEddington(activities)
                }
                activeDays={
                  aggregates?.activeDays ??
                  buildSliceStats(activities).activeDays
                }
                runCount={activities.length}
                streak={currentStreakDays(activities)}
                activities={activities}
                locale={locale}
                tr={tr}
              />

              {aggregates ? (
                <CapabilityGate
                  capabilities={capabilities}
                  // Composite card: each series draws independently, so one
                  // missing capability must not hide the others (a HR-stream
                  // deploy without VO2max still has decoupling + cadence).
                  need={['vo2max', 'streams']}
                  mode="any"
                  label="aerobic"
                >
                  <AerobicTrend
                    vo2max={aggregates.vo2max}
                    decouplingMonthly={aggregates.decouplingMonthly}
                    cadenceMonthly={aggregates.cadenceMonthly}
                    focusYear={isAllYears ? null : activeYearKey}
                    locale={locale}
                    tr={tr}
                  />
                </CapabilityGate>
              ) : null}
            </div>

            {aggregates ? (
              <CapabilityGate
                capabilities={capabilities}
                need="trainingLoad"
                label="training-load"
              >
                <TrainingLoadChart
                  loadDays={aggregates.loadDays}
                  focusYear={isAllYears ? null : activeYearKey}
                  locale={locale}
                  tr={tr}
                />
              </CapabilityGate>
            ) : null}

            {aggregates ? (
              <CapabilityGate
                capabilities={capabilities}
                need="hrZones"
                label="hr-zones"
                insufficientNote={tr(
                  '心率区间样本不足，暂不出图',
                  'Not enough zone samples yet'
                )}
              >
                <HrZoneStack
                  monthly={aggregates.hrZonesMonthly}
                  focusYear={isAllYears ? null : activeYearKey}
                  locale={locale}
                  tr={tr}
                />
              </CapabilityGate>
            ) : null}

            {aggregates ? (
              <CapabilityGate
                capabilities={capabilities}
                need="streams"
                label="best-efforts"
              >
                <BestEfforts
                  series={aggregates.bestEfforts}
                  locale={locale}
                  tr={tr}
                />
              </CapabilityGate>
            ) : null}

            {aggregates ? (
              <HabitDistributions
                hourDistribution={aggregates.hourDistribution}
                paceDistribution={aggregates.paceDistribution}
                locale={locale}
                tr={tr}
              />
            ) : aggregatesLoading ? null : (
              <HabitDistributions
                hourDistribution={fallbackHourDistribution(activities)}
                paceDistribution={[]}
                locale={locale}
                tr={tr}
              />
            )}

            <ProgressQuestions activities={periodActivities} locale={locale} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Dashboard Summary — year / month / week / day / life browsing (original IA),
 * with cross-year comparison added on the year view.
 */
export function SummaryPage(props: SummaryPageProps) {
  return <SummaryInner {...props} />;
}
