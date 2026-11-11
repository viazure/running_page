import { useEffect, useState } from 'react';
import {
  capabilitiesFromActivities,
  mergeCapabilities,
  type Capabilities,
} from '../summary/capabilities';

/** Shape of `public/summary/aggregates.json` (see run_page/gen_summary.py). */
export type MonthlySummary = {
  key: string;
  distanceM: number;
  seconds: number;
  runs: number;
  activeDays: number;
  weightedPaceSecPerKm: number | null;
};

export type BestEffortSeries = Record<
  string,
  { date: string; seconds: number }[]
>;

export type SummaryAggregates = {
  version: number;
  generatedFor: number;
  capabilities: Partial<Capabilities>;
  monthly: MonthlySummary[];
  yearly: MonthlySummary[];
  loadDays: { date: string; load: number }[];
  vo2max: { date: string; value: number }[];
  cadenceMonthly: { key: string; median: number | null }[];
  groundContactMonthly: { key: string; median: number | null }[];
  decouplingMonthly: { key: string; median: number | null }[];
  hrZonesMonthly: { key: string; seconds: number[] }[];
  bestEfforts: BestEffortSeries;
  paceDistribution: { band: number; count: number }[];
  hourDistribution: number[];
  eddington: number;
  activeDays: number;
};

const BASE = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const AGG_URL = `${BASE}summary/aggregates.json`;

let cache: SummaryAggregates | null = null;
let promise: Promise<SummaryAggregates | null> | null = null;
let unavailable = false;

function fetchAggregates(): Promise<SummaryAggregates | null> {
  promise ??= fetch(AGG_URL)
    .then((res) => {
      if (!res.ok) throw new Error(String(res.status));
      const type = res.headers.get('content-type') ?? '';
      if (type.includes('text/html')) throw new Error('not generated');
      return res.json() as Promise<SummaryAggregates>;
    })
    .then((data) => {
      if (!data || typeof data !== 'object') throw new Error('bad payload');
      cache = data;
      return data;
    })
    .catch(() => {
      // Absent aggregates is a supported state: deeper analysis hides itself.
      unavailable = true;
      return null;
    });
  return promise;
}

export function getLoadedAggregates(): SummaryAggregates | null {
  return cache;
}

export function areAggregatesUnavailable(): boolean {
  return unavailable;
}

/**
 * Aggregates + capability report for the Summary page.
 *
 * Capabilities start from the L0/L1 fields present in the activity list, so the
 * page can gate immediately; deeper tiers light up when the file arrives.
 */
export function useSummaryAggregates(
  activities: {
    average_heartrate?: number | null;
    elevation_gain?: number | null;
  }[]
): {
  aggregates: SummaryAggregates | null;
  capabilities: Capabilities;
  loading: boolean;
} {
  const [aggregates, setAggregates] = useState<SummaryAggregates | null>(
    getLoadedAggregates()
  );
  const [loading, setLoading] = useState(
    !getLoadedAggregates() && !unavailable
  );

  useEffect(() => {
    if (cache || unavailable) {
      setAggregates(cache);
      setLoading(false);
      return;
    }
    let cancelled = false;
    void fetchAggregates().then((data) => {
      if (cancelled) return;
      setAggregates(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const base = capabilitiesFromActivities(activities);
  const capabilities = mergeCapabilities(
    base,
    aggregates?.capabilities ?? null
  );

  return { aggregates, capabilities, loading };
}
