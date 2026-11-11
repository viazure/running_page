import React, {
  lazy,
  useState,
  Suspense,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useSyncExternalStore,
} from 'react';
import VirtualList from 'rc-virtual-list';
import {
  useInRouterContext,
  useNavigate,
  type NavigateFunction,
} from 'react-router-dom';
import styles from './style.module.css';
import embedStyles from './embedded.module.css';
import { ACTIVITY_TOTAL, LOADING_TEXT } from '../../utils/const';
import { totalStat, yearSummaryStats } from '@assets/index';
import { loadSvgComponent } from '../../utils/svgUtils';
import { SHOW_ELEVATION_GAIN, HOME_PAGE_TITLE } from '../../utils/const';
import { DIST_UNIT, M_TO_DIST } from '../../utils/utils';
import type { Activity } from '../../utils/utils';
import useActivities from '../../hooks/useActivities';
import { useLocale } from '@/hooks/useLocale';
import { exportCard } from '@/utils/exportCard';
import { SvgTitleTipHost } from './SvgTitleTipHost';
// Layout constants (avoid magic numbers)
const ITEM_WIDTH = 280;
const ITEM_GAP = 20;

export interface ActivityListProps {
  /** Prefer over react-router so dashboard themes can host Summary without a Router */
  onBack?: () => void;
  /**
   * Dashboard Summary embed only. Classic `/summary` leaves this unset so
   * layout, styles, and chart behavior stay identical to upstream classic.
   */
  embedded?: boolean;
  /** Optional starting interval (dashboard Life restore uses `life`). */
  initialInterval?: 'year' | 'month' | 'week' | 'day' | 'life';
  /** Hide year/month/week/day/Life chips when parent owns period pills. */
  hideIntervalChips?: boolean;
  /**
   * When set (including `null` = all years), parent owns the year filter.
   * Used by dashboard_pro Summary toolbar so Day/Life share the same year nav.
   */
  controlledYear?: string | null;
  /** Hide embedded year chips when parent shows a shared year navigator. */
  hideYearChips?: boolean;
  /**
   * Embedded only: the parent's already-resolved activity list. The Pro Summary
   * loads `activities.lite.json`, and without this the embedded list silently
   * reads the full bundled `activities.json` instead — two data sources that can
   * disagree (different run counts per tab) and re-download the 2 MB payload the
   * lite path exists to avoid.
   */
  activities?: Activity[];
}

const VIRTUAL_LIST_STYLES = {
  horizontalScrollBar: {},
  horizontalScrollBarThumb: {
    background:
      'var(--color-primary, var(--color-scrollbar-thumb, rgba(0,0,0,0.4)))',
  },
  verticalScrollBar: {},
  verticalScrollBarThumb: {
    background:
      'var(--color-primary, var(--color-scrollbar-thumb, rgba(0,0,0,0.4)))',
  },
};

interface SnapshotStore<T> {
  getSnapshot: () => T;
  getServerSnapshot: () => T;
  setSnapshot: (nextSnapshot: T) => void;
  subscribe: (listener: () => void) => () => void;
}

function createSnapshotStore<T>(initialSnapshot: T): SnapshotStore<T> {
  let snapshot = initialSnapshot;
  const listeners = new Set<() => void>();

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initialSnapshot,
    setSnapshot: (nextSnapshot) => {
      if (Object.is(snapshot, nextSnapshot)) return;
      snapshot = nextSnapshot;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const getInitialListHeight = () =>
  typeof window === 'undefined' ? 500 : Math.max(100, window.innerHeight - 40);

const loadRoutePreview = () => import('../RoutePreview');
const RoutePreview = lazy(loadRoutePreview);
const loadActivityChart = () => import('./ActivityChart');
const ActivityChart = lazy(loadActivityChart);
/** Pro Summary only — lazy so classic /summary does not pull this chunk eagerly. */
const SummaryActivityChart = lazy(() =>
  import('@/components/SummaryActivityChart').then((m) => ({
    default: m.SummaryActivityChart,
  }))
);

void loadActivityChart();

const MonthOfLifeSvg = (sportType: string) => {
  const path = sportType === 'all' ? './mol.svg' : `./mol_${sportType}.svg`;
  return lazy(() => loadSvgComponent(totalStat, path));
};

const RunningSvg = MonthOfLifeSvg('running');
const WalkingSvg = MonthOfLifeSvg('walking');
const HikingSvg = MonthOfLifeSvg('hiking');
const CyclingSvg = MonthOfLifeSvg('cycling');
const SwimmingSvg = MonthOfLifeSvg('swimming');
const SkiingSvg = MonthOfLifeSvg('skiing');
const AllSvg = MonthOfLifeSvg('all');

const yearSummarySvgs = Object.fromEntries(
  Object.keys(yearSummaryStats).map((path) => [
    path,
    lazy(() => loadSvgComponent(yearSummaryStats, path)),
  ])
);

interface ActivitySummary {
  totalDistance: number;
  totalTime: number;
  totalElevationGain: number;
  count: number;
  dailyDistances: number[];
  maxDistance: number;
  maxSpeed: number;
  location: string;
  totalHeartRate: number; // Add heart rate statistics
  heartRateCount: number;
  activities: Activity[]; // Add activities array for day interval
}

interface DisplaySummary {
  totalDistance: number;
  averageSpeed: number;
  totalTime: number;
  count: number;
  maxDistance: number;
  maxSpeed: number;
  location: string;
  totalElevationGain?: number;
  averageHeartRate?: number; // Add heart rate display
}

interface ChartData {
  day: number;
  distance: string;
}

interface ActivityCardProps {
  period: string;
  summary: DisplaySummary;
  dailyDistances: number[];
  interval: string;
  activities?: Activity[]; // Add activities for day interval
  /** Skip mounting chart (keep .chart box for row-height sample). */
  omitChart?: boolean;
  /** Use Summary embed chart with in-SVG tip. */
  embedded?: boolean;
  /** Responsive card width (dashboard_pro Summary mobile columns). */
  cardWidth?: number;
  /** Bust memo when language toggles (embedded cards call t()). */
  locale?: string;
}

interface ActivityGroups {
  [key: string]: ActivitySummary;
}

type IntervalType = 'year' | 'month' | 'week' | 'day' | 'life';

// A row group contains multiple activity card data items that will be rendered in one virtualized row
type RowGroup = Array<{ period: string; summary: ActivitySummary }>;

interface ActivityListCache {
  activityGroups: Map<string, ActivityGroups>;
  availableYears?: string[];
  periodSummaries: Map<string, RowGroup>;
  sportTypeOptions?: string[];
}

const activityListCache = new WeakMap<Activity[], ActivityListCache>();

const getActivityListCache = (activityData: Activity[]) => {
  let cache = activityListCache.get(activityData);
  if (!cache) {
    cache = {
      activityGroups: new Map(),
      periodSummaries: new Map(),
    };
    activityListCache.set(activityData, cache);
  }
  return cache;
};

const getSportTypeOptions = (activityData: Activity[]) => {
  const cache = getActivityListCache(activityData);
  if (cache.sportTypeOptions) return cache.sportTypeOptions;

  const sportTypeSet = new Set(activityData.map((activity) => activity.type));
  if (sportTypeSet.has('Run')) {
    sportTypeSet.delete('Run');
    sportTypeSet.add('running');
  }
  if (sportTypeSet.has('Walk')) {
    sportTypeSet.delete('Walk');
    sportTypeSet.add('walking');
  }
  if (sportTypeSet.has('Ride')) {
    sportTypeSet.delete('Ride');
    sportTypeSet.add('cycling');
  }
  cache.sportTypeOptions = ['all', ...sportTypeSet];
  return cache.sportTypeOptions;
};

const defaultSelectedYear = (years: string[]): string | null => {
  if (!years.length) return null;
  const calendarYear = String(new Date().getFullYear());
  if (years.includes(calendarYear)) return calendarYear;
  // availableYears is newest-first
  return years[0] ?? null;
};

const getAvailableActivityYears = (activityData: Activity[]) => {
  const cache = getActivityListCache(activityData);
  if (cache.availableYears) return cache.availableYears;

  cache.availableYears = Array.from(
    new Set(
      activityData.map((activity) =>
        new Date(activity.start_date_local).getFullYear().toString()
      )
    )
  ).sort((a, b) => Number(b) - Number(a));
  return cache.availableYears;
};

const convertTimeToSeconds = (time: string): number => {
  const [hours, minutes, seconds] = time.split(':').map(Number);
  return hours * 3600 + minutes * 60 + seconds;
};

const formatTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
};

const formatPace = (speed: number): string => {
  if (speed === 0) return `0:00 min/${DIST_UNIT}`;
  const pace = 60 / speed;
  const totalSeconds = Math.round(pace * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds} min/${DIST_UNIT}`;
};

const generateLabels = (interval: string, period: string): number[] => {
  if (interval === 'month') {
    const [year, month] = period.split('-').map(Number);
    return Array.from(
      { length: new Date(year, month, 0).getDate() },
      (_, i) => i + 1
    );
  }
  if (interval === 'week') {
    return Array.from({ length: 7 }, (_, i) => i + 1);
  }
  if (interval === 'year') {
    return Array.from({ length: 12 }, (_, i) => i + 1);
  }
  return [];
};

const matchesSportType = (activity: Activity, sportTypeArg: string) => {
  if (sportTypeArg === 'all') return true;
  if (sportTypeArg === 'running') {
    return activity.type === 'running' || activity.type === 'Run';
  }
  if (sportTypeArg === 'walking') {
    return activity.type === 'walking' || activity.type === 'Walk';
  }
  if (sportTypeArg === 'cycling') {
    return activity.type === 'cycling' || activity.type === 'Ride';
  }
  return activity.type === sportTypeArg;
};

const createEmptyActivitySummary = (): ActivitySummary => ({
  totalDistance: 0,
  totalTime: 0,
  totalElevationGain: 0,
  count: 0,
  dailyDistances: [],
  maxDistance: 0,
  maxSpeed: 0,
  location: '',
  totalHeartRate: 0,
  heartRateCount: 0,
  activities: [],
});

const getActivitySummaryCacheKey = (
  intervalArg: IntervalType,
  sportTypeArg: string
) => `${intervalArg}:${sportTypeArg}`;

const groupActivitiesByInterval = (
  activityData: Activity[],
  intervalArg: IntervalType,
  sportTypeArg: string
): ActivityGroups => {
  const cache = getActivityListCache(activityData);
  const cacheKey = getActivitySummaryCacheKey(intervalArg, sportTypeArg);
  const cachedGroups = cache.activityGroups.get(cacheKey);
  if (cachedGroups) return cachedGroups;

  const activityGroups = activityData
    .filter((activity) => matchesSportType(activity, sportTypeArg))
    .reduce((acc: ActivityGroups, activity) => {
      const date = new Date(activity.start_date_local);
      let key: string;
      let index: number;
      switch (intervalArg) {
        case 'year':
          key = date.getFullYear().toString();
          index = date.getMonth();
          break;
        case 'month':
          key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
          index = date.getDate() - 1;
          break;
        case 'week': {
          const currentDate = new Date(date.valueOf());
          currentDate.setDate(
            currentDate.getDate() + 4 - (currentDate.getDay() || 7)
          );
          const yearStart = new Date(currentDate.getFullYear(), 0, 1);
          const weekNum = Math.ceil(
            ((currentDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
          );
          key = `${currentDate.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
          index = (date.getDay() + 6) % 7;
          break;
        }
        case 'day':
          key = date.toLocaleDateString('zh').replaceAll('/', '-');
          index = 0;
          break;
        default:
          key = date.getFullYear().toString();
          index = 0;
      }

      if (!acc[key]) acc[key] = createEmptyActivitySummary();

      const distance = activity.distance / M_TO_DIST;
      const timeInSeconds = convertTimeToSeconds(activity.moving_time);
      const speed = timeInSeconds > 0 ? distance / (timeInSeconds / 3600) : 0;

      acc[key].totalDistance += distance;
      acc[key].totalTime += timeInSeconds;

      if (activity.elevation_gain) {
        acc[key].totalElevationGain += activity.elevation_gain;
      }

      if (activity.average_heartrate) {
        acc[key].totalHeartRate += activity.average_heartrate;
        acc[key].heartRateCount += 1;
      }

      acc[key].count += 1;
      if (intervalArg === 'day') acc[key].activities.push(activity);
      acc[key].dailyDistances[index] =
        (acc[key].dailyDistances[index] || 0) + distance;
      if (distance > acc[key].maxDistance) acc[key].maxDistance = distance;
      if (speed > acc[key].maxSpeed) acc[key].maxSpeed = speed;
      // Day cards: never surface place names (privacy / product rule).

      return acc;
    }, {} as ActivityGroups);

  cache.activityGroups.set(cacheKey, activityGroups);
  return activityGroups;
};

const sortPeriodSummaries = (
  activitiesByInterval: ActivityGroups,
  interval: IntervalType
): RowGroup =>
  Object.entries(activitiesByInterval)
    .sort(([a], [b]) => {
      if (interval === 'day') {
        return new Date(b).getTime() - new Date(a).getTime();
      }
      if (interval === 'week') {
        const [yearA, weekA] = a.split('-W').map(Number);
        const [yearB, weekB] = b.split('-W').map(Number);
        return yearB - yearA || weekB - weekA;
      }
      const [yearA, monthA = 0] = a.split('-').map(Number);
      const [yearB, monthB = 0] = b.split('-').map(Number);
      return yearB - yearA || monthB - monthA;
    })
    .map(([period, summary]) => ({ period, summary }));

const periodMatchesYear = (
  period: string,
  year: string,
  intervalArg: IntervalType
) => {
  if (intervalArg === 'year') return period === year;
  return period.startsWith(`${year}-`) || period.startsWith(`${year}/`);
};

const getPeriodSummaries = (
  activityData: Activity[],
  intervalArg: IntervalType,
  sportTypeArg: string
): RowGroup => {
  const cache = getActivityListCache(activityData);
  const cacheKey = getActivitySummaryCacheKey(intervalArg, sportTypeArg);
  const cachedSummaries = cache.periodSummaries.get(cacheKey);
  if (cachedSummaries) return cachedSummaries;

  const summaries = sortPeriodSummaries(
    groupActivitiesByInterval(activityData, intervalArg, sportTypeArg),
    intervalArg
  );
  cache.periodSummaries.set(cacheKey, summaries);
  return summaries;
};

const toDisplaySummary = (summary: ActivitySummary): DisplaySummary => ({
  totalDistance: summary.totalDistance,
  averageSpeed: summary.totalTime
    ? summary.totalDistance / (summary.totalTime / 3600)
    : 0,
  totalTime: summary.totalTime,
  count: summary.count,
  maxDistance: summary.maxDistance,
  maxSpeed: summary.maxSpeed,
  location: summary.location,
  totalElevationGain: summary.totalElevationGain,
  averageHeartRate:
    summary.heartRateCount > 0
      ? summary.totalHeartRate / summary.heartRateCount
      : undefined,
});

function useActivityListMeasurements(
  itemWidth: number,
  gap: number,
  embedded = false,
  interval: IntervalType = 'month'
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const filterRef = useRef<HTMLDivElement | null>(null);
  const sampleRef = useRef<HTMLDivElement | null>(null);
  const containerResizeObserverRef = useRef<ResizeObserver | null>(null);
  const filterResizeObserverRef = useRef<ResizeObserver | null>(null);
  const sampleResizeObserverRef = useRef<ResizeObserver | null>(null);
  const layoutFrameRef = useRef<number | null>(null);

  const itemsPerRowStore = useMemo(
    () => createSnapshotStore(embedded ? (interval === 'day' ? 2 : 1) : 0),
    // once per mount — embed defaults avoid a 0-column / viewport-tall first paint
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const cardWidthStore = useMemo(
    () => createSnapshotStore(itemWidth),
    [itemWidth]
  );
  const rowHeightStore = useMemo(() => createSnapshotStore(360), []);
  const listHeightStore = useMemo(
    () => createSnapshotStore(embedded ? 320 : getInitialListHeight()),
    // once per mount — embed must not start at window.innerHeight-40
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const itemsPerRow = useSyncExternalStore(
    itemsPerRowStore.subscribe,
    itemsPerRowStore.getSnapshot,
    itemsPerRowStore.getServerSnapshot
  );
  const cardWidth = useSyncExternalStore(
    cardWidthStore.subscribe,
    cardWidthStore.getSnapshot,
    cardWidthStore.getServerSnapshot
  );
  const rowHeight = useSyncExternalStore(
    rowHeightStore.subscribe,
    rowHeightStore.getSnapshot,
    rowHeightStore.getServerSnapshot
  );
  const listHeight = useSyncExternalStore(
    listHeightStore.subscribe,
    listHeightStore.getSnapshot,
    listHeightStore.getServerSnapshot
  );

  const updateItemsPerRow = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerWidth = container.clientWidth;
    if (embedded) {
      // Year/month/week: one full-width card on mobile.
      // Day: also one full-width card on mobile — a 2-up day card clipped the
      // metric row and the elevation figure, so every day now reads in full.
      const isMobile = containerWidth <= 640;
      let count: number;
      if (isMobile) {
        count = 1;
      } else if (interval === 'day') {
        // Prefer 3-up on desktop so day cards breathe (not a 4-col word wall).
        const minDayWidth = 240;
        count = Math.max(
          2,
          Math.min(3, Math.floor((containerWidth + gap) / (minDayWidth + gap)))
        );
      } else {
        count = Math.max(
          1,
          Math.floor((containerWidth + gap) / (itemWidth + gap))
        );
      }
      const width = Math.floor(
        (containerWidth - gap * Math.max(0, count - 1)) / count
      );
      itemsPerRowStore.setSnapshot(count);
      cardWidthStore.setSnapshot(
        isMobile || interval === 'day' ? width : itemWidth
      );
      return;
    }
    const count = Math.floor((containerWidth + gap) / (itemWidth + gap));
    itemsPerRowStore.setSnapshot(count);
    cardWidthStore.setSnapshot(itemWidth);
  }, [embedded, gap, interval, itemWidth, itemsPerRowStore, cardWidthStore]);

  const updateListHeight = useCallback(() => {
    const containerEl = containerRef.current;
    if (embedded && containerEl) {
      const h = containerEl.clientHeight;
      if (h > 0) {
        listHeightStore.setSnapshot(Math.max(120, Math.floor(h)));
        return;
      }
      const topOffset = Math.max(0, containerEl.getBoundingClientRect().top);
      listHeightStore.setSnapshot(
        Math.max(120, Math.floor(window.innerHeight - topOffset - 8))
      );
      return;
    }

    const filterH = filterRef.current?.clientHeight || 0;
    let topOffset = 0;
    if (containerEl) {
      const rect = containerEl.getBoundingClientRect();
      topOffset = Math.max(0, rect.top);
    }

    const base = topOffset || filterH || 0;
    let bottomPadding = 16;
    if (containerEl?.parentElement) {
      try {
        const parentRect = containerEl.parentElement.getBoundingClientRect();
        const containerRect = containerEl.getBoundingClientRect();
        const distanceToParentBottom = Math.max(
          0,
          parentRect.bottom - containerRect.bottom
        );
        bottomPadding = Math.min(
          48,
          Math.max(8, Math.round(distanceToParentBottom / 4))
        );
      } catch (e) {
        console.error(e);
      }
    }

    listHeightStore.setSnapshot(
      Math.max(100, window.innerHeight - base - bottomPadding)
    );
  }, [embedded, listHeightStore]);

  const updateRowHeight = useCallback(() => {
    const height = sampleRef.current?.offsetHeight ?? 0;
    if (height) rowHeightStore.setSnapshot(height);
  }, [rowHeightStore]);

  const updateMeasurements = useCallback(() => {
    updateItemsPerRow();
    updateListHeight();
    updateRowHeight();
  }, [updateItemsPerRow, updateListHeight, updateRowHeight]);

  const scheduleMeasurementUpdate = useCallback(() => {
    if (layoutFrameRef.current !== null) {
      cancelAnimationFrame(layoutFrameRef.current);
    }

    layoutFrameRef.current = requestAnimationFrame(() => {
      layoutFrameRef.current = null;
      updateMeasurements();
    });
  }, [updateMeasurements]);

  const disconnectContainerObserver = useCallback(() => {
    containerResizeObserverRef.current?.disconnect();
    containerResizeObserverRef.current = null;
  }, []);

  const disconnectFilterObserver = useCallback(() => {
    filterResizeObserverRef.current?.disconnect();
    filterResizeObserverRef.current = null;
  }, []);

  const disconnectSampleObserver = useCallback(() => {
    sampleResizeObserverRef.current?.disconnect();
    sampleResizeObserverRef.current = null;
  }, []);

  const setSummaryContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      disconnectContainerObserver();
      containerRef.current = node;

      if (!node) {
        itemsPerRowStore.setSnapshot(
          embedded ? (interval === 'day' ? 2 : 1) : 0
        );
        return;
      }

      const observer = new ResizeObserver(scheduleMeasurementUpdate);
      observer.observe(node);
      containerResizeObserverRef.current = observer;
      scheduleMeasurementUpdate();
    },
    [
      disconnectContainerObserver,
      embedded,
      interval,
      itemsPerRowStore,
      scheduleMeasurementUpdate,
    ]
  );

  const setFilterContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      disconnectFilterObserver();
      filterRef.current = node;

      if (!node) return;

      const observer = new ResizeObserver(scheduleMeasurementUpdate);
      observer.observe(node);
      filterResizeObserverRef.current = observer;
      scheduleMeasurementUpdate();
    },
    [disconnectFilterObserver, scheduleMeasurementUpdate]
  );

  const setSampleCardRef = useCallback(
    (node: HTMLDivElement | null) => {
      disconnectSampleObserver();
      sampleRef.current = node;

      if (!node) return;

      const observer = new ResizeObserver(scheduleMeasurementUpdate);
      observer.observe(node);
      sampleResizeObserverRef.current = observer;
      scheduleMeasurementUpdate();
    },
    [disconnectSampleObserver, scheduleMeasurementUpdate]
  );

  useEffect(() => {
    scheduleMeasurementUpdate();
    window.addEventListener('resize', scheduleMeasurementUpdate);
    return () => {
      window.removeEventListener('resize', scheduleMeasurementUpdate);
    };
  }, [scheduleMeasurementUpdate]);

  useEffect(
    () => () => {
      disconnectContainerObserver();
      disconnectFilterObserver();
      disconnectSampleObserver();
      if (layoutFrameRef.current !== null) {
        cancelAnimationFrame(layoutFrameRef.current);
        layoutFrameRef.current = null;
      }
    },
    [
      disconnectContainerObserver,
      disconnectFilterObserver,
      disconnectSampleObserver,
    ]
  );

  return {
    itemsPerRow,
    cardWidth,
    listHeight,
    rowHeight,
    setFilterContainerRef,
    setSampleCardRef,
    setSummaryContainerRef,
  };
}

const ActivityCardInner: React.FC<ActivityCardProps> = ({
  period,
  summary,
  dailyDistances,
  interval,
  activities = [],
  omitChart = false,
  embedded = false,
  cardWidth,
}) => {
  const { t } = useLocale();
  const cs = embedded ? embedStyles : styles;
  const [isFlipped, setIsFlipped] = useState(false);
  const showChart = ['month', 'week', 'year'].includes(interval);
  const handleCardClick = useCallback(() => {
    if (interval === 'day' && activities.length > 0) {
      setIsFlipped((current) => !current);
    }
  }, [activities.length, interval]);

  const data: ChartData[] = useMemo(() => {
    if (!showChart) return [];
    return generateLabels(interval, period).map((day) => ({
      day,
      distance: (dailyDistances[day - 1] || 0).toFixed(2),
    }));
  }, [dailyDistances, interval, period, showChart]);

  const { yAxisMax, yAxisTicks } = useMemo(() => {
    if (!showChart) {
      return { yAxisMax: 0, yAxisTicks: [] };
    }
    const max = Math.ceil(
      Math.max(...data.map((d) => parseFloat(d.distance))) + 10
    );
    return {
      yAxisMax: max,
      yAxisTicks: Array.from(
        { length: Math.ceil(max / 5) + 1 },
        (_, i) => i * 5
      ),
    };
  }, [data, showChart]);

  // Embed chart only: absolute +10 over-pads daily month bars (e.g. 16 km →
  // axis 26). Use a small relative headroom so the tallest bar nearly fills.
  const yAxisMaxOnly = useMemo(() => {
    if (!showChart) return 0;
    const dataMax = Math.max(
      ...data.map((d) => parseFloat(d.distance) || 0),
      0
    );
    if (dataMax <= 0) return 1;
    return Math.ceil(dataMax * 1.05);
  }, [data, showChart]);

  const avgDistance =
    summary.count > 0 ? summary.totalDistance / summary.count : 0;
  const elevationGain = summary.totalElevationGain ?? 0;
  // Classic still gates on SHOW_ELEVATION_GAIN; embed shows climb only when > 0.
  const showElevation = embedded && elevationGain > 0;

  return (
    <div
      className={`${cs.activityCard} ${interval === 'day' ? cs.activityCardFlippable : ''}`}
      onClick={handleCardClick}
      style={{
        cursor:
          interval === 'day' && activities.length > 0 ? 'pointer' : 'default',
        ...(embedded && cardWidth ? { width: cardWidth } : null),
      }}
    >
      <div className={`${cs.cardInner} ${isFlipped ? cs.flipped : ''}`}>
        <div className={cs.cardFront}>
          <h2
            className={`${cs.activityName}${
              embedded && interval === 'day' ? ` ${cs.activityNameDay}` : ''
            }`}
          >
            {period}
          </h2>
          {embedded ? (
            <>
              <div className={cs.statHeroRow}>
                <div
                  className={`${cs.statHeroBlock}${
                    interval === 'day' ? ` ${cs.statHeroBlockDay}` : ''
                  }`}
                >
                  <p
                    className={
                      interval === 'day' ? cs.statHeroDay : cs.statHero
                    }
                  >
                    {summary.totalDistance.toFixed(2)}
                    <span className={cs.statHeroUnit}> {DIST_UNIT}</span>
                  </p>
                  <p className={cs.statMeta}>
                    {formatTime(summary.totalTime)}
                    {interval === 'day' ? (
                      <>
                        {showElevation ? (
                          <>
                            <span className={cs.statMetaSep}>·</span>
                            <span className={cs.statElevInline}>
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                role="img"
                                aria-label={t('elevationGain')}
                              >
                                <path d="M3 17l6-6 4 4 8-8" />
                                <path d="M14 7h7v7" />
                              </svg>
                              {elevationGain.toFixed(0)} m
                            </span>
                          </>
                        ) : null}
                        {summary.count > 1 ? (
                          <>
                            <span className={cs.statMetaSep}>·</span>
                            {summary.count} {t('times')}
                          </>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <span className={cs.statMetaSep}>·</span>
                        {summary.count} {t('times')}
                      </>
                    )}
                  </p>
                </div>
                {showElevation && interval !== 'day' ? (
                  <div className={cs.statElevCorner}>
                    <span className={cs.statLabel}>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        role="img"
                        aria-label={t('elevationGain')}
                      >
                        <path d="M3 17l6-6 4 4 8-8" />
                        <path d="M14 7h7v7" />
                      </svg>
                      <span className={cs.statTip} role="tooltip">
                        {t('elevationGain')}
                      </span>
                    </span>
                    <span className={cs.statValue}>
                      {elevationGain.toFixed(0)} m
                    </span>
                  </div>
                ) : null}
              </div>
              {interval === 'day' ? (
                <div className={cs.statDayFoot}>
                  <span className={cs.statDayFootValue}>
                    {formatPace(summary.averageSpeed)}
                  </span>
                  {summary.averageHeartRate !== undefined ? (
                    <>
                      <span className={cs.statMetaSep}>·</span>
                      <span className={cs.statDayFootValue}>
                        {summary.averageHeartRate.toFixed(0)}
                      </span>
                      <span className={cs.statDayFootUnit}>bpm</span>
                    </>
                  ) : null}
                  {summary.count > 1 ? (
                    <>
                      <span className={cs.statMetaSep}>·</span>
                      <span className={cs.statDayFootValue}>
                        {avgDistance.toFixed(2)}
                      </span>
                      <span className={cs.statDayFootUnit}>{DIST_UNIT}</span>
                    </>
                  ) : null}
                </div>
              ) : (
                <div className={cs.statGrid}>
                  <div className={cs.statCell}>
                    <span className={cs.statLabel}>{t('avgPace')}</span>
                    <span className={cs.statValue}>
                      {formatPace(summary.averageSpeed)}
                    </span>
                  </div>
                  <div className={cs.statCell}>
                    <span className={cs.statLabel}>{t('avgDistance')}</span>
                    <span className={cs.statValue}>
                      {avgDistance.toFixed(2)} {DIST_UNIT}
                    </span>
                  </div>
                  <div className={cs.statCell}>
                    <span className={cs.statLabel}>{t('longestActivity')}</span>
                    <span className={cs.statValue}>
                      {summary.maxDistance.toFixed(2)} {DIST_UNIT}
                    </span>
                  </div>
                  <div className={cs.statCell}>
                    <span className={cs.statLabel}>{t('fastestPace')}</span>
                    <span className={cs.statValue}>
                      {formatPace(summary.maxSpeed)}
                    </span>
                  </div>
                  {summary.averageHeartRate !== undefined && (
                    <div className={cs.statCell}>
                      <span className={cs.statLabel}>{t('avgHeartRate')}</span>
                      <span className={cs.statValue}>
                        {summary.averageHeartRate.toFixed(0)} bpm
                      </span>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className={styles.activityDetails}>
              <p>
                <strong>{ACTIVITY_TOTAL.TOTAL_DISTANCE_TITLE}:</strong>{' '}
                {summary.totalDistance.toFixed(2)} {DIST_UNIT}
              </p>
              {SHOW_ELEVATION_GAIN &&
                summary.totalElevationGain !== undefined && (
                  <p>
                    <strong>
                      {ACTIVITY_TOTAL.TOTAL_ELEVATION_GAIN_TITLE}:
                    </strong>{' '}
                    {summary.totalElevationGain.toFixed(0)} m
                  </p>
                )}
              <p>
                <strong>{ACTIVITY_TOTAL.AVERAGE_SPEED_TITLE}:</strong>{' '}
                {formatPace(summary.averageSpeed)}
              </p>
              <p>
                <strong>{ACTIVITY_TOTAL.TOTAL_TIME_TITLE}:</strong>{' '}
                {formatTime(summary.totalTime)}
              </p>
              {summary.averageHeartRate !== undefined && (
                <p>
                  <strong>{ACTIVITY_TOTAL.AVERAGE_HEART_RATE_TITLE}:</strong>{' '}
                  {summary.averageHeartRate.toFixed(0)} bpm
                </p>
              )}
              {interval !== 'day' && (
                <>
                  <p>
                    <strong>{ACTIVITY_TOTAL.ACTIVITY_COUNT_TITLE}:</strong>{' '}
                    {summary.count}
                  </p>
                  <p>
                    <strong>{ACTIVITY_TOTAL.MAX_DISTANCE_TITLE}:</strong>{' '}
                    {summary.maxDistance.toFixed(2)} {DIST_UNIT}
                  </p>
                  <p>
                    <strong>{ACTIVITY_TOTAL.MAX_SPEED_TITLE}:</strong>{' '}
                    {formatPace(summary.maxSpeed)}
                  </p>
                  <p>
                    <strong>{ACTIVITY_TOTAL.AVERAGE_DISTANCE_TITLE}:</strong>{' '}
                    {avgDistance.toFixed(2)} {DIST_UNIT}
                  </p>
                </>
              )}
            </div>
          )}
          {showChart && (
            <div className={cs.chart}>
              {!omitChart && (
                <Suspense fallback={null}>
                  {embedded ? (
                    <SummaryActivityChart
                      data={data}
                      yAxisMax={yAxisMaxOnly}
                      interval={interval as 'month' | 'week' | 'year'}
                    />
                  ) : (
                    <ActivityChart
                      data={data}
                      yAxisMax={yAxisMax}
                      yAxisTicks={yAxisTicks}
                    />
                  )}
                </Suspense>
              )}
            </div>
          )}
        </div>

        {interval === 'day' && activities.length > 0 && (
          <div className={cs.cardBack}>
            <div className={cs.routeContainer}>
              <Suspense fallback={null}>
                <RoutePreview activities={activities} responsive={embedded} />
              </Suspense>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// custom equality for memo: compare key summary fields, dailyDistances values and activities length
const activityCardAreEqual = (
  prev: ActivityCardProps,
  next: ActivityCardProps
) => {
  if (prev.period !== next.period) return false;
  if (prev.interval !== next.interval) return false;
  if (prev.omitChart !== next.omitChart) return false;
  if (prev.embedded !== next.embedded) return false;
  if (prev.cardWidth !== next.cardWidth) return false;
  if (prev.locale !== next.locale) return false;
  const s1 = prev.summary;
  const s2 = next.summary;
  if (
    s1.totalDistance !== s2.totalDistance ||
    s1.averageSpeed !== s2.averageSpeed ||
    s1.totalTime !== s2.totalTime ||
    s1.count !== s2.count ||
    s1.maxDistance !== s2.maxDistance ||
    s1.maxSpeed !== s2.maxSpeed ||
    s1.location !== s2.location ||
    (s1.totalElevationGain ?? undefined) !==
      (s2.totalElevationGain ?? undefined) ||
    (s1.averageHeartRate ?? undefined) !== (s2.averageHeartRate ?? undefined)
  ) {
    return false;
  }
  const d1 = prev.dailyDistances || [];
  const d2 = next.dailyDistances || [];
  if (d1.length !== d2.length) return false;
  for (let i = 0; i < d1.length; i++) if (d1[i] !== d2[i]) return false;
  const a1 = prev.activities || [];
  const a2 = next.activities || [];
  if (a1.length !== a2.length) return false;
  return true;
};

const ActivityCard = React.memo(ActivityCardInner, activityCardAreEqual);

const ActivityListInner: React.FC<
  ActivityListProps & { navigate?: NavigateFunction; activities: Activity[] }
> = ({
  onBack,
  embedded = false,
  navigate,
  initialInterval = 'month',
  hideIntervalChips = false,
  controlledYear,
  hideYearChips = false,
  activities: activityData,
}) => {
  const { t, locale } = useLocale();
  const cs = embedded ? embedStyles : styles;
  const [intervalState, setInterval] = useState<IntervalType>(initialInterval);
  // Embedded Pro Summary owns period pills via initialInterval. Keep interval
  // controlled so day->Life never paints a stale Day card grid while the host
  // drops `.summary-day-classic` (overflow/width thrash = visible shrink).
  const interval: IntervalType = embedded ? initialInterval : intervalState;
  const [sportType, setSportType] = useState<string>('all');
  const yearControlled = controlledYear !== undefined;
  // Day / Life keep independent year chips (Pro Summary switches interval in-place).
  // Sync defaults on first mount (activities already resolved via Suspense) so the
  // first paint never shows the unfiltered full Day list / full Life SVG.
  const [daySelectedYear, setDaySelectedYear] = useState<string | null>(() =>
    yearControlled
      ? controlledYear
      : defaultSelectedYear(getAvailableActivityYears(activityData))
  );
  // Life = full career by default; year chips opt-in (no auto calendar/newest year).
  const [lifeSelectedYear, setLifeSelectedYear] = useState<string | null>(() =>
    yearControlled ? controlledYear : null
  );
  const [otherSelectedYear, setOtherSelectedYear] = useState<string | null>(
    () => (yearControlled ? controlledYear : null)
  );
  const dayYearSeededRef = useRef(
    defaultSelectedYear(getAvailableActivityYears(activityData)) != null
  );
  // Already decided: stay on null unless user picks a year chip.
  const lifeYearSeededRef = useRef(true);
  const lifeCaptureRef = useRef<HTMLDivElement>(null);
  const [lifeExporting, setLifeExporting] = useState(false);
  const lifeExportingRef = useRef(false);
  const [lifeExportMessage, setLifeExportMessage] = useState('');

  // Success hint is transient; errors stay until the next export attempt.
  useEffect(() => {
    if (!lifeExportMessage) return;
    const isSuccess =
      lifeExportMessage === '图片已下载' ||
      lifeExportMessage === 'Image downloaded';
    if (!isSuccess) return;
    const timer = window.setTimeout(() => setLifeExportMessage(''), 2500);
    return () => window.clearTimeout(timer);
  }, [lifeExportMessage]);

  const availableYears = useMemo(
    () => getAvailableActivityYears(activityData),
    [activityData]
  );

  // Seed Day default once: calendar year if present, else newest with data.
  // Life stays null (full career) until the user picks a year chip.
  useEffect(() => {
    if (!availableYears.length) return;
    const def = defaultSelectedYear(availableYears);
    if (!def) return;
    if (!dayYearSeededRef.current) {
      dayYearSeededRef.current = true;
      setDaySelectedYear(def);
    }
  }, [availableYears]);

  const selectedYear = yearControlled
    ? controlledYear
    : interval === 'life'
      ? lifeSelectedYear
      : interval === 'day'
        ? daySelectedYear
        : otherSelectedYear;

  const setSelectedYear = useCallback(
    (year: string | null) => {
      if (yearControlled) return;
      if (interval === 'life') setLifeSelectedYear(year);
      else if (interval === 'day') setDaySelectedYear(year);
      else setOtherSelectedYear(year);
    },
    [interval, yearControlled]
  );

  const handleLifeExport = useCallback(async () => {
    if (!lifeCaptureRef.current || lifeExportingRef.current) return;
    lifeExportingRef.current = true;
    setLifeExporting(true);
    setLifeExportMessage('');
    const label = selectedYear ?? 'life';
    try {
      await exportCard(lifeCaptureRef.current, `life-${label}.png`);
      setLifeExportMessage(locale === 'zh' ? '图片已下载' : 'Image downloaded');
    } catch (err) {
      console.error('Life export failed:', err);
      setLifeExportMessage(
        locale === 'zh' ? '导出失败，请重试' : 'Export failed. Please retry.'
      );
    } finally {
      lifeExportingRef.current = false;
      setLifeExporting(false);
    }
  }, [locale, selectedYear]);

  const sportTypeOptions = useMemo(
    () => getSportTypeOptions(activityData),
    [activityData]
  );
  const showSportTypeFilter = sportTypeOptions.length > 2;

  // Keyboard navigation for year selection in Life view
  useEffect(() => {
    if (interval !== 'life') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle arrow keys
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

      // Prevent default scrolling behavior
      e.preventDefault();

      // Remove focus from current element to avoid visual confusion
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      const currentIndex = selectedYear
        ? availableYears.indexOf(selectedYear)
        : -1;

      if (e.key === 'ArrowLeft') {
        // Move to newer year (left in UI, lower index since sorted descending)
        if (currentIndex === -1) {
          // No year selected, select the last (oldest) year
          setSelectedYear(availableYears[availableYears.length - 1]);
        } else if (currentIndex > 0) {
          setSelectedYear(availableYears[currentIndex - 1]);
        } else if (currentIndex === 0) {
          // At the most recent year, deselect to show Life view
          setSelectedYear(null);
        }
      } else if (e.key === 'ArrowRight') {
        // Move to older year (right in UI, higher index since sorted descending)
        if (currentIndex === -1) {
          // No year selected, select the first (most recent) year
          setSelectedYear(availableYears[0]);
        } else if (currentIndex < availableYears.length - 1) {
          setSelectedYear(availableYears[currentIndex + 1]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [interval, selectedYear, availableYears]);

  const handleHomeClick = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (navigate) {
      navigate('/');
      return;
    }
    const base = import.meta.env.BASE_URL.replace(/\/$/, '') || '';
    window.location.assign(base ? `${base}/` : '/');
  };

  function toggleInterval(newInterval: IntervalType): void {
    if (newInterval === 'life' && sportType !== 'all') {
      setSportType('all');
    }
    if (newInterval === 'day') {
      void loadRoutePreview();
    }
    setInterval(newInterval);
  }

  const dataListFull = useMemo(() => {
    // Life never renders the period card list - skip grouping so day->Life
    // does not burn a frame aggregating hundreds of day rows first.
    if (interval === 'life') return [];
    const summaries = getPeriodSummaries(activityData, interval, sportType);
    if (!embedded || !selectedYear) return summaries;
    return summaries.filter(({ period }) =>
      periodMatchesYear(period, selectedYear, interval)
    );
  }, [activityData, interval, sportType, embedded, selectedYear]);

  /** Pro Summary day: page like PeriodCompare so first paint stays light. */
  const DAY_PAGE = 15;
  const dayPaged = embedded && interval === 'day';
  const [dayLimit, setDayLimit] = useState(DAY_PAGE);
  useEffect(() => {
    if (dayPaged) setDayLimit(DAY_PAGE);
  }, [dayPaged, selectedYear, sportType]);

  const dataList = useMemo(() => {
    if (!dayPaged) return dataListFull;
    return dataListFull.slice(0, dayLimit);
  }, [dataListFull, dayPaged, dayLimit]);

  const {
    itemsPerRow,
    cardWidth,
    listHeight,
    rowHeight,
    setFilterContainerRef,
    setSampleCardRef,
    setSummaryContainerRef,
  } = useActivityListMeasurements(ITEM_WIDTH, ITEM_GAP, embedded, interval);

  // ref to the VirtualList DOM node so we can control scroll position
  const virtualListRef = useRef<HTMLDivElement | null>(null);

  // when the interval changes, scroll the virtual list to top to improve UX
  useEffect(() => {
    // attempt to find the virtual list DOM node and reset scrollTop
    const resetScroll = () => {
      // prefer an explicit ref if available
      const el =
        virtualListRef.current || document.querySelector('.rc-virtual-list');
      if (el) {
        try {
          el.scrollTop = 0;
        } catch (e) {
          console.error(e);
        }
      }
    };

    // Defer to next frame so the list has time to re-render with new data
    const id = requestAnimationFrame(() => requestAnimationFrame(resetScroll));
    // also fallback to a short timeout
    const t = setTimeout(resetScroll, 50);

    return () => {
      cancelAnimationFrame(id);
      clearTimeout(t);
    };
  }, [interval, sportType, selectedYear]);

  const calcGroup: RowGroup[] = useMemo(() => {
    if (itemsPerRow < 1) return [];
    const groupLength = Math.ceil(dataList.length / itemsPerRow);
    const arr: RowGroup[] = [];
    for (let i = 0; i < groupLength; i++) {
      const start = i * itemsPerRow;
      arr.push(dataList.slice(start, start + itemsPerRow));
    }
    return arr;
  }, [dataList, itemsPerRow]);

  // compute a row width so we can center the VirtualList and keep cards left-aligned inside
  const rowWidth =
    itemsPerRow < 1
      ? '100%'
      : `${itemsPerRow * (embedded ? cardWidth : ITEM_WIDTH) + Math.max(0, itemsPerRow - 1) * ITEM_GAP}px`;

  // Classic full-page Summary still waits for measure; Pro embed must not —
  // a viewport-tall LOADING_TEXT was covering the Summary period tabs visually.
  const loading = embedded ? false : itemsPerRow < 1 || !rowHeight;
  const SelectedYearSvg = selectedYear
    ? yearSummarySvgs[`./year_summary_${selectedYear}.svg`]
    : null;

  const dataFilter =
    sportType === 'running' || sportType === 'Run'
      ? 'Run'
      : sportType === 'cycling' || sportType === 'Ride'
        ? 'Ride'
        : 'all';

  const intervalOptions: { value: IntervalType; label: string }[] = embedded
    ? [
        { value: 'year', label: t('intervalYear') },
        { value: 'month', label: t('intervalMonth') },
        { value: 'week', label: t('intervalWeek') },
        { value: 'day', label: t('intervalDay') },
        { value: 'life', label: t('intervalLife') },
      ]
    : [
        { value: 'year', label: ACTIVITY_TOTAL.YEARLY_TITLE },
        { value: 'month', label: ACTIVITY_TOTAL.MONTHLY_TITLE },
        { value: 'week', label: ACTIVITY_TOTAL.WEEKLY_TITLE },
        { value: 'day', label: ACTIVITY_TOTAL.DAILY_TITLE },
        { value: 'life', label: 'Life' },
      ];

  const sportLabel = (type: string) => {
    if (type === 'all') return locale === 'zh' ? '全部' : 'All';
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  return (
    <div
      className={cs.activityList}
      {...(embedded ? { 'data-filter': dataFilter } : {})}
    >
      {onBack && (
        <div className={styles.pageTopBar}>
          <button type="button" onClick={onBack} className={styles.backButton}>
            <svg
              className={styles.backIcon}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            {t('back')}
          </button>
          <h1 className={styles.pageTitle}>{t('summary')}</h1>
        </div>
      )}
      <div className={cs.filterContainer} ref={setFilterContainerRef}>
        {!onBack && !embedded && (
          <button className={styles.smallHomeButton} onClick={handleHomeClick}>
            {HOME_PAGE_TITLE}
          </button>
        )}
        {embedded ? (
          <>
            {/* Life only allows "all" — hide sport row so year chips align with 年/月/周. */}
            {/* Pro Summary already owns year/period chrome — skip sport row so day cards align. */}
            {showSportTypeFilter &&
            interval !== 'life' &&
            !(hideYearChips && hideIntervalChips) ? (
              <div className={cs.chipRow}>
                {sportTypeOptions.map((type) => {
                  const disabled = interval === 'life' && type !== 'all';
                  const active = sportType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      disabled={disabled}
                      className={`${cs.filterChip} ${active ? cs.filterChipActive : ''}`}
                      onClick={() => !disabled && setSportType(type)}
                    >
                      {sportLabel(type)}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {!hideIntervalChips ? (
              <div className={cs.chipRow}>
                {intervalOptions.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    className={`${cs.filterChip} ${interval === value ? cs.filterChipActive : ''}`}
                    onClick={() => toggleInterval(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
            {hideYearChips ? (
              interval === 'life' ? (
                <div className={cs.lifeExportTrailing}>
                  <button
                    type="button"
                    className={cs.lifeExportIconBtn}
                    onClick={handleLifeExport}
                    disabled={lifeExporting}
                    data-export-hidden
                    title={
                      locale === 'zh' ? '下载 Life 图片' : 'Download Life image'
                    }
                    aria-label={
                      locale === 'zh' ? '下载 Life 图片' : 'Download Life image'
                    }
                  >
                    {lifeExporting ? (
                      <svg
                        className={cs.lifeExportIconSpin}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                    ) : (
                      <svg
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                        />
                      </svg>
                    )}
                  </button>
                  {lifeExportMessage ? (
                    <span className={cs.lifeExportHint}>
                      {lifeExportMessage}
                    </span>
                  ) : null}
                </div>
              ) : null
            ) : availableYears.length > 0 || interval === 'life' ? (
              interval === 'life' ? (
                <div
                  className={cs.chipRowWithExport}
                  role="group"
                  aria-label={locale === 'zh' ? '年份' : 'Year'}
                >
                  <div className={cs.chipRowYears}>
                    {availableYears.map((year) => (
                      <button
                        key={year}
                        type="button"
                        className={`${cs.filterChip} ${selectedYear === year ? cs.filterChipActive : ''}`}
                        onClick={() =>
                          setSelectedYear(selectedYear === year ? null : year)
                        }
                      >
                        {year}
                      </button>
                    ))}
                  </div>
                  <div className={cs.lifeExportTrailing}>
                    <button
                      type="button"
                      className={cs.lifeExportIconBtn}
                      onClick={handleLifeExport}
                      disabled={lifeExporting}
                      data-export-hidden
                      title={
                        locale === 'zh'
                          ? '下载 Life 图片'
                          : 'Download Life image'
                      }
                      aria-label={
                        locale === 'zh'
                          ? '下载 Life 图片'
                          : 'Download Life image'
                      }
                    >
                      {lifeExporting ? (
                        <svg
                          className={cs.lifeExportIconSpin}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                          aria-hidden
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                      ) : (
                        <svg
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                          aria-hidden
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                          />
                        </svg>
                      )}
                    </button>
                    {lifeExportMessage ? (
                      <span className={cs.lifeExportHint}>
                        {lifeExportMessage}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div
                  className={cs.chipRow}
                  role="group"
                  aria-label={locale === 'zh' ? '年份' : 'Year'}
                >
                  {availableYears.map((year) => (
                    <button
                      key={year}
                      type="button"
                      className={`${cs.filterChip} ${selectedYear === year ? cs.filterChipActive : ''}`}
                      onClick={() =>
                        setSelectedYear(selectedYear === year ? null : year)
                      }
                    >
                      {year}
                    </button>
                  ))}
                </div>
              )
            ) : null}
          </>
        ) : (
          <>
            <select
              onChange={(e) => setSportType(e.target.value)}
              value={sportType}
            >
              {sportTypeOptions.map((type) => (
                <option
                  key={type}
                  value={type}
                  disabled={interval === 'life' && type !== 'all'}
                >
                  {type}
                </option>
              ))}
            </select>
            <select
              onChange={(e) => toggleInterval(e.target.value as IntervalType)}
              value={interval}
            >
              <option value="year">{ACTIVITY_TOTAL.YEARLY_TITLE}</option>
              <option value="month">{ACTIVITY_TOTAL.MONTHLY_TITLE}</option>
              <option value="week">{ACTIVITY_TOTAL.WEEKLY_TITLE}</option>
              <option value="day">{ACTIVITY_TOTAL.DAILY_TITLE}</option>
              <option value="life">Life</option>
            </select>
          </>
        )}
      </div>

      {interval === 'life' && (
        <div className={cs.lifeContainer}>
          {embedded ? null : (
            <div
              className={`${styles.yearSelector} ${styles.chipRowWithExport}`}
              data-export-hidden
            >
              <div className={styles.chipRowYears}>
                {availableYears.map((year) => (
                  <button
                    key={year}
                    className={`${styles.yearButton} ${selectedYear === year ? styles.yearButtonActive : ''}`}
                    onClick={() =>
                      setSelectedYear(selectedYear === year ? null : year)
                    }
                  >
                    {year}
                  </button>
                ))}
              </div>
              <div className={styles.lifeExportTrailing}>
                <button
                  type="button"
                  className={styles.lifeExportIconBtn}
                  onClick={handleLifeExport}
                  disabled={lifeExporting}
                  data-export-hidden
                  title={
                    locale === 'zh' ? '下载 Life 图片' : 'Download Life image'
                  }
                  aria-label={
                    locale === 'zh' ? '下载 Life 图片' : 'Download Life image'
                  }
                >
                  {lifeExporting ? (
                    <svg
                      className={styles.lifeExportIconSpin}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                  ) : (
                    <svg
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                  )}
                </button>
                {lifeExportMessage ? (
                  <span className={styles.lifeExportHint}>
                    {lifeExportMessage}
                  </span>
                ) : null}
              </div>
            </div>
          )}
          <div
            ref={lifeCaptureRef}
            className={embedded ? cs.lifeSvgWrap : styles.lifeSvgWrap}
          >
            <SvgTitleTipHost key={`${selectedYear ?? 'life'}-${sportType}`}>
              <Suspense
                fallback={
                  <div
                    className={embedded ? cs.embedPending : undefined}
                    role="status"
                    aria-live="polite"
                    style={
                      embedded
                        ? undefined
                        : {
                            minHeight: 160,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--color-run-table-thead)',
                          }
                    }
                  >
                    {LOADING_TEXT}
                  </div>
                }
              >
                {SelectedYearSvg ? (
                  <SelectedYearSvg className={cs.yearSummarySvg} />
                ) : (
                  <>
                    {(sportType === 'running' || sportType === 'Run') && (
                      <RunningSvg />
                    )}
                    {sportType === 'walking' && <WalkingSvg />}
                    {sportType === 'hiking' && <HikingSvg />}
                    {sportType === 'cycling' && <CyclingSvg />}
                    {sportType === 'swimming' && <SwimmingSvg />}
                    {sportType === 'skiing' && <SkiingSvg />}
                    {sportType === 'all' && <AllSvg />}
                  </>
                )}
              </Suspense>
            </SvgTitleTipHost>
          </div>
        </div>
      )}

      {interval !== 'life' && (
        <div className={cs.summaryContainer} ref={setSummaryContainerRef}>
          {/* hidden sample card for measuring row height */}
          <div
            style={{
              position: 'absolute',
              visibility: 'hidden',
              pointerEvents: 'none',
              height: 'auto',
            }}
            ref={setSampleCardRef}
          >
            {dataList[0] && (
              <ActivityCard
                key={dataList[0].period}
                period={dataList[0].period}
                summary={toDisplaySummary(dataList[0].summary)}
                dailyDistances={dataList[0].summary.dailyDistances}
                interval={interval}
                omitChart={embedded}
                embedded={embedded}
                cardWidth={embedded ? cardWidth : undefined}
                locale={locale}
                activities={
                  interval === 'day'
                    ? dataList[0].summary.activities
                    : undefined
                }
              />
            )}
          </div>
          <div className={cs.summaryInner}>
            <div style={{ width: rowWidth }}>
              {loading ? (
                // Use full viewport height (or viewport minus filter height if available) to avoid flicker
                <div
                  style={{
                    height: listHeight,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div
                    style={{
                      padding: 20,
                      color: 'var(--color-run-table-thead)',
                    }}
                  >
                    {LOADING_TEXT}
                  </div>
                </div>
              ) : (
                <VirtualList
                  key={
                    embedded
                      ? `${sportType}-${interval}`
                      : `${sportType}-${interval}-${itemsPerRow}`
                  }
                  data={calcGroup}
                  height={
                    dayPaged && dataListFull.length > dayLimit
                      ? Math.max(120, listHeight - 64)
                      : listHeight
                  }
                  itemHeight={rowHeight}
                  itemKey={(row: RowGroup) => row[0]?.period ?? ''}
                  styles={VIRTUAL_LIST_STYLES}
                >
                  {(row: RowGroup) => (
                    <div
                      ref={virtualListRef}
                      className={cs.rowContainer}
                      style={{ gap: `${ITEM_GAP}px` }}
                    >
                      {row.map(
                        (cardData: {
                          period: string;
                          summary: ActivitySummary;
                        }) => (
                          <ActivityCard
                            key={cardData.period}
                            period={cardData.period}
                            summary={toDisplaySummary(cardData.summary)}
                            dailyDistances={cardData.summary.dailyDistances}
                            interval={interval}
                            embedded={embedded}
                            cardWidth={embedded ? cardWidth : undefined}
                            locale={locale}
                            activities={
                              interval === 'day'
                                ? cardData.summary.activities
                                : undefined
                            }
                          />
                        )
                      )}
                    </div>
                  )}
                </VirtualList>
              )}
              {dayPaged && dataListFull.length > dayLimit ? (
                <div className={cs.loadMoreWrap}>
                  <button
                    type="button"
                    className={cs.loadMoreBtn}
                    onClick={() => setDayLimit((n) => n + DAY_PAGE)}
                  >
                    {locale === 'zh' ? '加载更多' : 'Load more'} ({dayLimit}/
                    {dataListFull.length})
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function ActivityListWithRouter(props: ActivityListProps) {
  const navigate = useNavigate();
  return <ActivityListResolved {...props} navigate={navigate} />;
}

/**
 * Resolves the activity list without always fetching the bundled payload.
 *
 * Two components instead of one `providedActivities ?? useActivities()` because
 * the hook cannot be called conditionally: the Pro Summary passes its own lite
 * list, and mounting the hook anyway would trigger the 2 MB activities.json
 * fetch the lite path exists to avoid.
 */
function ActivityListResolved(
  props: ActivityListProps & { navigate?: NavigateFunction }
) {
  if (props.activities) {
    return <ActivityListInner {...props} activities={props.activities} />;
  }
  return <ActivityListFromBundle {...props} />;
}

function ActivityListFromBundle(
  props: ActivityListProps & { navigate?: NavigateFunction }
) {
  const { activities } = useActivities();
  return <ActivityListInner {...props} activities={activities} />;
}

const ActivityList: React.FC<ActivityListProps> = (props) => {
  const inRouter = useInRouterContext();
  if (inRouter) {
    return <ActivityListWithRouter {...props} />;
  }
  return <ActivityListResolved {...props} />;
};

export default ActivityList;
