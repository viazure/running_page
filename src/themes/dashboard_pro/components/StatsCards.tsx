import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFixedPopover } from '../hooks/useFixedPopover';
import type { Activity, SportFilter } from '@/types';
import { formatDistance, parseMovingTime } from '@/hooks/useActivities';
import { useLocale } from '@/hooks/useLocale';
import {
  GOALS,
  DEFAULT_GOAL,
  DASHBOARD_PRO_MODULES,
  DASHBOARD_PRO_STATS_HERO,
  DASHBOARD_PRO_STATS_ORDER,
  type StatsCardKey,
} from '@/config';
/** Soften large year-over-year drops so the card does not feel punitive. */
function formatYearYoY(
  yearDiff: number,
  unit: 'time' | 'distance',
  locale: string,
  formatHours: (s: number) => string,
  vsLastYear: string
): string {
  const arrow = yearDiff >= 0 ? '↗' : '↘';
  if (unit === 'time') {
    return `${arrow} ${formatHours(Math.abs(yearDiff))} ${vsLastYear}`;
  }
  const absM = Math.abs(yearDiff);
  // >=100 km drop -> weak copy (no giant negative km)
  if (yearDiff < 0 && absM >= 100_000) {
    return locale === 'zh' ? '少于去年同期' : 'Behind last year';
  }
  return `${arrow} ${formatDistance(absM)} km ${vsLastYear}`;
}

function formatWeekRange(start: Date, end: Date, locale: string) {
  if (locale === 'zh') {
    return `${start.getMonth() + 1} 月 ${start.getDate()} 日 – ${end.getMonth() + 1} 月 ${end.getDate()} 日`;
  }
  return `${start.getMonth() + 1}/${start.getDate()} – ${end.getMonth() + 1}/${end.getDate()}`;
}

function GoalHeading({
  className,
  icon,
  label,
  hint,
}: {
  className: string;
  icon: ReactNode;
  label: string;
  hint?: string;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // The goal cards live inside `overflow-x-hidden` grids, which browsers turn
  // into scroll containers on the other axis too — an absolutely positioned
  // bubble above the title was clipped to a thin white sliver. The shared hook
  // portals it to <body> and flips it below when there is no room above.
  const { popRef } = useFixedPopover(anchorRef, open, { gap: 6 }, hint);

  return (
    <div
      ref={anchorRef}
      className="group/period relative rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
      tabIndex={hint ? 0 : undefined}
      aria-label={hint ? `${label} ${hint}` : undefined}
      onPointerEnter={(event) => {
        if (hint && event.pointerType === 'mouse') setOpen(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') setOpen(false);
      }}
      onFocus={() => {
        if (hint) setOpen(true);
      }}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false);
      }}
    >
      <p className={className}>
        {icon}
        <span className="min-w-0 truncate">{label}</span>
      </p>
      {hint && open
        ? createPortal(
            <div
              ref={popRef}
              role="tooltip"
              className="pointer-events-none fixed z-[90] rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-2.5 py-1 text-xs font-normal whitespace-nowrap text-[var(--color-text)] normal-case tabular-nums shadow-md"
            >
              {hint}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

interface StatsCardsProps {
  activities: Activity[];
  allActivities: Activity[];
  year: number | null;
  filter: SportFilter;
  onSelectActivity: (a: Activity) => void;
  /** Tighter mobile/pro layout. Default false = upstream typography/grid. */
  compact?: boolean;
}

export function StatsCards({
  activities,
  allActivities,
  year,
  filter,
  onSelectActivity,
  compact = false,
}: StatsCardsProps) {
  const { t, locale } = useLocale();
  const goal = GOALS[filter] ?? DEFAULT_GOAL;
  // For Gym, goals are in minutes; for others, goals are in km → convert to meters
  const yearGoalMeters = goal.unit === 'time' ? 0 : goal.yearly * 1000;
  const monthGoalMeters = goal.unit === 'time' ? 0 : goal.monthly * 1000;
  const weekGoalMeters = goal.unit === 'time' ? 0 : goal.weekly * 1000;
  const yearGoalMins = goal.unit === 'time' ? goal.yearly : 0;
  const monthGoalMins = goal.unit === 'time' ? goal.monthly : 0;
  const weekGoalMins = goal.unit === 'time' ? goal.weekly : 0;

  // Current year stats (for yearly goal).
  // Anchor "today" in state so render stays pure (no `new Date()` each pass).
  // Retick at local midnight so a tab left open overnight still rolls the
  // day / streak / YoY-to-date math — empty-deps useMemo would freeze forever.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = new Date();
    const nextMidnight = new Date(
      t.getFullYear(),
      t.getMonth(),
      t.getDate() + 1
    );
    const id = window.setTimeout(
      () => setNow(new Date()),
      nextMidnight.getTime() - Date.now() + 50
    );
    return () => clearTimeout(id);
  }, [now]);
  const currentYear = year ?? now.getFullYear();
  // Past years follow the same month/weekday as today. Current year and All stay on now.
  const viewingPastYear = year != null && year !== now.getFullYear();
  const anchorYear = viewingPastYear ? year : now.getFullYear();
  const anchorDay = Math.min(
    now.getDate(),
    new Date(anchorYear, now.getMonth() + 1, 0).getDate()
  );
  const anchor = viewingPastYear
    ? new Date(anchorYear, now.getMonth(), anchorDay, 12, 0, 0, 0)
    : now;
  const streakPool = allActivities.filter(
    (a) => filter === 'all' || a.type === filter
  );
  const yearActivities = activities.filter((a) => {
    const d = new Date(a.start_date_local);
    return d.getFullYear() === currentYear;
  });
  const yearDistance = yearActivities.reduce((s, a) => s + a.distance, 0);
  const yearCount = yearActivities.length;
  const yearSeconds = yearActivities.reduce(
    (s, a) => s + parseMovingTime(a.moving_time),
    0
  );

  // Last year same period comparison
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 86400000
  );
  const lastYearActivities = allActivities.filter((a) => {
    const d = new Date(a.start_date_local);
    if (d.getFullYear() !== currentYear - 1) return false;
    if (filter !== 'all' && a.type !== filter) return false;
    const aDayOfYear = Math.floor(
      (d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000
    );
    return aDayOfYear <= dayOfYear;
  });
  const lastYearDistance = lastYearActivities.reduce(
    (s, a) => s + a.distance,
    0
  );
  const lastYearSeconds = lastYearActivities.reduce(
    (s, a) => s + parseMovingTime(a.moving_time),
    0
  );
  // Unit-aware diff: seconds in time mode, meters in distance mode
  const yearDiff =
    goal.unit === 'time'
      ? yearSeconds - lastYearSeconds
      : yearDistance - lastYearDistance;

  // Month stats follow the anchor: today, or the same month in a past year.
  const monthActivities = allActivities.filter((a) => {
    const d = new Date(a.start_date_local);
    if (
      d.getFullYear() !== anchor.getFullYear() ||
      d.getMonth() !== anchor.getMonth()
    )
      return false;
    if (filter !== 'all' && a.type !== filter) return false;
    return true;
  });
  const monthDistance = monthActivities.reduce((s, a) => s + a.distance, 0);
  const monthCount = monthActivities.length;
  const monthSeconds = monthActivities.reduce(
    (s, a) => s + parseMovingTime(a.moving_time),
    0
  );

  // Last month same period comparison
  const lastMonthActivities = allActivities.filter((a) => {
    const d = new Date(a.start_date_local);
    const targetMonth = anchor.getMonth() === 0 ? 11 : anchor.getMonth() - 1;
    const targetYear =
      anchor.getMonth() === 0 ? anchor.getFullYear() - 1 : anchor.getFullYear();
    if (d.getFullYear() !== targetYear || d.getMonth() !== targetMonth)
      return false;
    if (filter !== 'all' && a.type !== filter) return false;
    return d.getDate() <= anchor.getDate();
  });
  const lastMonthDistance = lastMonthActivities.reduce(
    (s, a) => s + a.distance,
    0
  );
  const lastMonthSeconds = lastMonthActivities.reduce(
    (s, a) => s + parseMovingTime(a.moving_time),
    0
  );
  const monthDiff =
    goal.unit === 'time'
      ? monthSeconds - lastMonthSeconds
      : monthDistance - lastMonthDistance;

  // Week stats — week starts on Monday, through the anchor day
  const dayOfWeek = anchor.getDay(); // 0=Sun
  const daysSinceMon = (dayOfWeek + 6) % 7; // Mon=0 … Sun=6
  const weekStart = new Date(anchor.getTime() - daysSinceMon * 86400000);
  weekStart.setHours(0, 0, 0, 0);
  const anchorEnd = new Date(anchor);
  anchorEnd.setHours(23, 59, 59, 999);
  const weekActivities = allActivities.filter((a) => {
    const d = new Date(a.start_date_local);
    if (d < weekStart || d > anchorEnd) return false;
    if (filter !== 'all' && a.type !== filter) return false;
    return true;
  });
  const weekDistance = weekActivities.reduce((s, a) => s + a.distance, 0);
  const weekCount = weekActivities.length;
  const weekSeconds = weekActivities.reduce(
    (s, a) => s + parseMovingTime(a.moving_time),
    0
  );

  // Last week same period comparison
  const lastWeekStart = new Date(weekStart.getTime() - 7 * 86400000);
  const lastWeekSamePoint = new Date(anchor.getTime() - 7 * 86400000);
  const lastWeekActivities = allActivities.filter((a) => {
    const d = new Date(a.start_date_local);
    if (d < lastWeekStart || d > lastWeekSamePoint) return false;
    if (filter !== 'all' && a.type !== filter) return false;
    return true;
  });
  const lastWeekDistance = lastWeekActivities.reduce(
    (s, a) => s + a.distance,
    0
  );
  const lastWeekSeconds = lastWeekActivities.reduce(
    (s, a) => s + parseMovingTime(a.moving_time),
    0
  );
  const weekDiff =
    goal.unit === 'time'
      ? weekSeconds - lastWeekSeconds
      : weekDistance - lastWeekDistance;

  // Use local date string to avoid UTC offset issues
  function toLocalDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Current streak uses every activity, so a year filter cannot zero it out.
  const sortedDates = [
    ...new Set(streakPool.map((a) => a.start_date_local.slice(0, 10))),
  ]
    .sort()
    .reverse();

  let currentStreak = 0;
  if (!viewingPastYear && sortedDates.length > 0) {
    const today = toLocalDateStr(now);
    const yesterday = toLocalDateStr(new Date(now.getTime() - 86400000));
    if (sortedDates[0] === today || sortedDates[0] === yesterday) {
      let expected = sortedDates[0];
      for (const dateStr of sortedDates) {
        if (dateStr === expected) {
          currentStreak++;
          const prev = new Date(expected + 'T12:00:00');
          prev.setDate(prev.getDate() - 1);
          expected = toLocalDateStr(prev);
        } else {
          break;
        }
      }
    }
  }

  // Week streak (consecutive weeks with activity) using simple week number
  function getWeekNumber(d: Date): number {
    const start = new Date(d.getFullYear(), 0, 1);
    return Math.floor(
      ((d.getTime() - start.getTime()) / 86400000 + start.getDay()) / 7
    );
  }

  const weekSet = new Set(
    streakPool.map((a) => {
      const d = new Date(a.start_date_local);
      return `${d.getFullYear()}-${getWeekNumber(d)}`;
    })
  );

  let currentWeekStreak = 0;
  {
    let d = new Date(now);
    // Check current week first
    const currKey = `${d.getFullYear()}-${getWeekNumber(d)}`;
    if (weekSet.has(currKey)) {
      // Count backwards from current week
      const seen = new Set<string>();
      while (true) {
        const key = `${d.getFullYear()}-${getWeekNumber(d)}`;
        if (weekSet.has(key) && !seen.has(key)) {
          seen.add(key);
          currentWeekStreak++;
          d = new Date(d.getTime() - 7 * 86400000);
        } else {
          break;
        }
      }
    } else {
      // Try last week
      d = new Date(now.getTime() - 7 * 86400000);
      if (weekSet.has(`${d.getFullYear()}-${getWeekNumber(d)}`)) {
        const seen = new Set<string>();
        while (true) {
          const key = `${d.getFullYear()}-${getWeekNumber(d)}`;
          if (weekSet.has(key) && !seen.has(key)) {
            seen.add(key);
            currentWeekStreak++;
            d = new Date(d.getTime() - 7 * 86400000);
          } else {
            break;
          }
        }
      }
    }
  }

  // Longest streak inside the year scope (all activities when no year is selected).
  const scopedDates = [
    ...new Set(activities.map((a) => a.start_date_local.slice(0, 10))),
  ].sort();
  let longestStreak = 0;
  if (scopedDates.length > 0) {
    let streak = 1;
    longestStreak = 1;
    for (let i = 1; i < scopedDates.length; i++) {
      const prev = new Date(scopedDates[i - 1] + 'T12:00:00');
      const curr = new Date(scopedDates[i] + 'T12:00:00');
      const diff = Math.round((curr.getTime() - prev.getTime()) / 86400000);
      if (diff === 1) {
        streak++;
      } else {
        streak = 1;
      }
      if (streak >= longestStreak) {
        longestStreak = streak;
      }
    }
  }

  const scopedWeekSet = new Set(
    activities.map((a) => {
      const d = new Date(a.start_date_local);
      return `${d.getFullYear()}-${getWeekNumber(d)}`;
    })
  );

  // Longest week streak - iterate all weeks from earliest to latest
  let longestWeekStreak = 0;
  {
    if (activities.length > 0) {
      const earliest = new Date(
        Math.min(
          ...activities.map((a) => new Date(a.start_date_local).getTime())
        )
      );
      const latest = new Date(
        Math.max(
          ...activities.map((a) => new Date(a.start_date_local).getTime())
        )
      );
      let streak = 0;
      let d = new Date(earliest);
      while (d <= latest) {
        const key = `${d.getFullYear()}-${getWeekNumber(d)}`;
        if (scopedWeekSet.has(key)) {
          streak++;
          longestWeekStreak = Math.max(longestWeekStreak, streak);
        } else {
          streak = 0;
        }
        d = new Date(d.getTime() + 7 * 86400000);
      }
    }
  }

  // Streak card always mirrors the「全部」layout: hero/calendar are "now",
  // footnote is longest day/week inside the current year scope.
  const calendarAnchor = now;
  const calendarHighlight = toLocalDateStr(now);
  const calendarActivities = streakPool;
  const shownStreakDays = currentStreak;
  const shownWeekStreak = currentWeekStreak;
  const streakTitle = t('streak');
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const monthHint = viewingPastYear
    ? locale === 'zh'
      ? `${anchor.getFullYear()} 年 ${anchor.getMonth() + 1} 月`
      : `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}`
    : '';
  const weekHint = viewingPastYear
    ? formatWeekRange(weekStart, weekEnd, locale)
    : '';
  const streakFootnote = `${t('longest')}: ${longestStreak} ${t('days')} / ${longestWeekStreak} ${t('weeks')}`;

  const formatHours = (secs: number) => {
    const h = (secs / 3600).toFixed(1);
    return `${h}h`;
  };

  const unit = filter === 'Run' ? t('runs') : t('activities');

  const showWeekly = DASHBOARD_PRO_MODULES.weekly;
  const statsOrder = DASHBOARD_PRO_STATS_ORDER;
  const statsHero = DASHBOARD_PRO_STATS_HERO;
  const showYearly = DASHBOARD_PRO_MODULES.yearly_goal;
  const showMonthly = DASHBOARD_PRO_MODULES.monthly_goal;
  const showStreak = DASHBOARD_PRO_MODULES.streak;

  const ncCount =
    Number(showWeekly) +
    Number(showYearly) +
    Number(showMonthly) +
    Number(showStreak);
  const ncGridClass =
    ncCount <= 1
      ? 'grid grid-cols-1 gap-4'
      : ncCount === 2
        ? 'grid grid-cols-1 gap-4 md:grid-cols-2'
        : ncCount === 3
          ? 'grid grid-cols-1 gap-4 md:grid-cols-3'
          : 'grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_1fr_1.6fr]';

  if (!showWeekly && !showYearly && !showMonthly && !showStreak) {
    return null;
  }

  if (!compact) {
    return (
      <div className={ncGridClass}>
        {/* Yearly Goal */}
        {showYearly ? (
          <div className="card p-5">
            <p className="eyebrow mb-2 flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              {t('yearlyGoal')}
            </p>
            <p className="metric text-3xl font-semibold whitespace-nowrap">
              {goal.unit === 'time'
                ? formatHours(yearSeconds)
                : formatDistance(yearDistance)}
              <span className="ml-1 text-base font-normal text-[var(--color-muted)]">
                /{' '}
                {goal.unit === 'time'
                  ? `${Math.round(yearGoalMins / 60)}h`
                  : `${goal.yearly} km`}
              </span>
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-sunken)]">
              <div
                className="h-full rounded-full bg-[var(--color-accent)] transition-all"
                style={{
                  width: `${Math.min(goal.unit === 'time' ? (yearSeconds / (yearGoalMins * 60)) * 100 : (yearDistance / yearGoalMeters) * 100, 100)}%`,
                }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-sm text-[var(--color-muted)]">
              <span className="flex items-center gap-1.5">
                <svg
                  className="h-3.5 w-3.5 text-[var(--color-accent)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                {yearCount} {unit}
              </span>
              <span>{formatHours(yearSeconds)}</span>
            </div>
            <p
              className={`mt-1.5 text-xs ${yearDiff >= 0 ? 'text-emerald-600' : 'text-[var(--color-muted)]'}`}
            >
              {formatYearYoY(
                yearDiff,
                goal.unit,
                locale,
                formatHours,
                t('vsLastYear')
              )}
            </p>
          </div>
        ) : null}

        {/* Monthly Goal */}
        {showMonthly ? (
          <div className="card p-5">
            <GoalHeading
              className="eyebrow mb-2 flex min-w-0 items-center gap-1.5 text-xs text-[var(--color-muted)]"
              label={t('monthlyGoal')}
              hint={monthHint}
              icon={
                <svg
                  className="h-3.5 w-3.5 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              }
            />
            <p className="metric text-3xl font-semibold whitespace-nowrap">
              {goal.unit === 'time'
                ? formatHours(monthSeconds)
                : formatDistance(monthDistance)}
              <span className="ml-1 text-base font-normal text-[var(--color-muted)]">
                /{' '}
                {goal.unit === 'time'
                  ? `${Math.round(monthGoalMins / 60)}h`
                  : `${goal.monthly} km`}
              </span>
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-sunken)]">
              <div
                className="h-full rounded-full bg-[var(--color-accent)] transition-all"
                style={{
                  width: `${Math.min(goal.unit === 'time' ? (monthSeconds / (monthGoalMins * 60)) * 100 : (monthDistance / monthGoalMeters) * 100, 100)}%`,
                }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-sm text-[var(--color-muted)]">
              <span className="flex items-center gap-1.5">
                <svg
                  className="h-3.5 w-3.5 text-[var(--color-accent)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                {monthCount} {unit}
              </span>
              <span>{formatHours(monthSeconds)}</span>
            </div>
            <p
              className={`mt-1.5 text-xs ${monthDiff >= 0 ? 'text-emerald-600' : 'text-[var(--color-muted)]'}`}
            >
              {monthDiff >= 0 ? '↗' : '↘'}{' '}
              {goal.unit === 'time'
                ? formatHours(Math.abs(monthDiff))
                : `${formatDistance(Math.abs(monthDiff))} km`}{' '}
              {t('vsLastMonth')}
            </p>
          </div>
        ) : null}

        {/* Weekly Goal */}
        {showWeekly ? (
          <div className="card p-5">
            <GoalHeading
              className="eyebrow mb-2 flex min-w-0 items-center gap-1.5 text-xs text-[var(--color-muted)]"
              label={t('weeklyGoal')}
              hint={weekHint}
              icon={
                <svg
                  className="h-3.5 w-3.5 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              }
            />
            <p className="metric text-3xl font-semibold whitespace-nowrap">
              {goal.unit === 'time'
                ? formatHours(weekSeconds)
                : formatDistance(weekDistance)}
              <span className="ml-1 text-base font-normal text-[var(--color-muted)]">
                /{' '}
                {goal.unit === 'time'
                  ? `${weekGoalMins}m`
                  : `${goal.weekly} km`}
              </span>
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-sunken)]">
              <div
                className="h-full rounded-full bg-[var(--color-accent)] transition-all"
                style={{
                  width: `${Math.min(goal.unit === 'time' ? (weekSeconds / (weekGoalMins * 60)) * 100 : (weekDistance / weekGoalMeters) * 100, 100)}%`,
                }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-sm text-[var(--color-muted)]">
              <span className="flex items-center gap-1.5">
                <svg
                  className="h-3.5 w-3.5 text-[var(--color-accent)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                {weekCount} {unit}
              </span>
              <span>{formatHours(weekSeconds)}</span>
            </div>
            <p
              className={`mt-1.5 text-xs ${weekDiff >= 0 ? 'text-emerald-600' : 'text-[var(--color-muted)]'}`}
            >
              {weekDiff >= 0 ? '↗' : '↘'}{' '}
              {goal.unit === 'time'
                ? formatHours(Math.abs(weekDiff))
                : `${formatDistance(Math.abs(weekDiff))} km`}{' '}
              {t('vsLastWeek')}
            </p>
          </div>
        ) : null}

        {/* Streak */}
        {showStreak ? (
          <div className="card p-5">
            <p className="eyebrow mb-2 flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z"
                />
              </svg>
              {streakTitle}
            </p>
            <div className="flex items-baseline gap-3">
              <p className="metric text-3xl font-semibold">
                {shownStreakDays}
                <span className="ml-1 text-base font-normal text-[var(--color-muted)]">
                  {t('days')}
                </span>
              </p>
            </div>

            {/* Week days visual */}
            {(() => {
              const todayIdx = (calendarAnchor.getDay() + 6) % 7; // Mon=0 … Sun=6
              const weekStart = new Date(
                calendarAnchor.getTime() - todayIdx * 86400000
              );
              const weekLabels =
                locale === 'zh'
                  ? ['一', '二', '三', '四', '五', '六', '日']
                  : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

              function dayColor(acts: Activity[]): string {
                if (acts.length === 0) return '';
                const sorted = [...acts].sort(
                  (a, b) => b.distance - a.distance
                );
                const type = sorted[0].type;
                if (type === 'Run') return 'var(--color-amber)';
                return 'var(--color-text)';
              }

              const weekDays = Array.from({ length: 7 }, (_, i) => {
                const date = new Date(weekStart.getTime() + i * 86400000);
                const key = toLocalDateStr(date);
                const dayActs = calendarActivities.filter(
                  (a) => a.start_date_local.slice(0, 10) === key
                );
                return {
                  day: date.getDate(),
                  hasActivity: dayActs.length > 0,
                  isToday: key === calendarHighlight,
                  acts: dayActs,
                };
              });
              return (
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex shrink-0 flex-col items-center gap-0">
                    <div className="relative h-9 w-9">
                      <svg
                        className="h-9 w-9 text-[var(--color-amber)]"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M12 23c-3.866 0-7-3.134-7-7 0-2.468 1.5-5.093 3.03-6.97.44-.54 1.47-.36 1.64.3.17.66.54 1.44 1.13 2.07.26-.94.76-2.06 1.57-3.04.81-.98 1.49-2.09 1.78-3.36.12-.53.71-.78 1.15-.46C17.09 6.46 19 9.58 19 13.5c0 5.247-3.134 9.5-7 9.5z" />
                      </svg>
                      <span className="absolute right-0 bottom-[18%] left-0 flex items-center justify-center text-[9px] leading-none font-bold text-white">
                        {shownWeekStreak}
                      </span>
                    </div>
                    <span className="-mt-0.5 text-[11px] font-medium text-[var(--color-muted)]">
                      {t('weeks')}
                    </span>
                  </div>
                  <div className="flex flex-1 items-center gap-1.5">
                    {weekDays.map((wd, i) => {
                      const isPast =
                        new Date(weekStart.getTime() + i * 86400000) <=
                        calendarAnchor;
                      const color = dayColor(wd.acts);
                      return (
                        <div
                          key={i}
                          className={`flex flex-col items-center gap-0.5 ${wd.hasActivity ? 'cursor-pointer' : ''}`}
                          onClick={() => {
                            if (wd.acts.length > 0)
                              onSelectActivity(wd.acts[0]);
                          }}
                        >
                          <span className="text-[9px] text-[var(--color-muted)]">
                            {weekLabels[i]}
                          </span>
                          <div
                            className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-medium transition-opacity lg:h-6 lg:w-6 lg:text-[10px] ${
                              wd.hasActivity
                                ? 'text-white hover:opacity-70'
                                : wd.isToday
                                  ? 'text-[var(--color-text)] ring-1 ring-[var(--color-text)]'
                                  : isPast
                                    ? 'bg-[var(--color-sunken)] text-[var(--color-muted)]'
                                    : 'text-[var(--color-muted)]'
                            }`}
                            style={
                              wd.hasActivity ? { backgroundColor: color } : {}
                            }
                          >
                            {wd.day}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {streakFootnote ? (
              <div className="mt-3 flex items-center gap-2 text-sm text-[var(--color-muted)]">
                <svg
                  className="h-3.5 w-3.5 text-[var(--color-accent)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                  />
                </svg>
                {streakFootnote}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  /**
   * Compact (homepage) layout.
   *
   * Cards are declared once each and composed from config rather than from a
   * layout enum: `stats_order` decides sequence, `stats_hero` decides which
   * ones take a full-width row. Hero cards keep the big type; grid cards use
   * the compact tile treatment.
   *
   * Hero and grid cards are emitted in `stats_order` sequence, so a hero card
   * in the middle of the list splits the grid into two rows above and below it.
   */
  const cardDefs: Record<
    StatsCardKey,
    { enabled: boolean; render: (hero: boolean) => ReactNode } | null
  > = {
    yearly: showYearly
      ? {
          enabled: true,
          render: (hero) => (
            <div
              className={
                hero
                  ? 'card min-w-0 p-4 md:p-5'
                  : 'card flex h-full min-w-0 flex-col p-2 md:p-4'
              }
            >
              <p
                className={`eyebrow flex items-center gap-1 text-[var(--color-muted)] ${
                  hero
                    ? 'mb-2 text-[11px] tracking-[1.2px] md:text-xs'
                    : 'mb-1 text-[10px] md:mb-2 md:gap-1.5 md:text-xs'
                }`}
              >
                <svg
                  className="hidden h-3.5 w-3.5 md:block"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                <span className="truncate">{t('yearlyGoal')}</span>
              </p>
              <p
                className={`metric leading-tight font-semibold ${
                  hero
                    ? 'text-[32px] whitespace-nowrap md:text-[40px]'
                    : 'text-base md:text-2xl md:whitespace-nowrap'
                }`}
              >
                {goal.unit === 'time'
                  ? formatHours(yearSeconds)
                  : formatDistance(yearDistance)}
                <span
                  className={`font-normal text-[var(--color-muted)] ${
                    hero
                      ? 'ml-2 text-sm md:text-base'
                      : 'ml-0.5 text-[10px] md:ml-1 md:text-sm'
                  }`}
                >
                  /{' '}
                  {goal.unit === 'time'
                    ? `${Math.round(yearGoalMins / 60)}h`
                    : `${goal.yearly} km`}
                </span>
              </p>
              <div
                className={`overflow-hidden rounded-full bg-[var(--color-sunken)] ${
                  hero ? 'mt-3 h-[3px] md:mt-4' : 'mt-2 h-1 md:mt-3 md:h-1.5'
                }`}
              >
                <div
                  className="h-full rounded-full bg-[var(--color-accent)] transition-all"
                  style={{
                    width: `${Math.min(goal.unit === 'time' ? (yearSeconds / (yearGoalMins * 60)) * 100 : (yearDistance / (yearGoalMeters || 1)) * 100, 100)}%`,
                  }}
                />
              </div>
              <div
                className={`flex items-center justify-between text-[var(--color-muted)] ${
                  hero
                    ? 'mt-3 flex text-sm'
                    : 'mt-2 hidden text-sm md:mt-3 md:flex'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <svg
                    className="h-3.5 w-3.5 text-[var(--color-accent)]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  {yearCount} {unit}
                </span>
                <span>{formatHours(yearSeconds)}</span>
              </div>
              <p
                className={`truncate ${hero ? 'mt-2 text-xs' : 'mt-1 text-[9px] md:mt-1.5 md:text-xs'} ${yearDiff >= 0 ? 'text-emerald-600' : 'text-[var(--color-muted)]'}`}
              >
                {formatYearYoY(
                  yearDiff,
                  goal.unit,
                  locale,
                  formatHours,
                  t('vsLastYear')
                )}
              </p>
            </div>
          ),
        }
      : null,
    monthly: showMonthly
      ? {
          enabled: true,
          render: (hero) => (
            <div
              className={
                hero
                  ? 'card min-w-0 p-4 md:p-5'
                  : 'card flex h-full min-w-0 flex-col p-2 md:p-4'
              }
            >
              <GoalHeading
                className={`eyebrow flex min-w-0 items-center gap-1 text-[var(--color-muted)] ${
                  hero
                    ? 'mb-2 text-[11px] tracking-[1.2px] md:text-xs'
                    : 'mb-1 text-[10px] md:mb-2 md:gap-1.5 md:text-xs'
                }`}
                label={t('monthlyGoal')}
                hint={monthHint}
                icon={
                  <svg
                    className="hidden h-3.5 w-3.5 shrink-0 md:block"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                }
              />
              <p
                className={`metric leading-tight font-semibold ${
                  hero
                    ? 'text-[32px] whitespace-nowrap md:text-[40px]'
                    : 'text-base md:text-2xl md:whitespace-nowrap'
                }`}
              >
                {goal.unit === 'time'
                  ? formatHours(monthSeconds)
                  : formatDistance(monthDistance)}
                <span
                  className={`font-normal text-[var(--color-muted)] ${
                    hero
                      ? 'ml-2 text-sm md:text-base'
                      : 'ml-0.5 text-[10px] md:ml-1 md:text-sm'
                  }`}
                >
                  /{' '}
                  {goal.unit === 'time'
                    ? `${Math.round(monthGoalMins / 60)}h`
                    : `${goal.monthly} km`}
                </span>
              </p>
              <div
                className={`overflow-hidden rounded-full bg-[var(--color-sunken)] ${
                  hero ? 'mt-3 h-[3px] md:mt-4' : 'mt-2 h-1 md:mt-3 md:h-1.5'
                }`}
              >
                <div
                  className="h-full rounded-full bg-[var(--color-accent)] transition-all"
                  style={{
                    width: `${Math.min(goal.unit === 'time' ? (monthSeconds / (monthGoalMins * 60)) * 100 : (monthDistance / (monthGoalMeters || 1)) * 100, 100)}%`,
                  }}
                />
              </div>
              <div
                className={`flex items-center justify-between text-[var(--color-muted)] ${
                  hero
                    ? 'mt-3 flex text-sm'
                    : 'mt-2 hidden text-sm md:mt-3 md:flex'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <svg
                    className="h-3.5 w-3.5 text-[var(--color-accent)]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  {monthCount} {unit}
                </span>
                <span>{formatHours(monthSeconds)}</span>
              </div>
              <p
                className={`truncate ${hero ? 'mt-2 text-xs' : 'mt-1 text-[9px] md:mt-1.5 md:text-xs'} ${monthDiff >= 0 ? 'text-emerald-600' : 'text-[var(--color-muted)]'}`}
              >
                {monthDiff >= 0 ? '↗' : '↘'}{' '}
                {goal.unit === 'time'
                  ? formatHours(Math.abs(monthDiff))
                  : `${formatDistance(Math.abs(monthDiff))} km`}{' '}
                <span className="hidden sm:inline">{t('vsLastMonth')}</span>
              </p>
            </div>
          ),
        }
      : null,
    weekly: showWeekly
      ? {
          enabled: true,
          render: (hero) => (
            <div
              className={
                hero
                  ? 'card min-w-0 p-4 md:p-5'
                  : 'card flex h-full min-w-0 flex-col p-3 md:p-4'
              }
            >
              <GoalHeading
                className={`eyebrow flex min-w-0 items-center gap-1.5 text-[var(--color-muted)] ${
                  hero
                    ? 'mb-2 text-[11px] tracking-[1.2px] md:text-xs'
                    : 'mb-1 text-[10px] md:mb-2 md:text-xs'
                }`}
                label={t('weeklyGoal')}
                hint={weekHint}
                icon={
                  <svg
                    className="hidden h-3.5 w-3.5 shrink-0 md:block"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                }
              />
              <p
                className={`metric leading-none font-bold whitespace-nowrap ${
                  hero
                    ? 'text-[40px] md:text-[52px]'
                    : 'text-[26px] md:text-[30px]'
                }`}
              >
                {goal.unit === 'time'
                  ? formatHours(weekSeconds)
                  : formatDistance(weekDistance)}
                <span
                  className={`ml-2 font-medium text-[var(--color-muted)] ${
                    hero ? 'text-base md:text-xl' : 'text-sm md:text-base'
                  }`}
                >
                  /{' '}
                  {goal.unit === 'time'
                    ? `${weekGoalMins}m`
                    : `${goal.weekly} km`}
                </span>
              </p>
              <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-[#EFECE7] md:mt-4">
                <div
                  className="h-full rounded-full bg-[var(--color-accent)] transition-all"
                  style={{
                    width: `${Math.min(goal.unit === 'time' ? (weekSeconds / (weekGoalMins * 60 || 1)) * 100 : (weekDistance / (weekGoalMeters || 1)) * 100, 100)}%`,
                  }}
                />
              </div>
              <div className="mt-3 flex items-center justify-between text-sm text-[var(--color-muted)]">
                <span className="flex items-center gap-1.5">
                  <svg
                    className="h-3.5 w-3.5 text-[var(--color-accent)]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  {weekCount} {unit}
                </span>
                <span>{formatHours(weekSeconds)}</span>
              </div>
              <p
                className={`mt-2 text-xs ${weekDiff >= 0 ? 'text-emerald-600' : 'text-[var(--color-muted)]'}`}
              >
                {weekDiff >= 0 ? '↗' : '↘'}{' '}
                {goal.unit === 'time'
                  ? formatHours(Math.abs(weekDiff))
                  : `${formatDistance(Math.abs(weekDiff))} km`}{' '}
                <span className="hidden sm:inline">{t('vsLastWeek')}</span>
              </p>
            </div>
          ),
        }
      : null,
    streak: showStreak
      ? {
          enabled: true,
          render: (hero) => (
            <div
              className={`card min-w-0 overflow-hidden ${
                hero ? 'p-4 md:p-5' : 'flex h-full flex-col p-2 md:p-4'
              }`}
            >
              <p className="eyebrow mb-1.5 flex min-w-0 items-center gap-1 text-[10px] text-[var(--color-muted)] md:mb-2 md:gap-1.5 md:text-xs">
                <svg
                  className="h-3.5 w-3.5 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z"
                  />
                </svg>
                <span className="truncate">{streakTitle}</span>
              </p>

              {/*
                The streak card keeps its compact stacked layout in both cases:
                its content (a number plus a seven-day strip) does not scale up
                to a full-width row — it either bunched into the left corner
                with a large empty area beside it, or had to be stretched into
                seven wide tiles. It is therefore excluded from `stats_hero`.
              */}
              <div
                className={
                  hero
                    ? 'flex min-w-0 flex-wrap items-center gap-x-6 gap-y-3'
                    : 'flex min-w-0 flex-col gap-2 lg:block lg:gap-3'
                }
              >
                <p
                  className={`metric shrink-0 font-semibold ${hero ? 'text-3xl md:text-4xl' : 'text-xl lg:text-3xl'}`}
                >
                  {shownStreakDays}
                  <span
                    className={`ml-1 text-xs font-normal text-[var(--color-muted)] ${hero ? 'md:text-base' : 'lg:text-base'}`}
                  >
                    {t('days')}
                  </span>
                </p>

                {(() => {
                  const todayIdx = (calendarAnchor.getDay() + 6) % 7;
                  const weekStart = new Date(
                    calendarAnchor.getTime() - todayIdx * 86400000
                  );
                  const weekLabels =
                    locale === 'zh'
                      ? ['一', '二', '三', '四', '五', '六', '日']
                      : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

                  function dayColor(acts: Activity[]): string {
                    if (acts.length === 0) return '';
                    const sorted = [...acts].sort(
                      (a, b) => b.distance - a.distance
                    );
                    const type = sorted[0].type;
                    if (type === 'Run') return 'var(--color-amber)';
                    return 'var(--color-text)';
                  }

                  const weekDays = Array.from({ length: 7 }, (_, i) => {
                    const date = new Date(weekStart.getTime() + i * 86400000);
                    const key = toLocalDateStr(date);
                    const dayActs = calendarActivities.filter(
                      (a) => a.start_date_local.slice(0, 10) === key
                    );
                    return {
                      day: date.getDate(),
                      hasActivity: dayActs.length > 0,
                      isToday: key === calendarHighlight,
                      acts: dayActs,
                    };
                  });

                  return (
                    <div className="flex w-full min-w-0 items-center gap-1 lg:mt-3 lg:gap-1.5">
                      <div className="flex shrink-0 flex-col items-center gap-0">
                        <div className="relative h-6 w-6 lg:h-9 lg:w-9">
                          <svg
                            className="h-full w-full text-[var(--color-amber)]"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M12 23c-3.866 0-7-3.134-7-7 0-2.468 1.5-5.093 3.03-6.97.44-.54 1.47-.36 1.64.3.17.66.54 1.44 1.13 2.07.26-.94.76-2.06 1.57-3.04.81-.98 1.49-2.09 1.78-3.36.12-.53.71-.78 1.15-.46C17.09 6.46 19 9.58 19 13.5c0 5.247-3.134 9.5-7 9.5z" />
                          </svg>
                          <span className="absolute right-0 bottom-[18%] left-0 flex items-center justify-center text-[9px] leading-none font-bold text-white">
                            {shownWeekStreak}
                          </span>
                        </div>
                        <span className="-mt-0.5 text-[10px] font-medium text-[var(--color-muted)] lg:text-[11px]">
                          {t('weeks')}
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-1 items-center justify-between gap-0 px-0">
                        {weekDays.map((wd, i) => {
                          const isPast =
                            new Date(weekStart.getTime() + i * 86400000) <=
                            calendarAnchor;
                          const color = dayColor(wd.acts);
                          return (
                            <div
                              key={i}
                              className={`flex min-w-0 flex-col items-center gap-0.5 ${wd.hasActivity ? 'cursor-pointer' : ''}`}
                              onClick={() => {
                                if (wd.acts.length > 0)
                                  onSelectActivity(wd.acts[0]);
                              }}
                            >
                              <span className="text-[9px] text-[var(--color-muted)]">
                                {weekLabels[i]}
                              </span>
                              <div
                                className={`flex size-[1.125rem] shrink-0 items-center justify-center rounded-full text-[9px] leading-none font-medium transition-opacity ${
                                  wd.hasActivity
                                    ? 'text-white hover:opacity-70'
                                    : wd.isToday
                                      ? 'text-[var(--color-text)] ring-1 ring-[var(--color-text)]'
                                      : isPast
                                        ? 'bg-[var(--color-sunken)] text-[var(--color-muted)]'
                                        : 'text-[var(--color-muted)]'
                                }`}
                                style={
                                  wd.hasActivity
                                    ? { backgroundColor: color }
                                    : {}
                                }
                              >
                                {wd.day}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <p className="mt-1.5 truncate text-[9px] text-[var(--color-muted)] lg:hidden">
                {t('weeks')}: {shownWeekStreak}
                {longestStreak > 0
                  ? ` / ${t('longest')} ${longestStreak}${t('days')}`
                  : ''}
              </p>

              {streakFootnote ? (
                <div
                  className={`mt-3 items-center gap-2 text-sm text-[var(--color-muted)] ${hero ? 'flex' : 'hidden lg:flex'}`}
                >
                  <svg
                    className="h-3.5 w-3.5 text-[var(--color-accent)]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                    />
                  </svg>
                  {streakFootnote}
                </div>
              ) : null}
            </div>
          ),
        }
      : null,
  };

  const enabledKeys = statsOrder.filter((key) => cardDefs[key]?.enabled);
  if (enabledKeys.length === 0) return null;

  /**
   * At most one hero, and it always renders first.
   *
   * A hero card is a single emphasised row; making several of them hero-length
   * just stacks full-width rows and stretches everything below (the footprint
   * map ended up pushed far down). "Hero" also stops meaning anything once
   * everyone is one, so only the first configured hero wins.
   *
   * Moving it to the front — instead of leaving it wherever `stats_order` puts
   * it — keeps the remaining cards in one unbroken grid. A hero in the middle
   * used to split the grid, leaving a lone card at half width that read as a
   * stray banner.
   */
  const heroKey = statsOrder.find(
    (key) => cardDefs[key]?.enabled && statsHero.includes(key)
  );
  const orderedKeys = heroKey
    ? [heroKey, ...enabledKeys.filter((key) => key !== heroKey)]
    : enabledKeys;

  /**
   * Split into runs: the hero card is its own full-width block, and every
   * non-hero card shares a single grid below it.
   */
  const blocks: Array<
    { kind: 'hero'; key: StatsCardKey } | { kind: 'grid'; keys: StatsCardKey[] }
  > = [];
  if (heroKey) blocks.push({ kind: 'hero', key: heroKey });
  const gridKeys = orderedKeys.filter((key) => key !== heroKey);
  if (gridKeys.length > 0) blocks.push({ kind: 'grid', keys: gridKeys });

  /**
   * Column count for a grid run.
   *
   * A lone leftover card (a hero sitting in the middle of the order splits the
   * grid in two) used to stretch to the full row while still using the compact
   * tile treatment, which looked like a stray banner. Half width keeps it a
   * tile; two or more cards still fill their available columns.
   */
  const gridClassFor = (count: number) =>
    count === 1
      ? 'grid w-full min-w-0 grid-cols-1 gap-2 overflow-x-hidden md:grid-cols-2 md:gap-3'
      : count === 2
        ? 'grid w-full min-w-0 grid-cols-1 gap-2 overflow-x-hidden md:grid-cols-2 md:gap-3'
        : count === 3
          ? 'grid w-full min-w-0 grid-cols-1 gap-2 overflow-x-hidden md:grid-cols-3 md:gap-3'
          : 'grid w-full min-w-0 grid-cols-2 gap-2 overflow-x-hidden md:grid-cols-4 md:gap-3';

  return (
    <div className="flex flex-col gap-2 md:gap-3">
      {blocks.map((block, index) =>
        block.kind === 'hero' ? (
          <div key={`hero-${block.key}`}>
            {cardDefs[block.key]?.render(true)}
          </div>
        ) : (
          <div
            key={`grid-${index}`}
            className={gridClassFor(block.keys.length)}
          >
            {/*
              `h-full` on both the grid item and the card: grid items stretch to
              the row by default, but the card box is only as tall as its own
              content, so the streak card (which has an extra week row) rendered
              taller than its siblings and left the row visibly misaligned.
            */}
            {block.keys.map((key) => (
              <div key={key} className="h-full min-w-0">
                {cardDefs[key]?.render(false)}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
