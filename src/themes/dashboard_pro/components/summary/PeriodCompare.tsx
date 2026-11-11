/**
 * Month / week period cards aligned to the live Summary look:
 * large km hero → 2×3 metric tiles → thin calendar bars (empty = dashed tick).
 */
import { useMemo, useState } from 'react';
import type { Activity } from '@/types';
import { formatPace } from '@/hooks/useActivities';
import { summarize, summaryChart, type SummaryPeriod } from '@/utils/summary';

const PAGE = 12;

function formatHours(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function number(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function paceOrDash(speedMs: number): string {
  if (!(speedMs > 0) || !Number.isFinite(speedMs)) return '—';
  const sec = 1000 / speedMs;
  if (sec < 150 || sec > 900) return '—';
  return formatPace(speedMs);
}

function PeriodCard({
  activities,
  period,
  periodKey,
  label,
  locale: _locale,
  tr,
}: {
  activities: Activity[];
  period: SummaryPeriod;
  periodKey: string;
  label: string;
  locale: string;
  tr: (zh: string, en: string) => string;
}) {
  void _locale;
  const [focus, setFocus] = useState<number | null>(null);
  const stats = summarize(activities);
  const chart = summaryChart(activities, period, periodKey);
  const maxKm = Math.max(0.01, ...chart.map((d) => d.km));
  const avgDistance = stats.count > 0 ? stats.distance / stats.count / 1000 : 0;

  // 3-up: averages first (always available), peaks next, elevation last
  // (optional — it degrades to a dash and must not own a prime slot).
  const tiles: [string, string][] = [
    [tr('均配速', 'Avg pace'), paceOrDash(stats.speed)],
    [
      tr('均心率', 'Avg HR'),
      stats.heartRate ? `${Math.round(stats.heartRate)} bpm` : '—',
    ],
    [
      tr('均距', 'Avg dist'),
      stats.count > 0 ? `${number(avgDistance)} km` : '—',
    ],
    [tr('最远', 'Longest'), `${number(stats.maxDistance / 1000)} km`],
    [tr('最快配速', 'Best pace'), paceOrDash(stats.maxSpeed)],
    [tr('爬升', 'Elevation'), `${Math.round(stats.elevation)} m`],
  ];

  const edgeLeft = chart[0]?.label ?? '';
  const edgeRight = chart[chart.length - 1]?.label ?? '';
  const focusRow = focus != null ? chart[focus] : null;

  return (
    <article className="card summary-period-card flex min-w-0 flex-col">
      <header className="summary-period-hero">
        <h2 className="summary-period-label">{label}</h2>
        <p className="summary-period-km metric">
          {number(stats.distance / 1000)}
          <span className="summary-period-km-unit">km</span>
        </p>
        <p className="summary-period-sub">
          {formatHours(stats.seconds)} · {stats.count} {tr('次', 'runs')}
        </p>
      </header>

      <dl className="summary-period-tiles">
        {tiles.map(([name, value]) => (
          <div key={name} className="summary-period-tile">
            <dt>{name}</dt>
            <dd className="metric">{value}</dd>
          </div>
        ))}
      </dl>

      <div
        className="summary-period-chart"
        role="img"
        aria-label={`${label}: ${chart
          .filter((d) => d.km > 0)
          .map((d) => `${d.label}: ${d.km} km`)
          .join(', ')}`}
      >
        <div className="summary-period-bars">
          {chart.map((b, i) => {
            const active = b.km > 0;
            const peak = active && b.km === maxKm;
            const on = focus === i;
            const h = active ? Math.max(8, (b.km / maxKm) * 100) : 0;
            return (
              <button
                key={`${b.label}-${i}`}
                type="button"
                title={active ? `${b.label}: ${b.km} km` : `${b.label}: —`}
                aria-pressed={on}
                onPointerEnter={(e) => {
                  if (e.pointerType === 'mouse') setFocus(i);
                }}
                onPointerLeave={(e) => {
                  if (e.pointerType === 'mouse') {
                    setFocus((cur) => (cur === i ? null : cur));
                  }
                }}
                onFocus={() => setFocus(i)}
                onBlur={() => setFocus((cur) => (cur === i ? null : cur))}
                onPointerDown={(e) => {
                  if (e.pointerType === 'mouse') return;
                  setFocus((cur) => (cur === i ? null : i));
                }}
                className="summary-period-bar-slot"
              >
                {active ? (
                  <span
                    aria-hidden
                    className={`summary-period-bar${peak ? 'is-peak' : ''}${
                      on ? 'is-on' : ''
                    }`}
                    style={{ height: `${h}%` }}
                  />
                ) : (
                  <span aria-hidden className="summary-period-bar-empty" />
                )}
              </button>
            );
          })}
        </div>
        <div className="summary-period-chart-edge">
          {focusRow && focusRow.km > 0 ? (
            <span className="summary-period-chart-focus metric">
              {focusRow.label}: {focusRow.km} km
            </span>
          ) : (
            <>
              <span>{edgeLeft}</span>
              <span>{edgeRight}</span>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * Month / week multi-period grid (upstream Summary layout).
 */
export function PeriodCompare({
  groups,
  period,
  locale,
  tr,
  labelFor,
}: {
  groups: [string, Activity[]][];
  period: SummaryPeriod;
  locale: string;
  tr: (zh: string, en: string) => string;
  labelFor: (key: string) => string;
}) {
  const [limit, setLimit] = useState(PAGE);
  const shown = useMemo(() => groups.slice(0, limit), [groups, limit]);

  if (!groups.length) {
    return (
      <p className="card summary-period-card py-16 text-center text-[var(--color-muted)]">
        {tr('这个筛选条件下暂无活动。', 'No activities match these filters.')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid min-w-0 gap-3.5 xl:grid-cols-2">
        {shown.map(([key, items]) => (
          <PeriodCard
            key={key}
            periodKey={key}
            label={labelFor(key)}
            activities={items}
            period={period}
            locale={locale}
            tr={tr}
          />
        ))}
      </div>
      {groups.length > limit ? (
        <div className="text-center">
          <button
            type="button"
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-text)]"
            onClick={() => setLimit((n) => n + PAGE)}
          >
            {tr('加载更多', 'Load more')} ({limit}/{groups.length})
          </button>
        </div>
      ) : null}
    </div>
  );
}
