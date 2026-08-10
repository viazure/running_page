import '../dashboard/index.css';
import { lazy, startTransition, Suspense, useMemo, useState } from 'react';
import type { Activity } from '@/types';
import {
  useFilteredActivities,
  getAvailableYears,
  extractProvince,
  getActivityData,
} from '@/hooks/useActivities';
import { useTheme } from '@/hooks/useTheme';
import { useLocale } from '@/hooks/useLocale';
import { Header } from '@/components/Header';
import { StatsCards } from '@/components/StatsCards';
import { ContributionHeatmap } from '@/components/ContributionHeatmap';
import { ActivityLog } from '@/components/ActivityLog';
import { DualCalendarWidget } from '@/components/DualCalendarWidget';
import { ProfileCard } from '@/components/ProfileCard';
import {
  PrivacyUnlockProvider,
  usePrivacyUnlock,
} from '@/contexts/PrivacyUnlockContext';
import { resolveActivityTitle } from '@/core/privacyTitles';
import {
  PRIVACY_MODE,
  PRIVACY_ANONYMOUS_TITLES,
  GITHUB_URL,
} from '@/core/config';
import { CAN_PRIVACY_UNLOCK } from '@/core/privacyUnlock';
import { DashboardContentSkeleton } from '@/components/PageSkeleton';
import { TrendChart } from '@/components/TrendChart';

const loadRouteMap = () =>
  import('@/components/RouteMap').then((m) => ({ default: m.RouteMap }));
const loadTracksPage = () =>
  import('@/components/TracksPage').then((m) => ({ default: m.TracksPage }));
const loadSummaryPage = () =>
  import('@/components/SummaryPage').then((m) => ({ default: m.SummaryPage }));
const loadChinaMap = () =>
  import('@/components/ChinaMap').then((m) => ({ default: m.ChinaMap }));

const RouteMap = lazy(loadRouteMap);
const TracksPage = lazy(loadTracksPage);
const SummaryPage = lazy(loadSummaryPage);
const ChinaMap = lazy(loadChinaMap);

// Prefetch secondary pages so navigating home → summary/tracks does not flash Suspense.
void loadSummaryPage();
void loadTracksPage();
void loadRouteMap();
void loadChinaMap();

type Page = 'home' | 'tracks' | 'summary';

const FOOTER_YEAR = new Date().getFullYear();
const ACTIVITY_LOG_PAGE_SIZE = { mobile: 7, desktop: 16 } as const;

function MapFallback({
  className = 'h-[220px] md:h-[380px]',
}: {
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] text-sm text-[var(--color-muted)] ${className}`}
    >
      …
    </div>
  );
}

function DashboardProContent({
  page,
  dark,
  filter,
  onNavigateHome,
}: {
  page: Page;
  dark: boolean;
  filter: 'all';
  onNavigateHome: () => void;
}) {
  const activities = getActivityData() as Activity[];
  const isUnlocked = usePrivacyUnlock();
  const { locale } = useLocale();
  const years = getAvailableYears(activities);
  /** Default ALL so China map / stats show full history (not just current year). */
  const [year, setYear] = useState<number | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(
    null
  );
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null);

  const filtered = useFilteredActivities(activities, filter, year);
  const heatmapYear = year ?? years[0] ?? FOOTER_YEAR;
  const privacyActive = PRIVACY_MODE && !isUnlocked;
  const useAnonymousTitles = privacyActive && PRIVACY_ANONYMOUS_TITLES;
  const activityTitle = (a: Activity) =>
    resolveActivityTitle(a, locale, useAnonymousTitles);

  const provinceFiltered = useMemo(() => {
    if (!selectedProvince) return filtered;
    return filtered.filter(
      (a) => extractProvince(a.location_country) === selectedProvince
    );
  }, [filtered, selectedProvince]);

  if (page === 'tracks') {
    return (
      <Suspense>
        <TracksPage
          activities={activities}
          filter={filter}
          onSelectActivity={setSelectedActivity}
          onBack={onNavigateHome}
          getTitle={activityTitle}
          lightsOff={privacyActive}
          dark={dark}
        />
      </Suspense>
    );
  }

  if (page === 'summary') {
    return (
      <Suspense>
        <SummaryPage onBack={onNavigateHome} />
      </Suspense>
    );
  }

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 md:px-6">
      {/*
        Mobile order: Profile → Stats → sticky RouteMap → Calendar → ActivityLog
        → ChinaMap → Yearly Distance → Heatmap (bottom).
        Desktop (2×2):
          [Stats+Heatmap] [Profile(含PB) + Map]  ← row1 stretch
          [ActivityLog  ] [RouteMap+Calendar+Distance]  ← row2 stretch
      */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[1fr_380px] lg:grid-rows-[auto_auto] xl:grid-cols-[1fr_400px]">
        {/* Row1 left: stats + heatmap */}
        <div className="contents min-w-0 lg:col-start-1 lg:row-start-1 lg:flex lg:flex-col lg:gap-6">
          <div className="order-2 min-w-0 lg:order-none">
            <StatsCards
              activities={filtered}
              allActivities={activities}
              year={year}
              filter={filter}
              onSelectActivity={setSelectedActivity}
              compact
            />
          </div>
          <div className="order-9 min-w-0 overflow-hidden lg:order-none">
            <ContributionHeatmap
              activities={activities}
              year={heatmapYear}
              filter={filter}
              onSelectActivity={setSelectedActivity}
            />
          </div>
        </div>

        {/* Row1 right: profile (with PB) + map — stretches to heatmap bottom */}
        <div className="contents min-w-0 lg:col-start-2 lg:row-start-1 lg:flex lg:h-full lg:flex-col lg:gap-4 lg:overflow-hidden">
          <div className="order-1 min-w-0 overflow-hidden lg:order-none lg:shrink-0">
            <ProfileCard
              activities={activities}
              filter={filter}
              getTitle={activityTitle}
              onSelectActivity={setSelectedActivity}
              showRouteIcon
              showPersonalBest
              showLocationStats
            />
          </div>
          <div className="order-6 min-w-0 overflow-hidden lg:order-none lg:min-h-0 lg:flex-1">
            <Suspense
              fallback={
                <MapFallback className="h-[200px] lg:h-full lg:min-h-[180px]" />
              }
            >
              <ChinaMap
                activities={filtered}
                filter={filter}
                selectedProvince={selectedProvince}
                onSelectProvince={(p) => {
                  setSelectedProvince(p);
                  setSelectedActivity(null);
                }}
                className="h-[200px] lg:h-full"
              />
            </Suspense>
          </div>
        </div>

        {/* Row2 left: activity log */}
        <div className="order-5 min-w-0 overflow-hidden lg:order-none lg:col-start-1 lg:row-start-2">
          <ActivityLog
            activities={filtered}
            years={years}
            year={year}
            setYear={setYear}
            selectedActivity={selectedActivity}
            onSelectActivity={setSelectedActivity}
            filter={filter}
            getTitle={activityTitle}
            pageSize={ACTIVITY_LOG_PAGE_SIZE}
            variant="pro"
          />
        </div>

        {/* Row2 right: route map + calendar + trend — stretch to log bottom */}
        <div className="contents min-w-0 lg:col-start-2 lg:row-start-2 lg:flex lg:h-full lg:flex-col lg:gap-4 lg:overflow-hidden">
          {/* Mobile sticky: py-2 keeps light air above/below while stuck */}
          <div className="sticky top-16 z-40 order-3 -my-2 py-2 lg:static lg:z-auto lg:order-none lg:my-0 lg:shrink-0 lg:py-0">
            <Suspense
              fallback={<MapFallback className="h-[220px] lg:h-[260px]" />}
            >
              <RouteMap
                activities={provinceFiltered}
                selectedActivity={selectedActivity}
                dark={dark}
                lightsOff={privacyActive}
                onClearSelection={() => setSelectedActivity(null)}
                className="h-[220px] shadow-md md:h-[260px] lg:shadow-none"
              />
            </Suspense>
          </div>
          <div className="order-4 min-w-0 overflow-hidden lg:order-none lg:shrink-0">
            <DualCalendarWidget
              activities={activities}
              selectedActivity={selectedActivity}
              onSelectActivity={setSelectedActivity}
            />
          </div>
          <div className="order-7 min-w-0 lg:order-none lg:min-h-0 lg:flex-1">
            <TrendChart
              activities={filtered}
              year={heatmapYear}
              className="h-[260px] lg:h-full lg:min-h-[220px]"
            />
          </div>
        </div>
      </div>
    </main>
  );
}

function DashboardProInner() {
  const { dark, toggle } = useTheme();
  const [filter] = useState('all' as const);
  const [page, setPage] = useState<Page>('home');

  const navigate = (next: Page) => {
    // Keep previous page painted while lazy chunks resolve (avoids Suspense flash).
    startTransition(() => setPage(next));
  };

  return (
    <div
      className={
        page === 'summary'
          ? 'flex h-svh flex-col bg-[var(--color-bg)]'
          : 'min-h-screen bg-[var(--color-bg)]'
      }
      data-filter={filter}
    >
      <Header
        dark={dark}
        toggleTheme={toggle}
        page={page}
        onNavigate={navigate}
        enablePrivacyUnlock={CAN_PRIVACY_UNLOCK}
        showSummary
      />

      <div
        className={
          page === 'summary'
            ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
            : undefined
        }
      >
        <Suspense fallback={<DashboardContentSkeleton />}>
          <DashboardProContent
            page={page}
            dark={dark}
            filter={filter}
            onNavigateHome={() => navigate('home')}
          />
        </Suspense>
      </div>

      {page !== 'summary' ? (
        <footer className="border-t border-[var(--color-border)] py-6 text-center text-sm text-[var(--color-muted)]">
          &copy; {FOOTER_YEAR} Running Page 3.0 · Dashboard Pro
          {GITHUB_URL ? (
            <>
              {' · '}
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 transition-colors hover:text-[var(--color-accent)]"
              >
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.26.82-.577 0-.285-.01-1.04-.016-2.04-3.338.726-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.757-1.333-1.757-1.09-.745.083-.73.083-.73 1.205.085 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.76-1.605-2.665-.303-5.467-1.333-5.467-5.931 0-1.31.468-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.29-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.625-5.48 5.921.43.372.814 1.103.814 2.222 0 1.606-.015 2.898-.015 3.293 0 .32.216.694.825.576C20.565 21.796 24 17.297 24 12c0-6.63-5.37-12-12-12z" />
                </svg>
                GitHub
              </a>
            </>
          ) : null}
        </footer>
      ) : null}
    </div>
  );
}

export default function DashboardProTheme() {
  return (
    <PrivacyUnlockProvider>
      <DashboardProInner />
    </PrivacyUnlockProvider>
  );
}
