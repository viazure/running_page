/**
 * dashboard_pro activity loader.
 *
 * Reads `public/data/activities.lite.json` (polylines stripped by
 * `run_page/gen_lite.mjs`) so first paint does not wait for ~93% dead weight.
 * Track geometry is fetched separately by `trackSidecar` on demand.
 *
 * Falls back to the bundled full `activities.json` when the lite file is absent
 * (a fork that never ran the generator, or a deploy without the build step), so
 * the theme still works — just without the payload win.
 *
 * Scoped to this theme on purpose: core `useActivities` and the other themes keep
 * reading the full bundled file.
 */

import { useMemo } from 'react';
import type { Activity } from '@/types';
import { getActivityData as getCoreActivityData } from '@/hooks/useActivities';

const BASE = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const LITE_URL = `${BASE}data/activities.lite.json`;

let liteCache: Activity[] | null = null;
let litePromise: Promise<Activity[]> | null = null;
let liteUnavailable = false;
/** Attempts made so far; a transient failure must not strand the session. */
let liteAttempts = 0;
const LITE_MAX_ATTEMPTS = 3;

function fetchLite(): Promise<Activity[]> {
  if (liteCache) return Promise.resolve(liteCache);
  if (liteUnavailable && liteAttempts >= LITE_MAX_ATTEMPTS) {
    return Promise.resolve(getCoreActivityData() as Activity[]);
  }
  litePromise ??= (() => {
    liteAttempts += 1;
    return fetch(LITE_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`lite ${res.status}`);
        const type = res.headers.get('content-type') ?? '';
        // Dev servers answer unknown paths with index.html.
        if (type.includes('text/html')) throw new Error('lite not generated');
        return res.json() as Promise<Activity[]>;
      })
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('lite is not an array');
        liteCache = data;
        liteUnavailable = false;
        liteAttempts = 0;
        return data;
      })
      .catch(() => {
        // Missing sidecar is a supported state, not an error — but a network
        // blip should not pin the whole session to the full payload either, so
        // allow later calls to retry until the attempt cap is reached.
        liteUnavailable = true;
        litePromise = null;
        return getCoreActivityData() as Activity[];
      });
  })();
  return litePromise;
}

/** Synchronous peek for the resolved lite list (null while pending). */
export function getLoadedLiteActivities(): Activity[] | null {
  return liteCache;
}

/** True when the lite file could not be used and the full payload is in play. */
export function isLiteUnavailable(): boolean {
  return liteUnavailable;
}

/**
 * Suspense-compatible read. Throws the in-flight promise on first call so the
 * caller's boundary shows a skeleton, then returns the resolved list.
 */
export function getProActivityData(): Activity[] {
  if (liteCache) return liteCache;
  if (liteUnavailable) return getCoreActivityData() as Activity[];
  throw fetchLite();
}

/** Kick off the lite fetch early (call from the theme entry). */
export function preloadProActivityData(): Promise<Activity[]> {
  return fetchLite();
}

export function resetProActivityData(): void {
  liteCache = null;
  litePromise = null;
  liteUnavailable = false;
  liteAttempts = 0;
}

/** Hook wrapper mirroring the core signature; used by Pro components. */
export function useProActivities(): Activity[] {
  return useMemo(() => getProActivityData(), []);
}
