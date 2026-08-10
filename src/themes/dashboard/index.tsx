import './index.css';
import { useMemo, useState } from 'react';
import type { Activity } from '@/types';
import {
  useFilteredActivities,
  getAvailableYears,
  extractProvince,
  getActivityData,
} from '@/hooks/useActivities';
import { useTheme } from '@/hooks/useTheme';
import { Header } from '@/components/Header';
import { StatsCards } from '@/components/StatsCards';
import { ContributionHeatmap } from '@/components/ContributionHeatmap';
import { ActivityLog } from '@/components/ActivityLog';
import { RouteMap } from '@/components/RouteMap';
import { CalendarWidget } from '@/components/CalendarWidget';
import { ProfileCard } from '@/components/ProfileCard';
import { PersonalBest } from '@/components/PersonalBest';
import { TracksPage } from '@/components/TracksPage';
import { ChinaMap } from '@/components/ChinaMap';
import { GITHUB_URL } from '@/core/config';

type Page = 'home' | 'tracks';

const FOOTER_YEAR = new Date().getFullYear();

function Dashboard() {
  const activities = getActivityData() as Activity[];
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
  const heatmapYear = year ?? years[0] ?? FOOTER_YEAR;

  // Activities filtered to the selected province (for RouteMap)
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
        onNavigate={(p) => {
          if (p === 'home' || p === 'tracks') setPage(p);
        }}
      />

      {page === 'tracks' ? (
        <TracksPage
          activities={activities}
          filter={filter}
          onSelectActivity={setSelectedActivity}
          onBack={() => setPage('home')}
          dark={dark}
        />
      ) : (
        <main className="mx-auto max-w-[1400px] px-6 py-6">
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_380px]">
            {/* Left column */}
            <div className="min-w-0 space-y-6 overflow-hidden">
              <StatsCards
                activities={filtered}
                allActivities={activities}
                year={year}
                filter={filter}
                onSelectActivity={setSelectedActivity}
              />
              <ContributionHeatmap
                activities={activities}
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
              />
            </div>

            {/* Right column */}
            <div className="flex min-w-0 flex-col gap-6 overflow-hidden">
              <ProfileCard activities={activities} filter={filter} />
              <ChinaMap
                activities={filtered}
                filter={filter}
                selectedProvince={selectedProvince}
                onSelectProvince={(p) => {
                  setSelectedProvince(p);
                  setSelectedActivity(null);
                }}
              />
              <RouteMap
                activities={provinceFiltered}
                selectedActivity={selectedActivity}
                dark={dark}
                onClearSelection={() => setSelectedActivity(null)}
              />
              <PersonalBest
                activities={activities}
                onSelectActivity={setSelectedActivity}
              />
              <CalendarWidget
                activities={activities}
                onSelectActivity={setSelectedActivity}
              />
            </div>
          </div>
        </main>
      )}

      <footer className="border-t border-[var(--color-border)] py-6 text-center text-sm text-[var(--color-muted)]">
        &copy; {FOOTER_YEAR} Running Page 3.0
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
    </div>
  );
}

export default Dashboard;
