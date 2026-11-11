import { useEffect, useMemo, useState } from 'react';
import type { Activity } from '@/types';
import { getLoadedTracks, preloadTracks, withTracks } from './trackSidecar';

type TrackMap = Record<string, string>;

function mergeTracksSync(
  activities: Activity[],
  tracks: TrackMap | null
): Activity[] {
  if (!tracks) return activities;
  let changed = false;
  const out = activities.map((a) => {
    const polyline = tracks[String(a.run_id)];
    if (!polyline || polyline === a.summary_polyline) return a;
    changed = true;
    return { ...a, summary_polyline: polyline };
  });
  return changed ? out : activities;
}

/**
 * Merge the polylines sidecar into the lite activity list.
 *
 * The lite payload renders stats / heatmap / log immediately; geometry arrives
 * afterwards for the map, track wall and calendar route previews.
 * Returns the lite list unchanged when the sidecar is missing (a fork that never
 * ran `run_page/gen_lite.mjs`), so existing empty states still apply.
 */
export function useActivitiesWithTracks(activities: Activity[]): Activity[] {
  const [tracks, setTracks] = useState<TrackMap | null>(() =>
    getLoadedTracks()
  );

  useEffect(() => {
    let cancelled = false;
    const cached = getLoadedTracks();
    if (cached) {
      setTracks(cached);
      return;
    }
    // Skip the fetch entirely when every summary already carries geometry.
    if (activities.length > 0 && activities.every((a) => a.summary_polyline)) {
      return;
    }
    void preloadTracks().then((loaded) => {
      if (!cancelled && loaded) setTracks(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [activities]);

  return useMemo(
    () => mergeTracksSync(activities, tracks),
    [activities, tracks]
  );
}

/** Async one-off variant for callers outside the render tree. */
export async function mergeTracks(activities: Activity[]): Promise<Activity[]> {
  return (await withTracks(activities)) as Activity[];
}
