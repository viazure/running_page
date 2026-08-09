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

const PAGE_SIZE = 16;

type DistanceFilter = 'all' | '10' | '20' | '40';

function typeIcon(type: string): string {
  const icons: Record<string, string> = {
    Run: '🏃',
  };
  return icons[type] ?? '📌';
}

function formatRowDate(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ');
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
  const [distFilter, setDistFilter] = useState<DistanceFilter>('all');
  const prevSelectedIdRef = useRef<Activity['run_id'] | null>(null);

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
      setPage(Math.floor(idx / PAGE_SIZE));
      return;
    }
    if (isNewSelection) {
      // Selected from map/calendar — reveal row by clearing distance filter
      if (distFilter !== 'all') setDistFilter('all');
    } else {
      // User's distance filter hid the current row — drop selection
      onSelectActivity?.(null);
    }
  }, [selectedActivity, sorted, distFilter, onSelectActivity]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE) || 1;
  const pageData = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const showType = useMemo(
    () => new Set(activities.map((a) => a.type)).size > 1,
    [activities]
  );

  const toggleSelect = (a: Activity) => {
    onSelectActivity?.(selectedActivity?.run_id === a.run_id ? null : a);
  };

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 md:p-6">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold">{t('activityLog')}</h2>
        <span className="text-sm text-[var(--color-muted)]">
          {t('showing')} {page * PAGE_SIZE + 1}-
          {Math.min((page + 1) * PAGE_SIZE, sorted.length)} {t('of')}{' '}
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
              <th className="min-w-[9.5rem] pr-3 pb-3 font-medium whitespace-nowrap">
                {t('date')}
              </th>
              <th className="w-28 max-w-[7rem] pr-4 pb-3 font-medium md:w-auto md:max-w-none">
                {t('name')}
              </th>
              <th className="pr-4 pb-3 font-medium whitespace-nowrap">
                {t('distance')}
              </th>
              {showType && (
                <th className="pr-4 pb-3 font-medium whitespace-nowrap">
                  {t('type')}
                </th>
              )}
              <th className="pr-4 pb-3 font-medium whitespace-nowrap">
                {t('duration')}
              </th>
              <th className="pr-4 pb-3 font-medium whitespace-nowrap">
                {t('pace')}
              </th>
              <th className="pb-3 font-medium whitespace-nowrap">{t('hr')}</th>
            </tr>
          </thead>
          <tbody>
            {pageData.map((a) => (
              <tr
                key={a.run_id}
                onClick={() => toggleSelect(a)}
                className={`cursor-pointer border-b border-[var(--color-border)]/30 transition-colors ${
                  selectedActivity?.run_id === a.run_id
                    ? 'border-l-2 border-l-[var(--color-accent)] bg-[var(--color-accent)]/10'
                    : 'hover:bg-[var(--color-bg)]'
                }`}
              >
                <td className="min-w-[9.5rem] py-3 pr-3 text-sm whitespace-nowrap text-[var(--color-muted)]">
                  {formatRowDate(a.start_date_local)}
                </td>
                <td className="w-28 max-w-[7rem] truncate py-3 pr-4 md:w-auto md:max-w-[12rem]">
                  {getTitle ? getTitle(a) : a.name || t('run')}
                </td>
                <td className="py-3 pr-4 font-mono font-medium whitespace-nowrap">
                  {(a.distance / 1000).toFixed(1)}
                  <span className="ml-1 text-xs font-normal text-[var(--color-muted)]">
                    km
                  </span>
                </td>
                {showType && (
                  <td className="py-3 pr-4 whitespace-nowrap text-[var(--color-muted)]">
                    {typeIcon(a.type)} {a.type}
                  </td>
                )}
                <td className="py-3 pr-4 whitespace-nowrap text-[var(--color-muted)]">
                  {formatDuration(a.moving_time)}
                </td>
                <td className="py-3 pr-4 whitespace-nowrap text-[var(--color-muted)]">
                  {formatPace(a.average_speed)}
                </td>
                <td className="py-3 whitespace-nowrap text-[var(--color-muted)]">
                  {a.average_heartrate ? Math.round(a.average_heartrate) : '--'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between border-t border-[var(--color-border)] pt-4">
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)] disabled:opacity-30"
        >
          ←
        </button>
        <span className="text-sm text-[var(--color-muted)]">
          {t('page')} {page + 1} {t('pageOf')} {totalPages} {t('pages')}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          disabled={page >= totalPages - 1}
          className="text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)] disabled:opacity-30"
        >
          →
        </button>
      </div>
    </div>
  );
}
