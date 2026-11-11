import { useMemo, type ReactNode } from 'react';
import type { Activity } from '@/types';
import { useLocale } from '@/hooks/useLocale';
import { parseMovingTime } from '@/hooks/useActivities';
import { formatPaceSeconds } from '@/core/splits';
import { isPaceValid, weightedPaceSeconds } from '../summary/summaryAggregator';

interface MonthGlanceProps {
  activities: Activity[];
  /** Calendar-synced year (defaults to today). */
  viewYear?: number;
  /** Calendar-synced month 0–11 (defaults to today). */
  viewMonth?: number;
  className?: string;
}

type PeriodStats = {
  distanceKm: number;
  count: number;
  seconds: number;
  paceSec: number | null;
};

function inMonthThroughDay(
  a: Activity,
  year: number,
  month: number,
  throughDay: number | null
): boolean {
  const d = new Date(a.start_date_local);
  if (Number.isNaN(d.getTime())) return false;
  if (d.getFullYear() !== year || d.getMonth() !== month) return false;
  if (throughDay == null) return true;
  return d.getDate() <= throughDay;
}

function summarize(list: Activity[]): PeriodStats {
  let distanceM = 0;
  let seconds = 0;
  for (const a of list) {
    distanceM += a.distance;
    seconds += parseMovingTime(a.moving_time);
  }
  return {
    distanceKm: Math.round((distanceM / 1000) * 10) / 10,
    count: list.length,
    seconds,
    paceSec: weightedPaceSeconds(list.filter(isPaceValid)),
  };
}

function formatHours(secs: number): string {
  if (secs <= 0) return '0h';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function Delta({
  value,
  format,
  invert = false,
  empty,
}: {
  value: number | null;
  format: (abs: number) => string;
  /** When true, lower is better (e.g. pace). */
  invert?: boolean;
  empty: string;
}) {
  if (value == null || !Number.isFinite(value) || value === 0) {
    return (
      <span className="text-[11px] text-[var(--color-muted)]">{empty}</span>
    );
  }
  const better = invert ? value < 0 : value > 0;
  const arrow = value > 0 ? '↗' : '↘';
  return (
    <span
      className={`text-[11px] tabular-nums ${
        better ? 'text-emerald-600' : 'text-[var(--color-muted)]'
      }`}
    >
      {arrow} {format(Math.abs(value))}
    </span>
  );
}

function Row({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 border-b border-[var(--color-border)] py-2.5 first:pt-0 last:border-b-0 last:pb-0">
      <span className="shrink-0 text-xs text-[var(--color-muted)]">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 items-baseline justify-end gap-2">
        <span className="metric text-lg font-semibold whitespace-nowrap tabular-nums">
          {value}
        </span>
        <span className="w-[5.5rem] shrink-0 text-right">{delta}</span>
      </div>
    </div>
  );
}

export function MonthGlance({
  activities,
  viewYear,
  viewMonth,
  className = '',
}: MonthGlanceProps) {
  const { t, locale } = useLocale();

  const { title, monthLabel, current, deltas } = useMemo(() => {
    const now = new Date();
    const year = viewYear ?? now.getFullYear();
    const month = viewMonth ?? now.getMonth();
    const isCurrent = year === now.getFullYear() && month === now.getMonth();
    // Current month: MTD; other months: full calendar month.
    const throughDay = isCurrent ? now.getDate() : null;

    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;

    const thisMonth = activities.filter((a) =>
      inMonthThroughDay(a, year, month, throughDay)
    );
    // Same day-cap for fair MTD; full-vs-full when browsing history.
    const lastMonth = activities.filter((a) =>
      inMonthThroughDay(a, prevYear, prevMonth, throughDay)
    );

    const cur = summarize(thisMonth);
    const prev = summarize(lastMonth);

    const paceDelta =
      cur.paceSec != null && prev.paceSec != null
        ? cur.paceSec - prev.paceSec
        : null;

    const monthLabel =
      locale === 'zh'
        ? `${month + 1}月`
        : new Date(year, month, 1).toLocaleString('en', { month: 'short' });

    const title = isCurrent
      ? t('monthGlance')
      : locale === 'zh'
        ? `${month + 1}月快览`
        : `${monthLabel} glance`;

    return {
      title,
      monthLabel,
      current: cur,
      deltas: {
        distance: cur.distanceKm - prev.distanceKm,
        count: cur.count - prev.count,
        seconds: cur.seconds - prev.seconds,
        pace: paceDelta,
      },
    };
  }, [activities, locale, t, viewYear, viewMonth]);

  const vsLabel = t('vsLastMonth');
  const flat = locale === 'zh' ? '持平' : 'flat';

  return (
    <div className={`card flex min-h-0 min-w-0 flex-col p-4 ${className}`}>
      <div className="mb-1 flex shrink-0 items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-balance">{title}</h3>
        <span className="text-[11px] text-[var(--color-muted)]">
          {monthLabel} · {vsLabel}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-center">
        <Row
          label={t('distance')}
          value={`${current.distanceKm.toFixed(1)} km`}
          delta={
            <Delta
              value={deltas.distance}
              format={(v) => `${v.toFixed(1)} km`}
              empty={flat}
            />
          }
        />
        <Row
          label={locale === 'zh' ? '次数' : 'Runs'}
          value={`${current.count}`}
          delta={
            <Delta value={deltas.count} format={(v) => `${v}`} empty={flat} />
          }
        />
        <Row
          label={locale === 'zh' ? '均配' : 'Avg pace'}
          value={
            current.paceSec != null
              ? `${formatPaceSeconds(current.paceSec)}/km`
              : '—'
          }
          delta={
            <Delta
              value={deltas.pace}
              invert
              format={(v) => formatPaceSeconds(v)}
              empty={current.paceSec == null ? '—' : flat}
            />
          }
        />
        <Row
          label={t('duration')}
          value={formatHours(current.seconds)}
          delta={
            <Delta
              value={deltas.seconds}
              format={(v) => formatHours(v)}
              empty={flat}
            />
          }
        />
      </div>
    </div>
  );
}
