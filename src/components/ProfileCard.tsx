import type { Activity, SportFilter } from '../types';
import { useLocale } from '../hooks/useLocale';
import {
  formatDistance,
  parseMovingTime,
  extractProvince,
} from '../hooks/useActivities';
import { AVATAR } from '../config';
import {
  computePersonalBests,
  personalBestLabels,
  PersonalBestDivider,
  PersonalBestGrid,
} from './PersonalBest';

interface ProfileCardProps {
  activities: Activity[];
  filter?: SportFilter;
  getTitle?: (a: Activity) => string;
  onSelectActivity?: (a: Activity | null) => void;
  /** Show route SVG before total distance (dashboard_pro). Default false. */
  showRouteIcon?: boolean;
  /** Embed personal bests inside the card (dashboard_pro). Default false. */
  showPersonalBest?: boolean;
  /** Show "X countries · Y provinces". Default true (upstream). Pass false to hide. */
  showLocationStats?: boolean;
}

export function ProfileCard({
  activities,
  filter = 'all',
  getTitle,
  onSelectActivity,
  showRouteIcon = false,
  showPersonalBest = false,
  showLocationStats = true,
}: ProfileCardProps) {
  const { t, locale } = useLocale();

  // Filter activities by sport type for distance/count/time
  const filteredActivities =
    filter === 'all' ? activities : activities.filter((a) => a.type === filter);

  const totalDistance = filteredActivities.reduce((s, a) => s + a.distance, 0);
  const totalCount = filteredActivities.length;
  const totalSeconds = filteredActivities.reduce(
    (s, a) => s + parseMovingTime(a.moving_time),
    0
  );

  const allDates = activities.map((a) =>
    new Date(a.start_date_local).getFullYear()
  );
  const yearsActive =
    allDates.length > 0 ? Math.max(...allDates) - Math.min(...allDates) + 1 : 0;

  // Countries and provinces — use shared extractProvince for consistency with ChinaMap
  const countries = new Set<string>();
  const provinces = new Set<string>();
  for (const a of activities) {
    const loc = a.location_country;
    if (!loc || loc === 'None') continue;
    // Detect country
    if (loc.startsWith('{')) {
      try {
        const d = JSON.parse(loc.replace(/'/g, '"').replace(/None/g, 'null'));
        if (d.country) countries.add(d.country);
      } catch {
        /* ignore */
      }
    } else if (loc.includes('泰国')) {
      countries.add('泰国');
    } else if (loc.includes('日本')) {
      countries.add('日本');
    } else {
      countries.add('中国');
    }
    // Province — use shared logic (China-only)
    const p = extractProvince(loc);
    if (p) provinces.add(p);
  }

  const formatHours = (secs: number) => `${(secs / 3600).toFixed(1)}h`;

  const bests = computePersonalBests(activities);
  const hasBests = bests.some((b) => b.activity !== null);
  const pbLabels = personalBestLabels(locale);

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 transition-all duration-300 hover:border-[var(--color-accent)]/30 hover:bg-[var(--color-accent)]/5 hover:shadow-[var(--color-accent)]/5 hover:shadow-lg">
      {/* Avatar top-left + Distance */}
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 border-[var(--color-border)]">
          {AVATAR ? (
            <img
              src={AVATAR}
              alt="avatar"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[var(--color-accent)]/20">
              <svg
                className="h-7 w-7 text-[var(--color-accent)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                />
              </svg>
            </div>
          )}
        </div>
        <div className="flex-1 text-center">
          <p
            className={
              showRouteIcon
                ? 'flex items-center justify-center gap-2 font-mono text-3xl font-bold'
                : 'font-mono text-3xl font-bold'
            }
          >
            {showRouteIcon ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6 text-[var(--color-accent)]"
                aria-hidden
              >
                <circle cx="6" cy="19" r="3" />
                <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />
                <circle cx="18" cy="5" r="3" />
              </svg>
            ) : null}
            {formatDistance(totalDistance)}
            <span
              className={
                showRouteIcon
                  ? 'text-base font-normal text-[var(--color-muted)]'
                  : 'ml-1 text-base font-normal text-[var(--color-muted)]'
              }
            >
              km
            </span>
          </p>
          {showLocationStats ? (
            <p className="mt-0.5 flex items-center justify-center gap-1 text-sm text-[var(--color-muted)]">
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
                  d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {countries.size} {t('countries')} ·
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
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              {provinces.size} {t('provinces')}
            </p>
          ) : null}
        </div>
      </div>

      {/* Stats row - Strava style */}
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[var(--color-border)] pt-4 text-center">
        <div>
          <p className="flex items-center justify-center gap-1 text-xs text-[var(--color-muted)]">
            <svg
              className="h-3 w-3"
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
            {t('activitiesLabel')}
          </p>
          <p className="text-lg font-bold">{totalCount.toLocaleString()}</p>
        </div>
        <div className="border-x border-[var(--color-border)]">
          <p className="flex items-center justify-center gap-1 text-xs text-[var(--color-muted)]">
            <svg
              className="h-3 w-3"
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
            {t('yearsLabel')}
          </p>
          <p className="text-lg font-bold">{yearsActive}</p>
        </div>
        <div>
          <p className="flex items-center justify-center gap-1 text-xs text-[var(--color-muted)]">
            <svg
              className="h-3 w-3"
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
            {t('timeLabel')}
          </p>
          <p className="text-lg font-bold">{formatHours(totalSeconds)}</p>
        </div>
      </div>

      {/* Personal records — dashed label divider (dashboard_pro) */}
      {showPersonalBest && hasBests ? (
        <div className="mt-4">
          <PersonalBestDivider />
          <div className="mt-2">
            <PersonalBestGrid
              bests={bests}
              labels={pbLabels}
              onSelectActivity={onSelectActivity}
              getTitle={getTitle}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
