import type { Activity } from '../types';
import { parseMovingTime } from '../hooks/useActivities';
import { useLocale } from '../hooks/useLocale';
import type { Locale } from '../core/i18n';

export type PersonalBestKey = '5K' | '10K' | 'Half Marathon' | 'Marathon';

export type PersonalBestEntry = {
  key: PersonalBestKey;
  activity: Activity | null;
  time: number;
};

const DISTANCES: {
  key: PersonalBestKey;
  min: number;
  max: number;
}[] = [
  { key: '5K', min: 4.8, max: 5.5 },
  { key: '10K', min: 9.5, max: 11 },
  { key: 'Half Marathon', min: 20, max: 22.5 },
  { key: 'Marathon', min: 41, max: 44 },
];

export function formatPbTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function personalBestLabels(
  locale: Locale
): Record<PersonalBestKey, string> {
  return locale === 'zh'
    ? {
        '5K': '5 公里',
        '10K': '10 公里',
        'Half Marathon': '半程马拉松',
        Marathon: '马拉松',
      }
    : {
        '5K': '5K',
        '10K': '10K',
        'Half Marathon': 'Half Marathon',
        Marathon: 'Marathon',
      };
}

/** Outdoor runs with valid GPS + reasonable pace within distance bands */
export function computePersonalBests(
  activities: Activity[]
): PersonalBestEntry[] {
  const runs = activities.filter(
    (a) =>
      a.type === 'Run' && a.summary_polyline && a.summary_polyline.length > 20
  );

  return DISTANCES.map(({ key, min, max }) => {
    const matching = runs.filter((a) => {
      const km = a.distance / 1000;
      if (km < min || km > max) return false;
      const time = parseMovingTime(a.moving_time);
      const pacePerKm = time / km;
      return pacePerKm >= 180 && pacePerKm <= 480;
    });
    if (matching.length === 0) return { key, activity: null, time: 0 };
    const best = matching.reduce((b, a) => {
      return parseMovingTime(a.moving_time) < parseMovingTime(b.moving_time)
        ? a
        : b;
    });
    return { key, activity: best, time: parseMovingTime(best.moving_time) };
  });
}

/** ---------- Personal Best -------- */
export function PersonalBestDivider() {
  const { t } = useLocale();
  return (
    <div
      className="flex items-center gap-2.5"
      role="separator"
      aria-label={t('personalBest')}
    >
      <span className="h-px min-w-4 flex-1 bg-[var(--color-border)]" />
      <span className="shrink-0 text-[10px] tracking-[0.12em] text-[var(--color-muted)]">
        {t('personalBest')}
      </span>
      <span className="h-px min-w-4 flex-1 bg-[var(--color-border)]" />
    </div>
  );
}

interface PersonalBestProps {
  activities: Activity[];
  onSelectActivity?: (a: Activity | null) => void;
  getTitle?: (a: Activity) => string;
  className?: string;
  /** Default `'list'` = upstream star header + rows. Pass `'grid'` for pro. */
  layout?: 'list' | 'grid';
}

/** Standalone card. Default list matches upstream; grid is dashboard_pro. */
export function PersonalBest({
  activities,
  onSelectActivity,
  getTitle,
  className = '',
  layout = 'list',
}: PersonalBestProps) {
  const { locale, t } = useLocale();
  const bests = computePersonalBests(activities);
  const labels = personalBestLabels(locale);
  const hasBests = bests.some((b) => b.activity !== null);
  if (!hasBests) return null;

  if (layout === 'grid') {
    return (
      <div
        className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 ${className}`}
      >
        <PersonalBestDivider />
        <div className="mt-2">
          <PersonalBestGrid
            bests={bests}
            labels={labels}
            onSelectActivity={onSelectActivity}
            getTitle={getTitle}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 transition-all duration-300 hover:border-[var(--color-accent)]/30 hover:bg-[var(--color-accent)]/5 hover:shadow-[var(--color-accent)]/5 hover:shadow-lg ${className}`}
    >
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <svg
          className="h-4 w-4 text-[var(--color-accent)]"
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
        {t('personalBest')}
      </h3>

      <div className="divide-y divide-[var(--color-border)]">
        {bests.map(({ key, activity, time }) => (
          <div
            key={key}
            className={`flex items-center justify-between py-1.5 ${
              activity
                ? '-mx-2 cursor-pointer rounded-lg px-2 transition-colors hover:bg-[var(--color-bg)]'
                : ''
            }`}
            onClick={() => activity && onSelectActivity?.(activity)}
          >
            <span className="text-xs text-[var(--color-text)]">
              {labels[key]}
            </span>
            <span
              className={`font-mono text-xs font-bold ${activity ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'}`}
            >
              {activity ? formatPbTime(time) : '--'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PersonalBestGrid({
  bests,
  labels,
  onSelectActivity,
  getTitle,
}: {
  bests: PersonalBestEntry[];
  labels: Record<PersonalBestKey, string>;
  onSelectActivity?: (a: Activity | null) => void;
  /** Optional title resolver (e.g. privacy anonymous titles) for tooltip/a11y */
  getTitle?: (a: Activity) => string;
}) {
  return (
    <div className="grid grid-cols-4 gap-1">
      {bests.map(({ key, activity, time }) => {
        const clickable = Boolean(activity);
        const label = activity
          ? (getTitle?.(activity) ?? activity.name)
          : undefined;
        return (
          <div
            key={key}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            title={label}
            aria-label={label ? `${labels[key]}: ${label}` : labels[key]}
            onClick={() => activity && onSelectActivity?.(activity)}
            onKeyDown={(e) => {
              if (!activity) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectActivity?.(activity);
              }
            }}
            className={`rounded-md px-1 py-1.5 text-center transition-colors ${
              clickable
                ? 'cursor-pointer hover:bg-[var(--color-accent)]/10'
                : 'opacity-45'
            }`}
          >
            <div className="truncate text-[10px] tracking-wide text-[var(--color-muted)]">
              {labels[key]}
            </div>
            <div
              className={`mt-0.5 font-mono text-xs font-bold tabular-nums ${
                activity
                  ? 'text-[var(--color-accent)]'
                  : 'text-[var(--color-muted)]'
              }`}
            >
              {activity ? formatPbTime(time) : '--'}
            </div>
          </div>
        );
      })}
    </div>
  );
}
