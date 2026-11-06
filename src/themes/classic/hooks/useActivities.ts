import { useMemo } from 'react';
import type { Activity } from '../utils/utils';
import { locationForRun, titleForRun } from '../utils/utils';
import { COUNTRY_STANDARDIZATION } from '../static/city';
import { getActivityData as getSharedActivityData } from '@/core/hooks/useActivities';

interface ProcessedActivities {
  activities: Activity[];
  years: string[];
  countries: string[];
  provinces: string[];
  cities: Record<string, number>;
  runPeriod: Record<string, number>;
  thisYear: string;
}

const standardizeCountryName = (country: string): string => {
  for (const [pattern, standardName] of COUNTRY_STANDARDIZATION) {
    if (country.includes(pattern)) {
      return standardName;
    }
  }
  return country;
};

// Share the app-wide activities.json cache (core). Classic previously kept a
// second Suspense cache; first Pro Summary → day/Life then re-threw a Promise
// and lit the panel-wide fallback even though year/month/week already had data.
const getActivityData = (): Activity[] =>
  getSharedActivityData() as unknown as Activity[];

const processActivities = (activityData: Activity[]): ProcessedActivities => {
  const cities: Record<string, number> = {};
  const runPeriod: Record<string, number> = {};
  const provinces: Set<string> = new Set();
  const countries: Set<string> = new Set();
  const years: Set<string> = new Set();

  activityData.forEach((run) => {
    const location = locationForRun(run);

    const periodName = titleForRun(run);
    if (periodName) {
      runPeriod[periodName] = runPeriod[periodName]
        ? runPeriod[periodName] + 1
        : 1;
    }

    const { city, province, country } = location;
    // drop only one char city
    if (city.length > 1) {
      cities[city] = cities[city] ? cities[city] + run.distance : run.distance;
    }
    if (province) provinces.add(province);
    if (country) countries.add(standardizeCountryName(country));
    const year = run.start_date_local.slice(0, 4);
    years.add(year);
  });

  const yearsArray = [...years].sort().reverse();
  const thisYear = yearsArray[0] || '';

  return {
    activities: activityData,
    years: yearsArray,
    countries: [...countries],
    provinces: [...provinces],
    cities,
    runPeriod,
    thisYear,
  };
};

let processedActivitiesCache: {
  activityData: Activity[];
  processedActivities: ProcessedActivities;
} | null = null;

const getProcessedActivities = (activityData: Activity[]) => {
  if (processedActivitiesCache?.activityData === activityData) {
    return processedActivitiesCache.processedActivities;
  }

  const processedActivities = processActivities(activityData);
  processedActivitiesCache = { activityData, processedActivities };
  return processedActivities;
};

const useActivities = () => {
  const activityData = getActivityData();
  return useMemo(() => getProcessedActivities(activityData), [activityData]);
};

export default useActivities;
