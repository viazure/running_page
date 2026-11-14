/** Shared run deep-link hash: `#run_<id>` locates; `#run_<id>/analysis` also opens splits. */

export type RunHash = {
  runId: number;
  analysis: boolean;
};

export const RUN_HASH_CHANGE_EVENT = 'running-page-hash-run-change';

/** Only `#run_<digits>` or `#run_<digits>/analysis`. Anything else is ignored. */
const RUN_HASH_RE = /^#run_([1-9]\d*)(\/analysis)?$/;

export function parseRunHash(hash: string): RunHash | null {
  const raw = hash.startsWith('#') ? hash : `#${hash}`;
  const match = RUN_HASH_RE.exec(raw);
  if (!match) return null;
  const runId = Number(match[1]);
  if (!Number.isSafeInteger(runId)) return null;
  return { runId, analysis: match[2] === '/analysis' };
}

export function formatRunHash(runId: number, analysis = false): string {
  return analysis ? `#run_${runId}/analysis` : `#run_${runId}`;
}

// useSyncExternalStore requires a stable snapshot: a new object each
// read looks like a store change and will infinite-loop the renderer.
let cachedRunHash: RunHash | null = null;

export function readRunHash(): RunHash | null {
  if (typeof window === 'undefined') return null;
  const next = parseRunHash(window.location.hash);
  if (
    cachedRunHash === next ||
    (cachedRunHash != null &&
      next != null &&
      cachedRunHash.runId === next.runId &&
      cachedRunHash.analysis === next.analysis)
  ) {
    return cachedRunHash;
  }
  cachedRunHash = next;
  return cachedRunHash;
}

export function notifyRunHashChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(RUN_HASH_CHANGE_EVENT));
}

export function writeRunHash(
  runId: number,
  analysis: boolean,
  mode: 'push' | 'replace'
): void {
  if (typeof window === 'undefined') return;
  const next = formatRunHash(runId, analysis);
  if (window.location.hash === next) return;
  const url = `${window.location.pathname}${window.location.search}${next}`;
  if (mode === 'replace') {
    window.history.replaceState(null, '', url);
  } else {
    window.history.pushState(null, '', url);
  }
  notifyRunHashChange();
}

/** Drop the hash, keeping pathname + search. Uses pushState, same as classic. */
export function clearRunHash(): void {
  if (typeof window === 'undefined') return;
  if (!window.location.hash) return;
  window.history.pushState(
    null,
    '',
    `${window.location.pathname}${window.location.search}`
  );
  notifyRunHashChange();
}

/**
 * Clear an invalid/unknown `#run_…` without adding a history entry
 * (same as classic when the id is not in the activity list).
 */
export function replaceClearedRunHash(): void {
  if (typeof window === 'undefined') return;
  if (!window.location.hash) return;
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}`
  );
  notifyRunHashChange();
}

export function activityYear(startDateLocal: string): number | null {
  const match = /^(\d{4})/.exec(startDateLocal);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isInteger(year) ? year : null;
}
