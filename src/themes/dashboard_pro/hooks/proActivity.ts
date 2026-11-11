import type { Activity } from '@/types';

/**
 * Activity as delivered by `public/data/activities.lite.json`.
 *
 * The lite payload drops `summary_polyline` (geometry lives in the track
 * sidecar, ~2MB) and instead carries `has_gps`, so checks like "is this an
 * outdoor run with a track" stay synchronous and do not wait for the sidecar.
 *
 * Declared here rather than on the shared `Activity` type: only this theme
 * consumes the lite payload, and other themes keep the full bundled file.
 */
export type ProActivity = Activity & {
  /** Lite-only: true when the run has usable GPS geometry in the sidecar. */
  has_gps?: boolean;
};

/** True when the run has geometry — works for both lite and full payloads. */
export function hasGeometry(a: ProActivity): boolean {
  if (a.has_gps != null) return a.has_gps;
  return Boolean(a.summary_polyline && a.summary_polyline.length > 20);
}
