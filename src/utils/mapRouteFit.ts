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

/** Pull back so an export end card can show the whole route beside left-side stats. */
export function fitMapToEndCard(
  map: mapboxgl.Map,
  coords: Coordinate[],
  opts?: { sizeMode?: 'native' | 'phone' }
): void {
  const bounds = boundsFromCoords(coords);
  if (!bounds) return;
  const width = map.getContainer().clientWidth || 1;
  const height = map.getContainer().clientHeight || 1;
  map.stop();
  const phone = opts?.sizeMode === 'phone';
  // Phone video cover-crops the center 9:16 of this canvas. Fit the route into
  // that crop (not the full window) so fullscreen and a small card match.
  const padding = phone
    ? phoneEndCardPadding(width, height)
    : {
        top: 48,
        bottom: 40,
        left: Math.round(Math.max(140, width * 0.42)),
        right: 36,
      };
  const camera = map.cameraForBounds(bounds, {
    padding,
    maxZoom: phone ? 17.5 : 16,
  });
  if (!camera || camera.zoom == null) return;
  // End still used to fit the whole route into padded space and read small.
  // 1.5× linear scale ≈ +0.58 zoom (both native and phone).
  const zoom = Math.min(camera.zoom + Math.log2(1.5), phone ? 18 : 17);
  map.easeTo({
    center: camera.center,
    zoom,
    bearing: 0,
    pitch: 0,
    duration: 800,
  });
}

/** Padding that places the route inside the 1080×1920 cover crop, left room for stats. */
function phoneEndCardPadding(
  width: number,
  height: number
): { top: number; bottom: number; left: number; right: number } {
  const targetAspect = 1080 / 1920;
  const insetLeft = 0.4;
  const insetRight = 0.08;
  const insetTop = 0.12;
  const insetBottom = 0.14;
  if (width / height > targetAspect) {
    const cropW = height * targetAspect;
    const side = (width - cropW) / 2;
    return {
      top: Math.round(height * insetTop),
      bottom: Math.round(height * insetBottom),
      left: Math.round(side + cropW * insetLeft),
      right: Math.round(side + cropW * insetRight),
    };
  }
  const cropH = width / targetAspect;
  const vert = (height - cropH) / 2;
  return {
    top: Math.round(vert + cropH * insetTop),
    bottom: Math.round(vert + cropH * insetBottom),
    left: Math.round(width * insetLeft),
    right: Math.round(width * insetRight),
  };
}

export function waitForMapIdle(
  map: mapboxgl.Map,
  timeoutMs = 1600
): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    map.once('idle', finish);
    window.setTimeout(finish, timeoutMs);
  });
}

/** Smooth start and stop — a hard ease reads as the view being yanked. */
const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * Camera that frames a route at a readable scale.
 *
 * `maxZoom` is the ceiling for short runs: without it a 5 km loop fills the
 * card with two blocks. It is deliberately close to street level — the point
 * is to see the route, and the *transition* is what has to stay gentle, not
 * the final zoom.
 */
function routeCameraFor(
  map: mapboxgl.Map,
  coords: Coordinate[],
  opts?: { padding?: number; maxZoom?: number }
): { center: mapboxgl.LngLat; zoom: number } | null {
  const bounds = boundsFromCoords(coords);
  if (!bounds) return null;
  const camera = map.cameraForBounds(bounds, {
    padding: opts?.padding ?? 56,
    maxZoom: opts?.maxZoom ?? 13.5,
  });
  if (!camera || camera.zoom == null || !camera.center) return null;
  return { center: mapboxgl.LngLat.convert(camera.center), zoom: camera.zoom };
}

/**
 * True when re-fitting would be a no-op the user cannot perceive.
 *
 * Two independent conditions, both required:
 *
 * 1. The target zoom is already what we would set (±0.5). A very short run
 *    hitting the `maxZoom` ceiling makes `cameraForBounds` return 13.49 while
 *    the map sits at 13.5, so an exact match is too strict.
 * 2. The whole route is inside the viewport with a margin.
 *
 * Relying on (2) alone was wrong: from a national overview a 5 km route is
 * also "inside the viewport", so a pick there did nothing at all. Relying on
 * (1) alone was wrong too: same zoom but a different city still needs a pan.
 */
function isRouteAlreadyFramed(
  map: mapboxgl.Map,
  camera: { zoom: number },
  coords: Coordinate[]
): boolean {
  if (Math.abs(camera.zoom - map.getZoom()) >= 0.5) return false;
  const bounds = boundsFromCoords(coords);
  if (!bounds) return false;
  const { clientWidth: width, clientHeight: height } = map.getContainer();
  if (!width || !height) return false;
  // Generous margin: the fit itself uses 56px padding.
  const marginX = width * 0.08;
  const marginY = height * 0.08;
  try {
    const nw = map.project(bounds.getNorthWest());
    const se = map.project(bounds.getSouthEast());
    const minX = Math.min(nw.x, se.x);
    const maxX = Math.max(nw.x, se.x);
    const minY = Math.min(nw.y, se.y);
    const maxY = Math.max(nw.y, se.y);
    return (
      minX > marginX &&
      maxX < width - marginX &&
      minY > marginY &&
      maxY < height - marginY
    );
  } catch {
    return false;
  }
}

/**
 * Frame a single selected route with one adaptive camera move.
 *
 * A fixed duration felt like a dive when jumping from a national overview to
 * street level, while capping `maxZoom` lower left short runs as a dot — both
 * traded away something the user wanted. So the destination is always the
 * readable frame; only the *duration* scales with how far the camera travels.
 *
 * Single `easeTo` (not easeTo + fitBounds): the two used to stack and the
 * interrupted first leg read as the view being pulled down.
 *
 * `force` skips the "already framed" shortcut — explicit re-centre actions and
 * post-resize refits must always reposition, even when the route is in view.
 */
export function fitMapToSelectedRoute(
  map: mapboxgl.Map,
  coords: Coordinate[],
  privacy: boolean,
  opts?: { force?: boolean }
): void {
  const camera = routeCameraFor(map, coords);
  if (!camera) return;

  map.stop();

  if (privacy) {
    map.easeTo({
      center: camera.center,
      zoom: camera.zoom,
      pitch: 0,
      bearing: 0,
      duration: 200,
    });
    return;
  }

  // Already framed: leave the camera alone. The selection highlight, log row
  // and calendar day already confirm the pick; re-fitting would only jitter.
  if (!opts?.force && isRouteAlreadyFramed(map, camera, coords)) return;

  const zoomSpan = Math.abs(camera.zoom - map.getZoom());

  const duration =
    zoomSpan >= 5 ? 1000 : zoomSpan >= 3 ? 820 : zoomSpan >= 1.5 ? 640 : 480;

  map.easeTo({
    center: camera.center,
    zoom: camera.zoom,
    pitch: 0,
    bearing: 0,
    duration,
    easing: easeInOutCubic,
  });
}

/** Light sample for overview 3D orbit (each route start + end). */
export function overviewOrbitCoords(activities: Activity[]): Coordinate[] {
  const out: Coordinate[] = [];
  for (const a of activities) {
    if (!a.summary_polyline) continue;
    const coords = polyline.decode(a.summary_polyline);
    if (coords.length === 0) continue;
    out.push([coords[0][1], coords[0][0]]);
    const last = coords[coords.length - 1];
    out.push([last[1], last[0]]);
  }
  return out;
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

  // One move (pitch/bearing reset is part of it) — easeTo + fitBounds used to
  // run back to back and the interrupted first leg felt like a downward yank.
  const camera = map.cameraForBounds(bounds, { padding: 30, maxZoom: 13 });
  if (!camera || camera.zoom == null || !camera.center) return;
  map.stop();
  map.easeTo({
    center: mapboxgl.LngLat.convert(camera.center),
    zoom: camera.zoom,
    pitch: 0,
    bearing: 0,
    duration: privacy ? 200 : 600,
    easing: easeInOutCubic,
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

  const bounds = new mapboxgl.LngLatBounds(
    [lngs[t], lats[t]],
    [lngs[lngs.length - 1 - t], lats[lats.length - 1 - t]]
  );
  const duration = privacy ? 200 : 800;
  // One Mapbox zoom level closer than a plain fitBounds (padding 30 / maxZoom 13).
  map.stop();
  const camera = map.cameraForBounds(bounds, {
    padding: 30,
    maxZoom: 14,
  });
  if (!camera || camera.zoom == null) {
    map.easeTo({ pitch: 0, bearing: 0, duration: privacy ? 200 : 600 });
    map.fitBounds(bounds, {
      padding: 30,
      maxZoom: 14,
      duration,
    });
    return;
  }
  map.easeTo({
    center: camera.center,
    zoom: Math.min(camera.zoom + 1, 14),
    bearing: 0,
    pitch: 0,
    duration,
  });
}
