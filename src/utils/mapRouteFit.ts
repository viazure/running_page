import * as polyline from '@mapbox/polyline';
import mapboxgl from 'mapbox-gl';
import type { Activity } from '../types';
import type { Coordinate } from './routeAnimation';

function boundsFromCoords(coords: Coordinate[]): mapboxgl.LngLatBounds | null {
  if (coords.length === 0) return null;
  const bounds = new mapboxgl.LngLatBounds();
  for (const c of coords) bounds.extend(c);
  return bounds;
}

/** Fit camera to a single selected route (dashboard RouteMap). */
export function fitMapToSelectedRoute(
  map: mapboxgl.Map,
  coords: Coordinate[],
  privacy: boolean
): void {
  const bounds = boundsFromCoords(coords);
  if (!bounds) return;
  map.easeTo({
    pitch: 0,
    bearing: 0,
    duration: privacy ? 200 : 400,
  });
  map.fitBounds(bounds, {
    padding: 50,
    maxZoom: 14,
    duration: privacy ? 200 : 500,
  });
}

/** Fit camera to all routes on home map (trimmed bbox). */
export function fitMapToRouteOverview(
  map: mapboxgl.Map,
  activities: Activity[],
  privacy: boolean
): void {
  const allCoords: [number, number][] = [];
  for (const a of activities) {
    if (!a.summary_polyline) continue;
    const coords = polyline.decode(a.summary_polyline);
    if (coords.length > 0) {
      allCoords.push([coords[0][1], coords[0][0]]);
    }
  }
  if (allCoords.length === 0) return;

  const trimPct = 0.1;
  const trimCount = Math.floor(allCoords.length * trimPct);
  const lngs = allCoords.map((c) => c[0]).sort((a, b) => a - b);
  const lats = allCoords.map((c) => c[1]).sort((a, b) => a - b);

  const bounds = new mapboxgl.LngLatBounds(
    [lngs[trimCount], lats[trimCount]],
    [lngs[lngs.length - 1 - trimCount], lats[lats.length - 1 - trimCount]]
  );

  map.easeTo({
    pitch: 0,
    bearing: 0,
    duration: privacy ? 200 : 400,
  });
  map.fitBounds(bounds, {
    padding: 30,
    maxZoom: 13,
    duration: privacy ? 200 : 500,
  });
}

/** Fit camera to all routes on Tracks page map. */
export function fitTrackMapOverview(
  map: mapboxgl.Map,
  activities: Activity[],
  privacy: boolean
): void {
  const allCoords = activities
    .filter((a) => a.summary_polyline)
    .flatMap((a) =>
      polyline
        .decode(a.summary_polyline!)
        .map(([lat, lng]) => [lng, lat] as [number, number])
    );
  if (allCoords.length === 0) return;

  const lngs = allCoords.map((c) => c[0]).sort((a, b) => a - b);
  const lats = allCoords.map((c) => c[1]).sort((a, b) => a - b);
  const t = Math.floor(lngs.length * 0.1);

  map.easeTo({ pitch: 0, bearing: 0, duration: privacy ? 200 : 600 });
  map.fitBounds(
    new mapboxgl.LngLatBounds(
      [lngs[t], lats[t]],
      [lngs[lngs.length - 1 - t], lats[lats.length - 1 - t]]
    ),
    {
      padding: 30,
      maxZoom: 13,
      duration: privacy ? 200 : 800,
    }
  );
}
