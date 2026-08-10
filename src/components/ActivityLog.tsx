import { useState, useEffect, useMemo, useRef } from 'react';
import type { Activity, SportFilter } from '../types';
import { formatDuration, formatPace } from '../hooks/useActivities';
import { useLocale } from '../hooks/useLocale';

interface ActivityLogProps {
  activities: Activity[];
  years: number[];
  year: number | null;
  setYear: (y: number | null) => void;
  selectedActivity?: Activity | null;
  onSelectActivity?: (a: Activity | null) => void;
  filter?: SportFilter;
  getTitle?: (a: Activity) => string;
}

const PAGE_SIZE_MOBILE = 7;
const PAGE_SIZE_DESKTOP = 16;
const LG_MQ = '(min-width: 1024px)';

type DistanceFilter = 'all' | '10' | '20' | '40';

function getActivityLogPageSize() {
  if (typeof window === 'undefined') return PAGE_SIZE_DESKTOP;
  return window.matchMedia(LG_MQ).matches
    ? PAGE_SIZE_DESKTOP
    : PAGE_SIZE_MOBILE;
}

function typeIcon(type: string): string {
  const icons: Record<string, string> = {
    Run: '🏃',
    Ride: '🚴',
    Hike: '🥾',
  };
  return icons[type] ?? '📌';
}

function typeLabel(type: string, t: (k: string) => string): string {
  if (type === 'Run') return t('run');
  if (type === 'Ride') return t('ride');
  if (type === 'Hike') return t('hike');
  return type;
}

function formatRowDate(iso: string): {
  full: string;
  ymd: string;
  time: string;
} {
  return {
    full: iso.slice(0, 16).replace('T', ' '),
    ymd: iso.slice(0, 10), // 2024-05-03
    time: iso.slice(11, 16), // 16:35
  };
}

export function ActivityLog({
  activities,
  years,
  year,
  setYear,
  selectedActivity,
  onSelectActivity,
  filter: _filter = 'all',
  getTitle,
}: ActivityLogProps) {
  const { t } = useLocale();
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(getActivityLogPageSize);
  const [distFilter, setDistFilter] = useState<DistanceFilter>('all');
  const prevSelectedIdRef = useRef<Activity['run_id'] | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(LG_MQ);
    const onChange = () => {
      setPageSize(mq.matches ? PAGE_SIZE_DESKTOP : PAGE_SIZE_MOBILE);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const sorted = useMemo(() => {
    const distFiltered = activities.filter((a) => {
      const km = a.distance / 1000;
      switch (distFilter) {
        case '10':
          return km >= 10 && km < 20;
        case '20':
          return km >= 20 && km < 40;
        case '40':
          return km >= 40;
        default:
          return true;
      }
    });
    return [...distFiltered].sort(
      (a, b) =>
        new Date(b.start_date_local).getTime() -
        new Date(a.start_date_local).getTime()
    );
  }, [activities, distFilter]);

  // Keep selection in view; don't fight the user when they change distance filter.
  useEffect(() => {
    if (!selectedActivity) {
      prevSelectedIdRef.current = null;
      return;
    }
    const id = selectedActivity.run_id;
    const isNewSelection = prevSelectedIdRef.current !== id;
    prevSelectedIdRef.current = id;

    const idx = sorted.findIndex((a) => a.run_id === id);
    if (idx >= 0) {
      setPage(Math.floor(idx / pageSize));
      return;
    }
    if (isNewSelection) {
      // Selected from map/calendar — reveal row by clearing distance filter
      if (distFilter !== 'all') setDistFilter('all');
    } else {
      // User's distance filter hid the current row — drop selection
      onSelectActivity?.(null);
    }
  }, [selectedActivity, sorted, distFilter, onSelectActivity, pageSize]);

  const totalPages = Math.ceil(sorted.length / pageSize) || 1;
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const pageData = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize);
  // When only one sport type, keep type column width but hide labels/values
  const showTypeContent = useMemo(() => {
    const types = new Set(sorted.map((a) => a.type));
    return types.size > 1;
  }, [sorted]);

  const toggleSelect = (a: Activity) => {
    onSelectActivity?.(selectedActivity?.run_id === a.run_id ? null : a);
  };

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 md:p-6">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold">{t('activityLog')}</h2>
        <span className="text-sm text-[var(--color-muted)]">
          {t('showing')} {safePage * pageSize + 1}-
          {Math.min((safePage + 1) * pageSize, sorted.length)} {t('of')}{' '}
          {sorted.length}
        </span>
      </div>

      {/* Year tabs — single row, swipe/scroll when overflow */}
      <div className="-mx-1 mb-3 flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          onClick={() => {
            setYear(null);
            setPage(0);
          }}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all ${year === null ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}
        >
          All
        </button>
        {years.map((y) => (
          <button
            key={y}
            onClick={() => {
              setYear(y);
              setPage(0);
            }}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all ${year === y ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}
          >
            {y}
          </button>
        ))}
      </div>

      {/* Distance filter */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(
          [
            ['all', t('all')],
            ['10', '10km+'],
            ['20', '20km+'],
            ['40', '40km+'],
          ] as [DistanceFilter, string][]
        ).map(([val, label]) => (
          <button
            key={val}
            onClick={() => {
              setDistFilter(val);
              setPage(0);
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${distFilter === val ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Horizontal scroll — content-sized cols so name doesn't eat the viewport */}
      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <table className="w-max min-w-full border-collapse text-sm md:w-full">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-muted)]">
              <th className="w-[5.75rem] py-0 pr-3 pb-3 pl-3 font-medium whitespace-nowrap md:w-[10.5rem] md:pr-6 md:pl-5">
                {t('date')}
              </th>
              <th
                className={`pr-2 pb-3 font-medium whitespace-nowrap md:w-[1%] md:pr-3 ${
                  showTypeContent ? '' : 'hidden md:table-cell'
                }`}
              >
                <span className={showTypeContent ? undefined : 'invisible'}>
                  {t('type')}
                </span>
              </th>
              <th className="max-w-[5.5rem] min-w-0 pr-3 pb-3 font-medium md:w-auto md:max-w-[12rem]">
                {t('name')}
              </th>
              <th className="pr-3 pb-3 font-medium whitespace-nowrap md:pr-4">
                {t('distance')}
              </th>
              <th className="pr-3 pb-3 font-medium whitespace-nowrap md:pr-4">
                {t('duration')}
              </th>
              <th className="pr-3 pb-3 font-medium whitespace-nowrap md:pr-4">
                {t('pace')}
              </th>
              <th className="pr-3 pb-3 font-medium whitespace-nowrap md:pr-4">
                {t('hr')}
              </th>
            </tr>
          </thead>
          <tbody>
            {pageData.map((a) => {
              const date = formatRowDate(a.start_date_local);
              return (
                <tr
                  key={a.run_id}
                  onClick={() => toggleSelect(a)}
                  className={`cursor-pointer border-b border-[var(--color-border)]/30 transition-colors ${
                    selectedActivity?.run_id === a.run_id
                      ? 'border-l-2 border-l-[var(--color-accent)] bg-[var(--color-accent)]/10'
                      : 'hover:bg-[var(--color-bg)]'
                  }`}
                >
                  <td className="w-[5.75rem] py-3 pr-3 pl-3 text-sm text-[var(--color-muted)] md:w-[10.5rem] md:pr-6 md:pl-5 md:whitespace-nowrap">
                    {/* Mobile: stacked ymd (small) + time — clear year, saves width */}
                    <span className="flex flex-col leading-tight md:hidden">
                      <span className="text-[10px] tracking-wide opacity-70">
                        {date.ymd}
                      </span>
                      <span className="font-mono tabular-nums">
                        {date.time}
                      </span>
                    </span>
                    <span className="hidden whitespace-nowrap md:inline">
                      {date.full}
                    </span>
                  </td>
                  <td
                    className={`py-3 pr-2 whitespace-nowrap text-[var(--color-muted)] md:w-[1%] md:pr-3 ${
                      showTypeContent ? '' : 'hidden md:table-cell'
                    }`}
                  >
                    <span
                      className={showTypeContent ? undefined : 'invisible'}
                      aria-hidden={!showTypeContent}
                    >
                      {typeIcon(a.type)} {typeLabel(a.type, t)}
                    </span>
                  </td>
                  <td className="max-w-[5.5rem] min-w-0 truncate py-3 pr-3 md:max-w-[14rem] md:pr-4">
                    {getTitle ? getTitle(a) : a.name || t('run')}
                  </td>
                  <td className="py-3 pr-3 font-mono font-medium whitespace-nowrap md:pr-4">
                    {(a.distance / 1000).toFixed(1)}
                    <span className="ml-1 text-xs font-normal text-[var(--color-muted)]">
                      km
                    </span>
                  </td>
                  <td className="py-3 pr-3 whitespace-nowrap text-[var(--color-muted)] md:pr-4">
                    {formatDuration(a.moving_time)}
                  </td>
                  <td className="py-3 pr-3 whitespace-nowrap text-[var(--color-muted)] md:pr-4">
                    {formatPace(a.average_speed)}
                  </td>
                  <td className="py-3 pr-3 whitespace-nowrap text-[var(--color-muted)] md:pr-4">
                    {a.average_heartrate
                      ? Math.round(a.average_heartrate)
                      : '--'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between border-t border-[var(--color-border)] pt-4">
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={safePage === 0}
          className="text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)] disabled:opacity-30"
        >
          ←
        </button>
        <span className="text-sm text-[var(--color-muted)]">
          {t('page')} {safePage + 1} {t('pageOf')} {totalPages} {t('pages')}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          disabled={safePage >= totalPages - 1}
          className="text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)] disabled:opacity-30"
        >
          →
        </button>
      </div>
    </div>
  );
}
