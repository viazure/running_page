import { formatElevationMeters, type SummarizeStats } from '@/utils/summary';

/**
 * Shared year / month / week 2×3 tile set. Order is fixed so the two metrics
 * that are often missing (elevation, heart rate) sit at the end of each row.
 */
export function periodHeroTiles(
  stats: SummarizeStats,
  tr: (zh: string, en: string) => string,
  values: {
    avgPace: string;
    avgDistance: string;
    longest: string;
    fastestPace: string;
  },
  locale: string
): [string, string][] {
  return [
    [tr('最远距离', 'Longest distance'), values.longest],
    [tr('最快配速', 'Fastest pace'), values.fastestPace],
    [
      tr('累计爬升', 'Elevation gain'),
      formatElevationMeters(stats.elevation, stats.elevationComplete, locale),
    ],
    [tr('平均配速', 'Avg pace'), values.avgPace],
    [tr('平均距离', 'Avg distance'), values.avgDistance],
    [
      tr('平均心率', 'Avg HR'),
      stats.heartRate != null ? `${Math.round(stats.heartRate)} bpm` : '—',
    ],
  ];
}
