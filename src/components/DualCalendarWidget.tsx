import { useEffect, useMemo, useState } from 'react';
import * as polyline from '@mapbox/polyline';
import type { Activity } from '@/types';
import { formatDistance } from '@/hooks/useActivities';
import { useLocale } from '@/hooks/useLocale';

interface DualCalendarWidgetProps {
  activities: Activity[];
  selectedActivity?: Activity | null;
  onSelectActivity: (activity: Activity | null) => void;
}

type ViewMode = 'distance' | 'route';

const ROUTE_SVG_SIZE = 100;

function renderTrackSVG(
  summaryPolyline: string,
  size = ROUTE_SVG_SIZE
): string {
  try {
    let coords = polyline.decode(summaryPolyline);
    if (coords.length < 2) return '';
    if (coords.length > 80) {
      const step = Math.ceil(coords.length / 80);
      coords = coords.filter(
        (_, i) => i % step === 0 || i === coords.length - 1
      );
    }
    const lats = coords.map((c) => c[0]);
    const lngs = coords.map((c) => c[1]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latRange = maxLat - minLat || 0.001;
    const lngRange = maxLng - minLng || 0.001;
    const pad = 8;
    const scale = Math.min(
      (size - pad * 2) / lngRange,
      (size - pad * 2) / latRange
    );
    const offsetX = (size - lngRange * scale) / 2;
    const offsetY = (size - latRange * scale) / 2;
    return coords
      .map(([lat, lng]) => {
        const x = (lng - minLng) * scale + offsetX;
        const y = size - ((lat - minLat) * scale + offsetY);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  } catch {
    return '';
  }
}

function ChevronLeft() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/** Distance view — classic diagonal ruler, horizontally flipped. */
function DistanceIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <g transform="scale(-1 1) translate(-24 0)">
        <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z" />
        <path d="m14.5 12.5 2-2" />
        <path d="m11.5 9.5 2-2" />
        <path d="m8.5 6.5 2-2" />
        <path d="m17.5 15.5 2-2" />
      </g>
    </svg>
  );
}

/** Route view — start / end markers + trail (R1). */
function RouteIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="6" cy="19" r="2.5" />
      <circle cx="18" cy="5" r="2.5" />
      <path d="M7.5 17c1.5-3 3-6 5.5-8 1.5-1.2 3-1.5 4-1" />
    </svg>
  );
}

/**
 * Day + distance tip (no filled pill).
 * `always` — distance view: muted by default, emphasize only when selected.
 * Otherwise — route view: show on hover with soft glow.
 */
function DayHoverCard({
  day,
  distanceM,
  always = false,
  selected = false,
}: {
  day: number;
  distanceM: number;
  always?: boolean;
  selected?: boolean;
}) {
  const km = (distanceM / 1000).toFixed(1);
  const emphasize = selected;

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center transition-opacity duration-150 ease-out ${
        always ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}
      aria-hidden={!always}
    >
      <div
        className={`flex flex-col items-center justify-center transition-[filter,color] duration-150 ease-out ${
          emphasize
            ? 'drop-shadow-[0_0_6px_color-mix(in_srgb,var(--color-accent)_35%,transparent)]'
            : always
              ? ''
              : 'group-hover:drop-shadow-[0_0_10px_color-mix(in_srgb,var(--color-accent)_55%,transparent)]'
        }`}
      >
        <span
          className={`text-sm leading-none tabular-nums sm:text-base ${
            emphasize
              ? 'font-bold text-[var(--color-accent)]'
              : always
                ? 'font-medium text-[var(--color-muted)]'
                : 'font-bold text-[var(--color-text)]'
          }`}
        >
          {day}
        </span>
        <span className="mt-1 inline-flex items-baseline gap-0.5 leading-none">
          <span
            className={`text-[11px] tabular-nums sm:text-xs ${
              emphasize
                ? 'font-medium text-[var(--color-accent)]'
                : 'font-medium text-[var(--color-muted)]'
            }`}
          >
            {km}
          </span>
          <span
            className={`text-[9px] ${
              emphasize
                ? 'text-[var(--color-accent)]/70'
                : 'text-[var(--color-muted)]/70'
            }`}
          >
            km
          </span>
        </span>
      </div>
    </div>
  );
}

function pickDayActivity(
  acts: Activity[],
  selectedActivity: Activity | null | undefined
): Activity | null {
  if (acts.length === 0) return null;
  if (selectedActivity) {
    const match = acts.find((a) => a.run_id === selectedActivity.run_id);
    if (match) return match;
  }
  return acts.find((a) => a.summary_polyline) ?? acts[0];
}

type DayCell = { day: number; activities: Activity[]; distance: number };

export function DualCalendarWidget({
  activities,
  selectedActivity,
  onSelectActivity,
}: DualCalendarWidgetProps) {
  const { t } = useLocale();
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [viewMode, setViewMode] = useState<ViewMode>('distance');

  // Jump calendar to the selected activity's month.
  useEffect(() => {
    if (!selectedActivity) return;
    const d = new Date(selectedActivity.start_date_local);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }, [selectedActivity?.run_id]);

  const selectedDay = useMemo(() => {
    if (!selectedActivity) return null;
    const d = new Date(selectedActivity.start_date_local);
    if (d.getFullYear() !== viewYear || d.getMonth() !== viewMonth) return null;
    return d.getDate();
  }, [selectedActivity, viewYear, viewMonth]);

  const { days, monthDistance, leadingBlanks } = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    const dayActivities = new Map<number, Activity[]>();
    for (const a of activities) {
      const d = new Date(a.start_date_local);
      if (d.getFullYear() === viewYear && d.getMonth() === viewMonth) {
        const day = d.getDate();
        const arr = dayActivities.get(day) || [];
        arr.push(a);
        dayActivities.set(day, arr);
      }
    }

    let totalDist = 0;
    for (const acts of dayActivities.values()) {
      totalDist += acts.reduce((s, a) => s + a.distance, 0);
    }

    const days: DayCell[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const acts = dayActivities.get(d) || [];
      days.push({
        day: d,
        activities: acts,
        distance: acts.reduce((s, a) => s + a.distance, 0),
      });
    }

    return {
      days,
      monthDistance: totalDist,
      leadingBlanks: firstDay,
    };
  }, [activities, viewYear, viewMonth]);

  const routePointsByDay = useMemo(() => {
    const map = new Map<number, string>();
    for (const d of days) {
      if (d.activities.length === 0) continue;
      const primary = pickDayActivity(d.activities, selectedActivity);
      if (primary?.summary_polyline) {
        const pts = renderTrackSVG(primary.summary_polyline);
        if (pts) map.set(d.day, pts);
      }
    }
    return map;
  }, [days, selectedActivity]);

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else setViewMonth(viewMonth + 1);
  };

  const handleDayClick = (d: DayCell) => {
    if (d.activities.length === 0) return;
    const isSelected = selectedDay != null && d.day === selectedDay;
    const match =
      selectedActivity &&
      d.activities.find((a) => a.run_id === selectedActivity.run_id);
    if (match && isSelected) {
      onSelectActivity(null);
      return;
    }
    onSelectActivity(
      pickDayActivity(d.activities, selectedActivity) ?? d.activities[0]
    );
  };

  const dayNames = [
    { key: 'sun', label: 'S' },
    { key: 'mon', label: 'M' },
    { key: 'tue', label: 'T' },
    { key: 'wed', label: 'W' },
    { key: 'thu', label: 'T' },
    { key: 'fri', label: 'F' },
    { key: 'sat', label: 'S' },
  ];
  const monthStr = `${String(viewMonth + 1).padStart(2, '0')}/${viewYear}`;

  return (
    <div className="flex w-full min-w-0 flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="flex min-w-0 flex-1 items-baseline gap-2 text-lg font-bold whitespace-nowrap text-[var(--color-text)]">
          <span className="tabular-nums">{monthStr}</span>
          <span className="text-sm font-normal text-[var(--color-muted)] tabular-nums">
            {formatDistance(monthDistance)} km
          </span>
        </h3>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="flex gap-1 rounded-lg bg-[var(--color-border)]/50 p-1">
            <button
              type="button"
              onClick={prevMonth}
              aria-label="Previous month"
              className="rounded-full p-1 text-[var(--color-muted)] transition-colors duration-150 ease-out hover:bg-[var(--color-border)] hover:text-[var(--color-text)]"
            >
              <ChevronLeft />
            </button>
            <button
              type="button"
              onClick={nextMonth}
              aria-label="Next month"
              className="rounded-full p-1 text-[var(--color-muted)] transition-colors duration-150 ease-out hover:bg-[var(--color-border)] hover:text-[var(--color-text)]"
            >
              <ChevronRight />
            </button>
          </div>

          <div
            className="flex rounded-lg bg-[var(--color-border)]/50 p-1"
            role="group"
            aria-label={t('viewMode')}
          >
            <button
              type="button"
              title={t('distanceView')}
              aria-label={t('distanceView')}
              aria-pressed={viewMode === 'distance'}
              onClick={() => setViewMode('distance')}
              className={`rounded-md p-1.5 transition-all duration-150 ease-out ${
                viewMode === 'distance'
                  ? 'bg-[var(--color-accent)] text-white shadow-sm'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              <DistanceIcon />
            </button>
            <button
              type="button"
              title={t('routeView')}
              aria-label={t('routeView')}
              aria-pressed={viewMode === 'route'}
              onClick={() => setViewMode('route')}
              className={`rounded-md p-1.5 transition-all duration-150 ease-out ${
                viewMode === 'route'
                  ? 'bg-[var(--color-accent)] text-white shadow-sm'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              <RouteIcon />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 sm:gap-3 md:gap-4">
        {dayNames.map((d) => (
          <div
            key={d.key}
            className="py-1 text-center text-xs font-medium text-[var(--color-muted)]/60"
          >
            {d.label}
          </div>
        ))}

        {Array.from({ length: leadingBlanks }, (_, slot) => (
          <div
            key={`pad-${viewYear}-${viewMonth}-s${slot}`}
            className="bg-transparent"
          />
        ))}

        {days.map((d) => {
          const hasActivity = d.activities.length > 0;
          const isSelected = selectedDay != null && d.day === selectedDay;
          const routePoints = routePointsByDay.get(d.day);

          if (viewMode === 'route') {
            return (
              <button
                key={d.day}
                type="button"
                disabled={!hasActivity}
                onClick={() => handleDayClick(d)}
                className={`group relative aspect-square overflow-visible rounded-lg sm:rounded-2xl ${
                  hasActivity ? 'cursor-pointer' : 'cursor-default'
                }`}
              >
                {!hasActivity ? (
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-[var(--color-muted)]/65 tabular-nums">
                    {d.day}
                  </span>
                ) : (
                  <>
                    {routePoints ? (
                      <svg
                        viewBox={`0 0 ${ROUTE_SVG_SIZE} ${ROUTE_SVG_SIZE}`}
                        className={`absolute inset-0 size-full transition-[opacity,filter] duration-150 ease-out group-hover:opacity-0 ${
                          isSelected
                            ? 'drop-shadow-[0_0_5px_color-mix(in_srgb,var(--color-accent)_40%,transparent)]'
                            : ''
                        }`}
                        preserveAspectRatio="xMidYMid meet"
                        aria-hidden
                      >
                        <polyline
                          points={routePoints}
                          fill="none"
                          stroke="var(--color-accent)"
                          strokeWidth={2.4}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                        />
                      </svg>
                    ) : null}
                    <DayHoverCard day={d.day} distanceM={d.distance} />
                  </>
                )}
              </button>
            );
          }

          // Distance view — plain number, no pill fill
          if (!hasActivity) {
            return (
              <div
                key={d.day}
                className="relative flex aspect-square items-center justify-center"
              >
                <span className="text-xs font-medium text-[var(--color-muted)]/65 tabular-nums">
                  {d.day}
                </span>
              </div>
            );
          }

          return (
            <button
              key={d.day}
              type="button"
              onClick={() => handleDayClick(d)}
              className="group relative flex aspect-square cursor-pointer items-center justify-center overflow-visible"
            >
              <DayHoverCard
                day={d.day}
                distanceM={d.distance}
                always
                selected={isSelected}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
