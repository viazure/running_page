import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import * as polyline from '@mapbox/polyline';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { Activity } from '../types';
import {
  getAvailableYears,
  formatDistance,
  parseMovingTime,
  formatPace,
} from '../hooks/useActivities';
import { useLocale } from '../hooks/useLocale';
import { MAPBOX_TOKEN } from '../config';
import {
  blankMapStyle,
  mapboxBasemapStyle,
  MAP_STYLE_LOAD_TIMEOUT_MS,
} from '../core/mapStyle';
import { RouteAnimator, type Coordinate } from '../utils/routeAnimation';
import './RouteMap.css';

type SportType = 'Run';

interface TracksPageProps {
  activities: Activity[];
  filter: string;
  onBack: () => void;
  onSelectActivity?: (a: Activity | null) => void;
  getTitle?: (a: Activity) => string;
  lightsOff?: boolean;
  dark?: boolean;
}

function renderTrackSVG(summaryPolyline: string, size = 80): string {
  try {
    const coords = polyline.decode(summaryPolyline);
    if (coords.length < 2) return '';
    const lats = coords.map((c) => c[0]);
    const lngs = coords.map((c) => c[1]);
    const minLat = Math.min(...lats),
      maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs),
      maxLng = Math.max(...lngs);
    const latRange = maxLat - minLat || 0.001;
    const lngRange = maxLng - minLng || 0.001;
    const scale = Math.min((size - 8) / lngRange, (size - 8) / latRange);
    const offsetX = (size - lngRange * scale) / 2;
    const offsetY = (size - latRange * scale) / 2;
    return coords
      .map(([lat, lng]) => {
        const x = (lng - minLng) * scale + offsetX;
        const y = size - ((lat - minLat) * scale + offsetY);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  } catch {
    return '';
  }
}

function TrackThumb({
  activity,
  color,
  selected,
  onClick,
  title,
}: {
  activity: Activity;
  color: string;
  selected: boolean;
  onClick: () => void;
  title?: string;
}) {
  const size = 80;
  const points = activity.summary_polyline
    ? renderTrackSVG(activity.summary_polyline, size)
    : '';
  if (!points) return null;
  const label =
    title ?? `${activity.name} — ${(activity.distance / 1000).toFixed(1)} km`;
  return (
    <div
      className={`group relative h-[72px] w-[72px] cursor-pointer rounded transition-all md:h-[80px] md:w-[80px] ${selected ? 'ring-2 ring-[var(--color-accent)] ring-offset-1 ring-offset-[var(--color-bg)]' : ''}`}
      onClick={onClick}
      title={label}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${size} ${size}`}
        className={`transition-opacity ${selected ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'}`}
      >
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={selected ? '2' : '1.5'}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function calculateBearing(start: Coordinate, end: Coordinate): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const lat1 = toRad(start[1]);
  const lon1 = toRad(start[0]);
  const lat2 = toRad(end[1]);
  const lon2 = toRad(end[0]);
  const dLon = lon2 - lon1;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function TrackMap({
  activity,
  activities,
  dark,
  lightsOff = false,
}: {
  activity: Activity | null;
  activities: Activity[];
  dark?: boolean;
  lightsOff?: boolean;
}) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const mapReady = useRef(false);
  const activityRef = useRef(activity);
  const activitiesRef = useRef(activities);
  const lightsOffRef = useRef(lightsOff);
  const animatorRef = useRef<RouteAnimator | null>(null);
  const chaseRafRef = useRef<number | null>(null);
  const chaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const styleIdleRef = useRef(false);
  const animTokenRef = useRef(0);
  const animKeyRef = useRef<string | null>(null);
  const useBlank = lightsOff || !MAPBOX_TOKEN;
  const bg = dark !== false ? '#0d1117' : '#f6f8fa';
  const style = useBlank
    ? blankMapStyle(bg)
    : mapboxBasemapStyle(dark !== false);

  const ROUTE_LAYER_IDS = new Set([
    'selected',
    'all-routes',
    'animated-run',
    'highlight-run',
    '3d-buildings',
  ]);

  const stopAnimations = () => {
    animTokenRef.current += 1;
    animatorRef.current?.stop();
    animatorRef.current = null;
    if (chaseRafRef.current != null) {
      cancelAnimationFrame(chaseRafRef.current);
      chaseRafRef.current = null;
    }
    if (chaseTimeoutRef.current != null) {
      clearTimeout(chaseTimeoutRef.current);
      chaseTimeoutRef.current = null;
    }
  };

  const isAnimating = () =>
    chaseRafRef.current != null ||
    chaseTimeoutRef.current != null ||
    animatorRef.current != null;

  const removeRouteLayers = (m: mapboxgl.Map) => {
    for (const id of [
      'selected',
      'all-routes',
      'animated-run',
      'highlight-run',
    ]) {
      if (m.getLayer(id)) m.removeLayer(id);
      if (m.getSource(id)) m.removeSource(id);
    }
  };

  const applyLightsOff = (m: mapboxgl.Map, off: boolean) => {
    const styleJson = m.getStyle();
    if (!styleJson?.layers) return;
    for (const layer of styleJson.layers) {
      if (ROUTE_LAYER_IDS.has(layer.id) || layer.id === 'background') {
        m.setLayoutProperty(layer.id, 'visibility', 'visible');
        continue;
      }
      m.setLayoutProperty(layer.id, 'visibility', off ? 'none' : 'visible');
    }
  };

  const injectTerrain = (m: mapboxgl.Map, isDark: boolean) => {
    if (lightsOffRef.current || useBlank) return;
    try {
      if (!m.getSource('mapbox-dem')) {
        m.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14,
        });
        m.setTerrain({ source: 'mapbox-dem', exaggeration: 1 });
      }
      if (!m.getLayer('3d-buildings') && m.getSource('composite')) {
        m.addLayer({
          id: '3d-buildings',
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', 'extrude', 'true'],
          type: 'fill-extrusion',
          minzoom: 14,
          paint: {
            'fill-extrusion-color': isDark ? '#1C1C1E' : '#eaeaf1',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'min_height'],
            'fill-extrusion-opacity': 0.6,
          },
        });
      }
    } catch (e) {
      console.warn('3D terrain unavailable, falling back to 2D', e);
    }
  };

  const setHighlightLine = (
    m: mapboxgl.Map,
    coords: Coordinate[],
    color: string
  ) => {
    const data = {
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: coords },
    };
    if (m.getSource('highlight-run')) {
      (m.getSource('highlight-run') as mapboxgl.GeoJSONSource).setData(data);
      return;
    }
    m.addSource('highlight-run', { type: 'geojson', data });
    m.addLayer({
      id: 'highlight-run',
      type: 'line',
      source: 'highlight-run',
      paint: {
        'line-color': color,
        'line-width': 4,
        'line-opacity': 1,
      },
    });
  };

  const setAnimatedLine = (
    m: mapboxgl.Map,
    coords: Coordinate[],
    color: string
  ) => {
    const data = {
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: coords },
    };
    if (m.getSource('animated-run')) {
      (m.getSource('animated-run') as mapboxgl.GeoJSONSource).setData(data);
      return;
    }
    m.addSource('animated-run', { type: 'geojson', data });
    m.addLayer({
      id: 'animated-run',
      type: 'line',
      source: 'animated-run',
      paint: {
        'line-color': color,
        'line-width': 3,
        'line-opacity': 0.95,
      },
    });
  };

  const startPrivacyAnimation = (
    m: mapboxgl.Map,
    coords: Coordinate[],
    color: string
  ) => {
    stopAnimations();
    setAnimatedLine(m, [coords[0]], color);
    const bounds = new mapboxgl.LngLatBounds();
    coords.forEach((c) => bounds.extend(c));
    m.easeTo({ pitch: 0, bearing: 0, duration: 200 });
    m.fitBounds(bounds, { padding: 50, maxZoom: 14, duration: 200 });
    animatorRef.current = new RouteAnimator(
      coords,
      (pts: Coordinate[]) => {
        if (pts.length > 0) setAnimatedLine(m, pts, color);
      },
      () => {
        animatorRef.current = null;
      }
    );
    animatorRef.current.start();
  };

  const startChaseAnimation = (
    m: mapboxgl.Map,
    coords: Coordinate[],
    color: string,
    distanceKm: number,
    runId: string
  ) => {
    stopAnimations();
    // Ensure 3D layers exist before pitching the camera
    injectTerrain(m, dark !== false);
    const token = animTokenRef.current;
    if (m.getLayer('all-routes')) {
      m.setPaintProperty('all-routes', 'line-opacity', 0.15);
    }

    const totalPoints = coords.length;
    const cumulative = new Float32Array(totalPoints);
    cumulative[0] = 0;
    for (let i = 1; i < totalPoints; i++) {
      const dx = coords[i][0] - coords[i - 1][0];
      const dy = coords[i][1] - coords[i - 1][1];
      cumulative[i] = cumulative[i - 1] + Math.sqrt(dx * dx + dy * dy);
    }
    const totalGeo = cumulative[totalPoints - 1] || 1;
    let currentBearing = calculateBearing(
      coords[0],
      coords[Math.min(5, totalPoints - 1)]
    );

    // ~850 m/s along-track → longer chase so tiles/buildings can catch up
    const durationMs = (((distanceKm || 5) * 1000) / 850) * 1000;
    const duration = Math.min(Math.max(6000, durationMs), 22000);
    let startTime: number | null = null;
    let chaseStarted = false;

    const animate = (timestamp: number) => {
      if (animTokenRef.current !== token) return;
      if (activeRunIdRef.current !== runId) return;
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const targetDist = progress * totalGeo;

      let l = 0;
      let r = totalPoints - 1;
      let idx = 0;
      while (l <= r) {
        const mid = (l + r) >> 1;
        if (cumulative[mid] <= targetDist) {
          idx = mid;
          l = mid + 1;
        } else {
          r = mid - 1;
        }
      }
      if (idx >= totalPoints - 1) idx = totalPoints - 2;

      const segLen = cumulative[idx + 1] - cumulative[idx];
      const remainder =
        segLen > 0 ? (targetDist - cumulative[idx]) / segLen : 0;

      if (progress < 1 && coords[idx] && coords[idx + 1]) {
        const currentPos: Coordinate = [
          coords[idx][0] + (coords[idx + 1][0] - coords[idx][0]) * remainder,
          coords[idx][1] + (coords[idx + 1][1] - coords[idx][1]) * remainder,
        ];
        const lineCoords = coords.slice(0, idx + 1);
        lineCoords.push(currentPos);
        setHighlightLine(m, lineCoords, color);

        let lookAhead = idx;
        while (
          lookAhead < totalPoints - 1 &&
          cumulative[lookAhead] < targetDist + totalGeo * 0.05
        ) {
          lookAhead++;
        }
        const targetBearing = calculateBearing(currentPos, coords[lookAhead]);
        currentBearing +=
          (((targetBearing - currentBearing + 540) % 360) - 180) * 0.05;

        m.easeTo({
          center: currentPos,
          bearing: currentBearing,
          pitch: 70,
          zoom: 16.5,
          duration: 48,
          easing: (t) => t,
        });
        chaseRafRef.current = requestAnimationFrame(animate);
      } else {
        setHighlightLine(m, coords, color);
        chaseTimeoutRef.current = setTimeout(() => {
          if (animTokenRef.current !== token) return;
          if (activeRunIdRef.current !== runId) return;
          const endCam = m.cameraForBounds(
            [
              [
                Math.min(...coords.map((p) => p[0])),
                Math.min(...coords.map((p) => p[1])),
              ],
              [
                Math.max(...coords.map((p) => p[0])),
                Math.max(...coords.map((p) => p[1])),
              ],
            ],
            { padding: 60 }
          );
          if (endCam) {
            m.easeTo({ ...endCam, pitch: 0, bearing: 0, duration: 1800 });
          }
        }, 1200);
      }
    };

    const beginChase = () => {
      if (chaseStarted || animTokenRef.current !== token) return;
      chaseStarted = true;
      if (chaseTimeoutRef.current != null) {
        clearTimeout(chaseTimeoutRef.current);
        chaseTimeoutRef.current = null;
      }
      chaseRafRef.current = requestAnimationFrame(animate);
    };

    m.flyTo({
      center: coords[0],
      bearing: currentBearing,
      pitch: 70,
      zoom: 16,
      duration: 3200,
      essential: true,
    });

    // Wait for flyTo + first idle (tiles) before chasing; fallback if idle is sticky
    m.once('moveend', () => {
      if (animTokenRef.current !== token) return;
      m.once('idle', beginChase);
      chaseTimeoutRef.current = setTimeout(beginChase, 1800);
    });
  };

  useEffect(() => {
    activityRef.current = activity;
    activitiesRef.current = activities;
    lightsOffRef.current = lightsOff;
  });

  const updateRoutesRef = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    updateRoutesRef.current = () => {
      const m = map.current;
      if (!m || !mapReady.current) return;
      const act = activityRef.current;
      const acts = activitiesRef.current;
      const privacy = lightsOffRef.current;
      const blank = lightsOffRef.current || !MAPBOX_TOKEN;

      if (act?.summary_polyline && act.summary_polyline.length > 20) {
        const runId = String(act.run_id);
        const animKey = `${runId}|${privacy ? 1 : 0}|${blank ? 1 : 0}`;
        // Avoid restarting an already-running chase for the same selection
        if (animKeyRef.current === animKey && isAnimating()) {
          return;
        }

        stopAnimations();
        removeRouteLayers(m);

        const coords = polyline
          .decode(act.summary_polyline)
          .map(([lat, lng]) => [lng, lat] as Coordinate);
        const color = getColor(act);
        activeRunIdRef.current = runId;
        animKeyRef.current = animKey;

        // Dim overview under selected route
        const features = acts
          .filter((a) => a.summary_polyline)
          .map((a) => ({
            type: 'Feature' as const,
            properties: { type: a.type, color: getColor(a) },
            geometry: {
              type: 'LineString' as const,
              coordinates: polyline
                .decode(a.summary_polyline!)
                .map(([lat, lng]) => [lng, lat]),
            },
          }));
        if (features.length) {
          m.addSource('all-routes', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features },
          });
          m.addLayer({
            id: 'all-routes',
            type: 'line',
            source: 'all-routes',
            paint: {
              'line-color': ['get', 'color'],
              'line-width': privacy ? 2 : 1.2,
              'line-opacity': privacy ? 0.35 : 0.2,
            },
          });
        }

        if (privacy || blank) {
          startPrivacyAnimation(m, coords, color);
        } else {
          startChaseAnimation(m, coords, color, act.distance / 1000, runId);
        }
        applyLightsOff(m, privacy);
        return;
      }

      animKeyRef.current = null;
      activeRunIdRef.current = null;
      stopAnimations();
      removeRouteLayers(m);

      if (m.getTerrain()) {
        try {
          m.setTerrain(null);
        } catch {
          /* ignore */
        }
      }

      const features = acts
        .filter((a) => a.summary_polyline)
        .map((a) => ({
          type: 'Feature' as const,
          properties: { type: a.type, color: getColor(a) },
          geometry: {
            type: 'LineString' as const,
            coordinates: polyline
              .decode(a.summary_polyline!)
              .map(([lat, lng]) => [lng, lat]),
          },
        }));
      if (!features.length) {
        applyLightsOff(m, privacy);
        return;
      }
      m.addSource('all-routes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
      });
      m.addLayer({
        id: 'all-routes',
        type: 'line',
        source: 'all-routes',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': privacy ? 2 : 1.2,
          'line-opacity': privacy ? 0.85 : 0.5,
        },
      });
      const allCoords = features.flatMap(
        (f) => f.geometry.coordinates as [number, number][]
      );
      if (!allCoords.length) {
        applyLightsOff(m, privacy);
        return;
      }
      const lngs = allCoords.map((c) => c[0]).sort((a, b) => a - b);
      const lats = allCoords.map((c) => c[1]).sort((a, b) => a - b);
      const t = Math.floor(lngs.length * 0.1);
      m.easeTo({ pitch: 0, bearing: 0, duration: privacy ? 200 : 600 });
      m.fitBounds(
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
      applyLightsOff(m, privacy);
    };
  });

  useEffect(() => {
    if (!mapContainer.current) return;
    if (MAPBOX_TOKEN) mapboxgl.accessToken = MAPBOX_TOKEN;

    mapReady.current = false;
    styleIdleRef.current = false;
    animKeyRef.current = null;
    stopAnimations();
    const mapInstance = new mapboxgl.Map({
      container: mapContainer.current,
      style,
      center: [108, 35],
      zoom: 3,
      pitch: 0,
      maxPitch: 85,
      attributionControl: !useBlank,
    });
    map.current = mapInstance;
    mapInstance.addControl(new mapboxgl.NavigationControl(), 'top-right');

    let timedOut = false;
    let styleSettled = false;
    const timer = window.setTimeout(() => {
      if (
        timedOut ||
        styleSettled ||
        !map.current ||
        map.current !== mapInstance
      )
        return;
      if (mapInstance.isStyleLoaded()) return;
      timedOut = true;
      console.warn(
        'Track map style load timed out; falling back to blank basemap'
      );
      mapInstance.setStyle(blankMapStyle(bg));
    }, MAP_STYLE_LOAD_TIMEOUT_MS);

    mapInstance.on('style.load', () => {
      if (map.current !== mapInstance) return;
      // First successful style.load cancels blank fallback so we don't
      // tear down a working basemap (and 3D buildings) mid-animation.
      if (!timedOut) {
        styleSettled = true;
        window.clearTimeout(timer);
      }
      mapReady.current = true;
      styleIdleRef.current = false;
      mapInstance.once('idle', () => {
        if (map.current !== mapInstance) return;
        styleIdleRef.current = true;
        injectTerrain(mapInstance, dark !== false);
        updateRoutesRef.current();
      });
    });

    return () => {
      window.clearTimeout(timer);
      stopAnimations();
      mapInstance.remove();
      if (map.current === mapInstance) {
        map.current = null;
      }
      mapReady.current = false;
      styleIdleRef.current = false;
      animKeyRef.current = null;
    };
  }, [dark, useBlank]);

  useEffect(() => {
    if (mapReady.current && styleIdleRef.current) {
      updateRoutesRef.current();
    }
  }, [activity, activities]);

  useEffect(() => {
    if (!map.current?.isStyleLoaded()) return;
    applyLightsOff(map.current, lightsOff);
    if (map.current.getLayer('all-routes') && !activityRef.current) {
      map.current.setPaintProperty(
        'all-routes',
        'line-width',
        lightsOff ? 2 : 1.2
      );
      map.current.setPaintProperty(
        'all-routes',
        'line-opacity',
        lightsOff ? 0.85 : 0.5
      );
    }
  }, [lightsOff]);

  return (
    <div
      className="route-map-hover-ctrls h-full w-full"
      style={lightsOff || useBlank ? { backgroundColor: bg } : undefined}
    >
      <div ref={mapContainer} className="h-full w-full" />
    </div>
  );
}

function getColor(a: Activity): string {
  if (a.type === 'Run') {
    const km = a.distance / 1000;
    return km > 20 ? '#ef4444' : '#f97316';
  }
  if (a.type === 'Ride') return '#3b82f6';
  if (a.type === 'Hike') return '#22c55e';
  return '#a855f7';
}

export function TracksPage({
  activities,
  onBack,
  onSelectActivity,
  getTitle,
  lightsOff = false,
  dark = true,
}: TracksPageProps) {
  const { locale } = useLocale();
  const allYears = getAvailableYears(activities);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [sportFilter, setSportFilter] = useState<SportType | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(
    null
  );
  const [sortBy, setSortBy] = useState<'date' | 'distance'>('date');

  // Export
  const captureRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  // Year pagination
  const MAX_YEARS = 10;
  const [yearPage, setYearPage] = useState(0);
  const totalYearPages = Math.ceil(allYears.length / MAX_YEARS);
  const visibleYears = allYears.slice(
    yearPage * MAX_YEARS,
    yearPage * MAX_YEARS + MAX_YEARS
  );

  // Determine which sport types exist
  const hasSport = (t: SportType) => activities.some((a) => a.type === t);

  // Filtered base (year + sport)
  const base = activities.filter((a) => {
    if (
      selectedYear !== null &&
      new Date(a.start_date_local).getFullYear() !== selectedYear
    )
      return false;
    if (sportFilter !== null && a.type !== sportFilter) return false;
    return true;
  });

  const withPolyline = base.filter(
    (a) => a.summary_polyline && a.summary_polyline.length > 20
  );

  // Stats for left panel
  const totalDist = base.reduce((s, a) => s + a.distance, 0);
  const totalTime = base.reduce(
    (s, a) => s + parseMovingTime(a.moving_time),
    0
  );
  const runs = base.filter((a) => a.type === 'Run' && a.average_speed > 0);
  const avgPace =
    runs.length > 0
      ? runs.reduce((s, a) => s + a.average_speed, 0) / runs.length
      : 0;

  // Cluster tracks — defer heavy work
  type Cluster = { representative: Activity; count: number; color: string };
  const [clusteredTracks, setClusteredTracks] = useState<Cluster[]>([]);
  const [clustering, setClustering] = useState(true);

  useEffect(() => {
    setClustering(true);
    const id = setTimeout(() => {
      const acts = [...withPolyline].sort(
        (a, b) =>
          new Date(b.start_date_local).getTime() -
          new Date(a.start_date_local).getTime()
      );
      type Decoded = {
        start: [number, number];
        end: [number, number];
        distBucket: number;
      };
      const decoded: (Decoded | null)[] = acts.map((a) => {
        try {
          const coords = polyline.decode(a.summary_polyline!);
          if (coords.length < 2) return null;
          return {
            start: coords[0] as [number, number],
            end: coords[coords.length - 1] as [number, number],
            distBucket: Math.round(a.distance / 2000),
          };
        } catch {
          return null;
        }
      });
      const clusters: Cluster[] = [];
      const used = new Set<number>();
      for (let i = 0; i < acts.length; i++) {
        if (used.has(i)) continue;
        const di = decoded[i];
        if (!di) continue;
        let count = 1;
        for (let j = i + 1; j < acts.length; j++) {
          if (used.has(j)) continue;
          const dj = decoded[j];
          if (!dj || di.distBucket !== dj.distBucket) continue;
          const startClose =
            Math.abs(di.start[0] - dj.start[0]) < 0.005 &&
            Math.abs(di.start[1] - dj.start[1]) < 0.005;
          const endClose =
            Math.abs(di.end[0] - dj.end[0]) < 0.005 &&
            Math.abs(di.end[1] - dj.end[1]) < 0.005;
          if (startClose && endClose) {
            used.add(j);
            count++;
          }
        }
        used.add(i);
        clusters.push({
          representative: acts[i],
          count,
          color: getColor(acts[i]),
        });
      }
      setClusteredTracks(clusters);
      setClustering(false);
    }, 0);
    return () => clearTimeout(id);
  }, [withPolyline.length, selectedYear, sportFilter]);

  const handleSelectTrack = (a: Activity) => {
    setSelectedActivity((prev) => (prev?.run_id === a.run_id ? null : a));
    onSelectActivity?.(a);
  };

  const allSportTabs: { label: string; value: SportType; color: string }[] = [
    { label: locale === 'zh' ? '跑步' : 'Run', value: 'Run', color: '#f97316' },
  ];

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-6">
      {/* Top bar: back + title */}
      <div className="mb-5 flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex shrink-0 items-center gap-1.5 text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)]"
        >
          <svg
            className="h-4 w-4"
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
          {locale === 'zh' ? '返回' : 'Back'}
        </button>
        <h1 className="shrink-0 text-lg font-bold">
          {locale === 'zh' ? '轨迹墙' : 'Track Wall'}
        </h1>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[340px_1fr]">
        {/* Mobile: contents so map can sticky while track wall scrolls.
            Desktop: stacked left column. */}
        <div className="contents lg:flex lg:flex-col lg:gap-4">
          {/* Stats card */}
          <div className="order-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 lg:order-none">
            <p className="mb-3 text-[10px] tracking-wider text-[var(--color-muted)] uppercase">
              {selectedYear ?? (locale === 'zh' ? '全部' : 'Total')}
            </p>
            <div className="space-y-3">
              <div>
                <p className="text-[10px] tracking-wider text-[var(--color-muted)] uppercase">
                  {locale === 'zh' ? '活动' : 'Activities'}
                </p>
                <p className="font-mono text-2xl font-bold text-[var(--color-accent)]">
                  {base.length}
                </p>
              </div>
              <div>
                <p className="text-[10px] tracking-wider text-[var(--color-muted)] uppercase">
                  {locale === 'zh' ? '距离' : 'Distance'}
                </p>
                <p className="font-mono text-2xl font-bold">
                  {formatDistance(totalDist)}{' '}
                  <span className="text-sm font-normal text-[var(--color-muted)]">
                    km
                  </span>
                </p>
              </div>
              <div>
                <p className="text-[10px] tracking-wider text-[var(--color-muted)] uppercase">
                  {locale === 'zh' ? '时间' : 'Time'}
                </p>
                <p className="font-mono text-lg font-bold">
                  {Math.floor(totalTime / 3600)}h{' '}
                  {Math.floor((totalTime % 3600) / 60)}m
                </p>
              </div>
              {avgPace > 0 && (
                <div>
                  <p className="text-[10px] tracking-wider text-[var(--color-muted)] uppercase">
                    {locale === 'zh' ? '均配速' : 'Avg Pace'}
                  </p>
                  <p className="font-mono text-lg font-bold">
                    {formatPace(avgPace)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Activity detail — only when a single track is selected */}
          {selectedActivity && (
            <div className="order-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 lg:order-none">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[10px] tracking-wider text-[var(--color-muted)] uppercase">
                  {locale === 'zh' ? '已选记录' : 'Selected'}
                </p>
                <button
                  onClick={() => setSelectedActivity(null)}
                  className="text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)]"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              <p className="mb-0.5 truncate text-xs font-semibold">
                {getTitle ? getTitle(selectedActivity) : selectedActivity.name}
              </p>
              <p className="mb-2 text-[10px] text-[var(--color-muted)]">
                {new Date(selectedActivity.start_date_local).toLocaleDateString(
                  locale === 'zh' ? 'zh-CN' : 'en-US',
                  { year: 'numeric', month: 'short', day: 'numeric' }
                )}{' '}
                {new Date(selectedActivity.start_date_local).toLocaleTimeString(
                  locale === 'zh' ? 'zh-CN' : 'en-US',
                  { hour: '2-digit', minute: '2-digit' }
                )}
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <p className="text-[9px] tracking-wider text-[var(--color-muted)] uppercase">
                    {locale === 'zh' ? '距离' : 'Distance'}
                  </p>
                  <p className="font-mono text-base leading-tight font-bold">
                    {(selectedActivity.distance / 1000).toFixed(2)}{' '}
                    <span className="text-[10px] font-normal text-[var(--color-muted)]">
                      km
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-[9px] tracking-wider text-[var(--color-muted)] uppercase">
                    {locale === 'zh' ? '时间' : 'Time'}
                  </p>
                  <p className="font-mono text-base leading-tight font-bold">
                    {(() => {
                      const s = parseMovingTime(selectedActivity.moving_time);
                      return `${Math.floor(s / 3600) ? Math.floor(s / 3600) + 'h ' : ''}${Math.floor((s % 3600) / 60)}m`;
                    })()}
                  </p>
                </div>
                {selectedActivity.average_speed > 0 && (
                  <div>
                    <p className="text-[9px] tracking-wider text-[var(--color-muted)] uppercase">
                      {locale === 'zh' ? '配速' : 'Pace'}
                    </p>
                    <p className="font-mono text-base leading-tight font-bold">
                      {formatPace(selectedActivity.average_speed)}{' '}
                      <span className="text-[10px] font-normal text-[var(--color-muted)]">
                        /km
                      </span>
                    </p>
                  </div>
                )}
                {selectedActivity.elevation_gain != null &&
                  selectedActivity.elevation_gain > 0 && (
                    <div>
                      <p className="text-[9px] tracking-wider text-[var(--color-muted)] uppercase">
                        {locale === 'zh' ? '爬升' : 'Elev'}
                      </p>
                      <p className="font-mono text-base leading-tight font-bold">
                        {Math.round(selectedActivity.elevation_gain)}{' '}
                        <span className="text-[10px] font-normal text-[var(--color-muted)]">
                          m
                        </span>
                      </p>
                    </div>
                  )}
                {selectedActivity.average_heartrate != null &&
                  selectedActivity.average_heartrate > 0 && (
                    <div>
                      <p className="text-[9px] tracking-wider text-[var(--color-muted)] uppercase">
                        {locale === 'zh' ? '心率' : 'HR'}
                      </p>
                      <p className="font-mono text-base leading-tight font-bold">
                        {Math.round(selectedActivity.average_heartrate)}{' '}
                        <span className="text-[10px] font-normal text-[var(--color-muted)]">
                          bpm
                        </span>
                      </p>
                    </div>
                  )}
              </div>
            </div>
          )}

          {/* Map — sticky on mobile while browsing the track wall */}
          <div className="sticky top-16 z-40 order-2 -my-2 py-2 lg:static lg:z-auto lg:order-none lg:my-0 lg:py-0">
            <div className="h-[220px] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-md md:h-[360px] lg:shadow-none">
              <TrackMap
                activity={selectedActivity}
                activities={withPolyline}
                dark={dark}
                lightsOff={lightsOff}
              />
            </div>
          </div>
        </div>

        {/* Right: track grid with year filter inside */}
        <div className="order-4 min-w-0 lg:order-none">
          <div
            ref={captureRef}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4"
          >
            {/* Year pills + sport filter */}
            <div className="mb-4 flex flex-wrap items-center gap-1.5 border-b border-[var(--color-border)] pb-3">
              {totalYearPages > 1 && (
                <button
                  onClick={() => setYearPage((p) => Math.max(0, p - 1))}
                  disabled={yearPage === 0}
                  className="px-1 text-base leading-none text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)] disabled:opacity-30"
                >
                  ‹
                </button>
              )}
              <button
                onClick={() => setSelectedYear(null)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${selectedYear === null ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}
              >
                {locale === 'zh' ? '全部' : 'All'}
              </button>
              {visibleYears.map((yr) => (
                <button
                  key={yr}
                  onClick={() =>
                    setSelectedYear(selectedYear === yr ? null : yr)
                  }
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${selectedYear === yr ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}
                >
                  {yr}
                </button>
              ))}
              {totalYearPages > 1 && (
                <button
                  onClick={() =>
                    setYearPage((p) => Math.min(totalYearPages - 1, p + 1))
                  }
                  disabled={yearPage === totalYearPages - 1}
                  className="px-1 text-base leading-none text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)] disabled:opacity-30"
                >
                  ›
                </button>
              )}
              {/* Sport filter — wraps under years on narrow screens */}
              <div className="flex w-full items-center gap-1.5 sm:ml-auto sm:w-auto">
                <button
                  onClick={() => setSportFilter(null)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${sportFilter === null ? 'border-transparent bg-[var(--color-accent)] text-white' : 'border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}
                >
                  {locale === 'zh' ? '全部' : 'All'}
                </button>
                {allSportTabs
                  .filter((t) => hasSport(t.value))
                  .map(({ label, value, color }) => (
                    <button
                      key={value}
                      onClick={() =>
                        setSportFilter(sportFilter === value ? null : value)
                      }
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${sportFilter === value ? 'border-transparent text-white' : 'border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}
                      style={
                        sportFilter === value ? { backgroundColor: color } : {}
                      }
                    >
                      {label}
                    </button>
                  ))}
                <span className="mx-1 h-3 w-px bg-[var(--color-border)]" />
                <button
                  onClick={async () => {
                    if (!captureRef.current || exporting) return;
                    setExporting(true);
                    try {
                      const el = captureRef.current;
                      const prevOverflow = el.style.overflow;
                      el.style.overflow = 'visible';
                      await new Promise((resolve) =>
                        requestAnimationFrame(resolve)
                      );
                      const dataUrl = await toPng(el, {
                        pixelRatio: 2,
                        cacheBust: true,
                      });
                      el.style.overflow = prevOverflow;
                      const link = document.createElement('a');
                      const label = selectedYear ?? 'all';
                      link.download = `tracks-${label}.png`;
                      link.href = dataUrl;
                      link.click();
                    } catch (err) {
                      console.error('Export failed:', err);
                    } finally {
                      setExporting(false);
                    }
                  }}
                  disabled={exporting}
                  className="flex h-6 w-6 items-center justify-center rounded text-[var(--color-muted)] transition-all hover:text-[var(--color-text)] disabled:opacity-50"
                  title={locale === 'zh' ? '导出图片' : 'Export as image'}
                >
                  {exporting ? (
                    <svg
                      className="h-3.5 w-3.5 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {clustering ? (
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: 40 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-[72px] w-[72px] animate-pulse rounded bg-[var(--color-border)] md:h-[80px] md:w-[80px]"
                    style={{ animationDelay: `${i * 20}ms` }}
                  />
                ))}
              </div>
            ) : clusteredTracks.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--color-muted)]">
                {locale === 'zh' ? '暂无轨迹数据' : 'No tracks found'}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {[...clusteredTracks]
                  .sort((a, b) =>
                    sortBy === 'distance'
                      ? b.representative.distance - a.representative.distance
                      : new Date(b.representative.start_date_local).getTime() -
                        new Date(a.representative.start_date_local).getTime()
                  )
                  .map(({ representative: a, count, color }) => (
                    <div key={a.run_id} className="relative">
                      <TrackThumb
                        activity={a}
                        color={color}
                        selected={selectedActivity?.run_id === a.run_id}
                        onClick={() => handleSelectTrack(a)}
                        title={
                          getTitle
                            ? `${getTitle(a)} — ${(a.distance / 1000).toFixed(1)} km`
                            : undefined
                        }
                      />
                      {count > 1 && (
                        <span className="pointer-events-none absolute right-1 bottom-1 rounded bg-[var(--color-bg)]/80 px-1 py-0.5 text-[9px] leading-none font-bold text-[var(--color-muted)]">
                          ×{count}
                        </span>
                      )}
                    </div>
                  ))}
              </div>
            )}

            {/* Legend + sort */}
            {!clustering && clusteredTracks.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-muted)]">
                {sportFilter === null || sportFilter === 'Run' ? (
                  <>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-0.5 w-3 rounded bg-[#f97316]" />
                      {locale === 'zh' ? '跑步' : 'Run'}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-0.5 w-3 rounded bg-[#ef4444]" />
                      {locale === 'zh' ? '跑步 >20km' : 'Run >20km'}
                    </span>
                  </>
                ) : null}
                {null}
                {null}
                <div className="ml-auto flex items-center gap-1">
                  <span>
                    {clusteredTracks.length}{' '}
                    {locale === 'zh' ? '条路线' : 'routes'}
                  </span>
                  <span className="mx-1.5 text-[var(--color-border)]">·</span>
                  <button
                    onClick={() => setSortBy('date')}
                    className={`transition-colors ${sortBy === 'date' ? 'font-medium text-[var(--color-text)]' : 'hover:text-[var(--color-text)]'}`}
                  >
                    {locale === 'zh' ? '时间' : 'Date'}
                  </button>
                  <span className="text-[var(--color-border)]">/</span>
                  <button
                    onClick={() => setSortBy('distance')}
                    className={`transition-colors ${sortBy === 'distance' ? 'font-medium text-[var(--color-text)]' : 'hover:text-[var(--color-text)]'}`}
                  >
                    {locale === 'zh' ? '距离' : 'Dist'}
                  </button>
                </div>
              </div>
            )}
          </div>
          {/* end track grid card */}
        </div>
        {/* end right column */}
      </div>
    </div>
  );
}
