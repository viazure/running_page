import './index.css';
import {
  lazy,
  startTransition,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Activity } from '@/types';
import {
  useFilteredActivities,
  getAvailableYears,
  extractProvince,
  getActivityData,
} from '@/hooks/useActivities';
import { useTheme } from '@/hooks/useTheme';
import { useLocale } from '@/hooks/useLocale';
import { Header } from './components/Header';
import { StatsCards } from './components/StatsCards';
import { ContributionHeatmap } from './components/ContributionHeatmap';
import { ActivityLog } from './components/ActivityLog';
import { DualCalendarWidget } from './components/DualCalendarWidget';
import { ProfileCard } from './components/ProfileCard';
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
import { TracksPageSkeleton } from './components/TracksPageSkeleton';
import { TrendChart } from './components/TrendChart';
import { MapDockFab } from './components/MapDockFab';
import {
  playbackMapHeightPx,
  useMobileMapDock,
} from './hooks/useMobileMapDock';
import { PLAYBACK_LAYOUT_SETTLE_MS } from '@/utils/mapChase3d';

const loadRouteMap = () =>
  import('./components/RouteMap').then((m) => ({ default: m.RouteMap }));
const loadTracksPage = () =>
  import('./components/TracksPage').then((m) => ({ default: m.TracksPage }));
const loadSummaryPage = () =>
  import('./components/SummaryPage').then((m) => ({ default: m.SummaryPage }));
const loadChinaMap = () =>
  import('./components/ChinaMap').then((m) => ({ default: m.ChinaMap }));

const RouteMap = lazy(loadRouteMap);
const TracksPage = lazy(loadTracksPage);
const SummaryPage = lazy(loadSummaryPage);
const ChinaMap = lazy(loadChinaMap);
const RunAnalysisLauncher = lazy(() =>
  import('./components/RunAnalysis').then((m) => ({
    default: m.RunAnalysisLauncher,
  }))
);

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
      className={`card flex flex-col items-center justify-center gap-1 px-4 text-center text-sm text-[var(--color-muted)] ${className}`}
    >
      <span>地图暂时不可用</span>
      <span className="text-[11px]">不影响本周进度与记录</span>
    </div>
  );
}

function DashboardProContent({
  page,
  dark,
  filter,
  onNavigateHome,
  onFabClearanceChange,
}: {
  page: Page;
  dark: boolean;
  filter: 'all';
  onNavigateHome: () => void;
  /** Mobile FAB clearance for the home footer (0 / one / two stacked). */
  onFabClearanceChange?: (pad: 'none' | 'one' | 'two') => void;
}) {
  const activities = getActivityData() as Activity[];
  const isUnlocked = usePrivacyUnlock();
  const { locale } = useLocale();
  const years = getAvailableYears(activities);
  /** Default to the latest year that has data (falls back to ALL if none). */
  const [year, setYear] = useState<number | null>(() => years[0] ?? null);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(
    null
  );
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);

  const filtered = useFilteredActivities(activities, filter, year);
  /** Fallback year for components that require a concrete calendar year (e.g. TrendChart). */
  const chartYear = year ?? years[0] ?? FOOTER_YEAR;
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

  const allYears = year == null;
  const mapSlotRef = useRef<HTMLDivElement>(null);
  const mapPinRef = useRef<HTMLDivElement>(null);
  const [mapPlaying, setMapPlaying] = useState(false);
  // Keep play surface tall through exit settle (same as TracksPage / RouteMap).
  const [playSurfaceSized, setPlaySurfaceSized] = useState(false);
  const isPlaybackGrowViewport = () =>
    typeof window !== 'undefined' &&
    window.matchMedia('(max-width: 1023px)').matches;
  useLayoutEffect(() => {
    if (mapPlaying && isPlaybackGrowViewport()) setPlaySurfaceSized(true);
  }, [mapPlaying]);
  useEffect(() => {
    if (mapPlaying) return;
    const delay = isPlaybackGrowViewport() ? PLAYBACK_LAYOUT_SETTLE_MS : 0;
    const t = window.setTimeout(() => setPlaySurfaceSized(false), delay);
    return () => window.clearTimeout(t);
  }, [mapPlaying]);
  const mapDock = useMobileMapDock(
    page === 'home',
    mapSlotRef,
    mapPinRef,
    allYears ? 'all' : 'year',
    playSurfaceSized ? playbackMapHeightPx() : null
  );

  // Keep footer FAB clearance in sync (padding lives under the copyright, not
  // between the last card and the footer — that looked like a huge bottom gap).
  useEffect(() => {
    if (!onFabClearanceChange) return;
    if (page !== 'home' || analysisOpen) {
      onFabClearanceChange('none');
      return;
    }
    const showDockFab = mapDock.showFab;
    if (selectedActivity != null && showDockFab) onFabClearanceChange('two');
    else if (selectedActivity != null || showDockFab)
      onFabClearanceChange('one');
    else onFabClearanceChange('none');
  }, [
    onFabClearanceChange,
    page,
    analysisOpen,
    mapDock.showFab,
    selectedActivity,
  ]);

  if (page === 'tracks') {
    return (
      <Suspense fallback={<TracksPageSkeleton />}>
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

  const activityLog = (
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
  );

  // Long document + viewport: slot is a plain placeholder (lockHeight).
  // Expanded map is always fixed via pinRef (Option A — no sticky).
  // No CSS transform on the map wrapper.
  const routeMapNoTween =
    mapDock.fillHeight || mapDock.lockHeight || mapDock.pinMotion != null;
  const routeMapCardClass = mapDock.fillHeight
    ? 'h-full shadow-lg transition-none [--card-shadow:var(--shadow-card-hover)]'
    : [
        routeMapNoTween ? 'transition-none' : '',
        mapPlaying
          ? 'h-[min(70vh,520px)] shadow-lg [--card-shadow:var(--shadow-card-hover)] md:h-[min(65vh,560px)] lg:h-[320px]'
          : mapDock.active
            ? 'h-[320px] shadow-lg [--card-shadow:var(--shadow-card-hover)] md:h-[320px]'
            : 'h-[320px] [--card-shadow:var(--shadow-card-hover)] md:h-[320px] lg:[--card-shadow:var(--shadow-card)]',
      ]
        .filter(Boolean)
        .join(' ');
  // Match TracksPage: play height while chasing; never force 320px under
  // lockHeight during play (that left the slot tall after stop). No height
  // tween while dock fixed/handoff (Mapbox blanks).
  const routeMap = (
    <>
      <div
        ref={mapSlotRef}
        className={
          allYears
            ? 'order-4 min-h-[220px] md:min-h-[260px] lg:order-none'
            : 'order-4 lg:order-none lg:shrink-0'
        }
        style={
          mapDock.lockHeight && mapDock.frame
            ? { height: mapDock.frame.height }
            : undefined
        }
      >
        <div
          ref={mapPinRef}
          className={mapDock.fillHeight ? 'h-full' : undefined}
        >
          <Suspense
            fallback={<MapFallback className="h-[220px] lg:h-[260px]" />}
          >
            <RouteMap
              activities={provinceFiltered}
              allActivities={activities}
              selectedActivity={selectedActivity}
              dark={dark}
              lightsOff={privacyActive}
              onClearSelection={() => setSelectedActivity(null)}
              onPlaybackChange={setMapPlaying}
              className={routeMapCardClass}
            />
          </Suspense>
        </div>
      </div>
      {mapDock.showFab && !analysisOpen ? (
        <MapDockFab
          expanded={mapDock.expanded}
          labelShow={locale === 'zh' ? '显示轨迹' : 'Show map'}
          labelHide={locale === 'zh' ? '收起轨迹' : 'Hide map'}
          onToggle={mapDock.toggle}
          // Stack above splits bookmark when a run is selected.
          lifted={selectedActivity != null}
        />
      ) : null}
    </>
  );

  const calendar = (
    <div className="order-5 min-w-0 overflow-hidden lg:order-none lg:shrink-0">
      <DualCalendarWidget
        activities={activities}
        selectedActivity={selectedActivity}
        onSelectActivity={setSelectedActivity}
      />
    </div>
  );

  const trend = (
    <div
      className={`order-8 flex min-w-0 flex-col lg:order-none ${
        allYears ? 'lg:shrink-0' : 'lg:min-h-0 lg:flex-1'
      }`}
    >
      <TrendChart
        activities={filtered}
        year={chartYear}
        className={
          allYears
            ? 'h-[260px]'
            : 'h-[260px] lg:h-auto lg:min-h-[220px] lg:flex-1'
        }
      />
    </div>
  );

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 md:px-6">
      {/*
        Mobile: Profile → Stats → Heatmap(under 连续) → RouteMap → Calendar
        → ActivityLog → ChinaMap → Trend.
        Desktop, one year (2x2, each row stretches):
          [Stats+Heatmap] [Profile + Map]
          [ActivityLog  ] [RouteMap+Calendar+Distance]
        Desktop, all years: one left column and one right column.
        The China map and yearly distance chart keep a fixed height.
      */}
      <div
        className={`flex flex-col gap-6 lg:grid lg:grid-cols-[1fr_380px] lg:items-stretch xl:grid-cols-[1fr_400px] ${
          allYears ? '' : 'lg:grid-rows-[auto_auto]'
        }`}
      >
        {/* Left: stats + heatmap, plus the log when every year is shown */}
        <div className="contents min-w-0 lg:col-start-1 lg:row-start-1 lg:flex lg:min-h-0 lg:flex-col lg:gap-6">
          <div className="order-2 min-w-0 lg:order-none lg:shrink-0">
            <StatsCards
              activities={filtered}
              allActivities={activities}
              year={year}
              filter={filter}
              onSelectActivity={setSelectedActivity}
              compact
            />
          </div>
          <div className="order-3 min-w-0 overflow-hidden lg:order-none lg:shrink-0">
            <ContributionHeatmap
              activities={activities}
              year={year}
              filter={filter}
              onSelectActivity={setSelectedActivity}
              onYearChange={setYear}
            />
          </div>
          {allYears ? (
            <div className="order-6 flex min-w-0 flex-col overflow-hidden lg:order-none lg:min-h-0 lg:flex-1">
              {activityLog}
            </div>
          ) : null}
        </div>

        {/* Right: profile + map. All years also stacks route, calendar, chart. */}
        <div
          className={`contents min-w-0 lg:col-start-2 lg:row-start-1 lg:flex lg:min-h-0 lg:flex-col lg:gap-4 ${
            allYears ? '' : 'lg:h-full lg:overflow-hidden'
          }`}
        >
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
          <div
            className={`order-7 min-w-0 overflow-hidden lg:order-none ${
              allYears ? 'lg:shrink-0' : 'lg:min-h-0 lg:flex-1'
            }`}
          >
            <Suspense
              fallback={
                <MapFallback
                  className={
                    allYears
                      ? 'h-[220px] lg:h-[260px]'
                      : 'h-[200px] lg:h-full lg:min-h-[180px]'
                  }
                />
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
                className={
                  allYears ? 'h-[220px] lg:h-[260px]' : 'h-[200px] lg:h-full'
                }
              />
            </Suspense>
          </div>
          {allYears ? (
            <>
              {routeMap}
              {calendar}
              {trend}
            </>
          ) : null}
        </div>

        {allYears ? null : (
          <div className="order-6 flex min-w-0 flex-col overflow-hidden lg:order-none lg:col-start-1 lg:row-start-2 lg:min-h-0">
            {activityLog}
          </div>
        )}

        {allYears ? null : (
          <div className="contents min-w-0 lg:col-start-2 lg:row-start-2 lg:flex lg:min-h-0 lg:flex-col lg:gap-4 lg:overflow-hidden">
            {routeMap}
            {calendar}
            {trend}
          </div>
        )}
      </div>
      <Suspense fallback={null}>
        <RunAnalysisLauncher
          activity={selectedActivity}
          onOpenChange={setAnalysisOpen}
          anonymousTitles={useAnonymousTitles}
        />
      </Suspense>
    </main>
  );
}

function DashboardProInner() {
  const { dark, toggle } = useTheme();
  const { locale } = useLocale();
  const [filter] = useState('all' as const);
  const [page, setPage] = useState<Page>('home');
  const [fabClearance, setFabClearance] = useState<'none' | 'one' | 'two'>(
    'none'
  );

  // Drives the `:lang(zh)` rules in index.css (e.g. the `eyebrow` utility,
  // where uppercase/wide tracking only makes sense for Latin labels).
  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  }, [locale]);

  const navigate = (next: Page) => {
    // Keep previous page painted while lazy chunks resolve (avoids Suspense flash).
    startTransition(() => setPage(next));
  };

  return (
    <div
      className={
        page === 'summary' || page === 'tracks'
          ? // dvh (not svh): mobile toolbars make svh shorter than the visual
            // viewport and left a ~100px paper-colored gap under the summary shell.
            // Tracks: same lock so body/html never grows a document scrollbar;
            // wall/page scrolls inside the content pane instead.
            'flex h-dvh flex-col overflow-hidden bg-[var(--color-bg)]'
          : 'min-h-dvh bg-[var(--color-bg)]'
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
          page === 'summary' || page === 'tracks'
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
            onFabClearanceChange={setFabClearance}
          />
        </Suspense>
      </div>

      {page === 'home' ? (
        <footer
          className="flex items-center justify-center border-t border-[var(--color-border)] py-6 text-sm text-[var(--color-muted)]"
          style={
            fabClearance === 'none'
              ? undefined
              : {
                  // Clearance sits under the copyright so the last card hugs the footer.
                  paddingBottom:
                    fabClearance === 'two'
                      ? 'calc(5.75rem + env(safe-area-inset-bottom, 0px))'
                      : 'calc(3.25rem + env(safe-area-inset-bottom, 0px))',
                }
          }
        >
          <span>
            &copy; {FOOTER_YEAR} Running Page 3.0 ·{' '}
            {GITHUB_URL ? (
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-[var(--color-accent)]"
              >
                Dashboard Pro
              </a>
            ) : (
              'Dashboard Pro'
            )}
          </span>
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
