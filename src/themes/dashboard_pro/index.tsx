import '../dashboard/index.css';
import { lazy, Suspense, useMemo, useState } from 'react';
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
import { CalendarWidget } from '@/components/CalendarWidget';
import { ProfileCard } from '@/components/ProfileCard';
import { PersonalBest } from '@/components/PersonalBest';
import { ChinaMap } from '@/components/ChinaMap';
import {
  PrivacyUnlockProvider,
  usePrivacyUnlock,
} from '@/contexts/PrivacyUnlockContext';
import { resolveActivityTitle } from '@/core/privacyTitles';
import { PRIVACY_MODE, PRIVACY_ANONYMOUS_TITLES } from '@/core/config';
import { CAN_PRIVACY_UNLOCK } from '@/core/privacyUnlock';

const RouteMap = lazy(() =>
  import('@/components/RouteMap').then((m) => ({ default: m.RouteMap }))
);
const TracksPage = lazy(() =>
  import('@/components/TracksPage').then((m) => ({ default: m.TracksPage }))
);

type Page = 'home' | 'tracks';

function MapFallback({ height = 280 }: { height?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] text-sm text-[var(--color-muted)]"
      style={{ height }}
    >
      …
    </div>
  );
}

function DashboardProInner() {
  const activities = getActivityData() as Activity[];
  const isUnlocked = usePrivacyUnlock();
  const { locale } = useLocale();
  const { dark, toggle } = useTheme();
  const [filter] = useState('all' as const);
  const [year, setYear] = useState<number | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(
    null
  );
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null);
  const [page, setPage] = useState<Page>('home');

  const years = getAvailableYears(activities);
  const filtered = useFilteredActivities(activities, filter, year);
  const heatmapYear = year ?? years[0] ?? new Date().getFullYear();
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

  return (
    <div className="min-h-screen bg-[var(--color-bg)]" data-filter={filter}>
      <Header
        dark={dark}
        toggleTheme={toggle}
        activities={activities}
        page={page}
        onNavigate={setPage}
        enablePrivacyUnlock={CAN_PRIVACY_UNLOCK}
      />

      {page === 'tracks' ? (
        <Suspense
          fallback={
            <div className="flex min-h-[60vh] items-center justify-center text-sm text-[var(--color-muted)]">
              …
            </div>
          }
        >
          <TracksPage
            activities={filtered}
            filter={filter}
            onSelectActivity={setSelectedActivity}
            onBack={() => setPage('home')}
            getTitle={activityTitle}
            lightsOff={privacyActive}
          />
        </Suspense>
      ) : (
        <main className="mx-auto max-w-[1400px] px-6 py-6">
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_380px]">
            <div className="min-w-0 space-y-6 overflow-hidden">
              <StatsCards
                activities={filtered}
                allActivities={activities}
                year={year}
                filter={filter}
                onSelectActivity={setSelectedActivity}
              />
              <ContributionHeatmap
                activities={filtered}
                year={heatmapYear}
                filter={filter}
                onSelectActivity={setSelectedActivity}
              />
              <ActivityLog
                activities={filtered}
                years={years}
                year={year}
                setYear={setYear}
                selectedActivity={selectedActivity}
                onSelectActivity={setSelectedActivity}
                filter={filter}
                getTitle={activityTitle}
              />
            </div>

            <div className="flex min-w-0 flex-col gap-6 overflow-hidden">
              <ProfileCard
                activities={activities}
                filter={filter}
                getTitle={activityTitle}
                hideLocationStats={privacyActive}
              />
              <ChinaMap
                activities={filtered}
                filter={filter}
                selectedProvince={selectedProvince}
                onSelectProvince={(p) => {
                  setSelectedProvince(p);
                  setSelectedActivity(null);
                }}
              />
              <Suspense fallback={<MapFallback />}>
                <RouteMap
                  activities={provinceFiltered}
                  selectedActivity={selectedActivity}
                  dark={dark}
                  lightsOff={privacyActive}
                  onClearSelection={() => setSelectedActivity(null)}
                />
              </Suspense>
              <PersonalBest
                activities={activities}
                onSelectActivity={setSelectedActivity}
              />
              <CalendarWidget
                activities={filtered}
                selectedActivity={selectedActivity}
                onSelectActivity={setSelectedActivity}
              />
            </div>
          </div>
        </main>
      )}

      <footer className="border-t border-[var(--color-border)] py-6 text-center text-sm text-[var(--color-muted)]">
        &copy; {new Date().getFullYear()} Running Page 3.0 · Dashboard Pro
      </footer>
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
