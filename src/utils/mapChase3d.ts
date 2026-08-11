import type mapboxgl from 'mapbox-gl';
import type { Coordinate } from './routeAnimation';

export function calculateBearing(start: Coordinate, end: Coordinate): number {
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

/** Terrain DEM + extruded buildings for chase camera. No-op if style lacks sources. */
export function injectMapTerrain(
  m: mapboxgl.Map,
  isDark: boolean,
  enabled = true
): void {
  if (!enabled) return;
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
}

export function clearMapTerrain(m: mapboxgl.Map): void {
  if (m.getLayer('3d-buildings')) {
    try {
      m.removeLayer('3d-buildings');
    } catch {
      /* ignore */
    }
  }
  if (m.getTerrain()) {
    try {
      m.setTerrain(null);
    } catch {
      /* ignore */
    }
  }
}

const HIGHLIGHT_SOURCE = 'chase-highlight';
const HIGHLIGHT_LAYER = 'chase-highlight';

export function setChaseHighlightLine(
  m: mapboxgl.Map,
  coords: Coordinate[],
  color: string
): void {
  const data = {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates: coords },
  };
  if (m.getSource(HIGHLIGHT_SOURCE)) {
    (m.getSource(HIGHLIGHT_SOURCE) as mapboxgl.GeoJSONSource).setData(data);
    return;
  }
  m.addSource(HIGHLIGHT_SOURCE, { type: 'geojson', data });
  m.addLayer({
    id: HIGHLIGHT_LAYER,
    type: 'line',
    source: HIGHLIGHT_SOURCE,
    paint: {
      'line-color': color,
      'line-width': 4,
      'line-opacity': 1,
    },
  });
}

export function removeChaseHighlight(m: mapboxgl.Map): void {
  if (m.getLayer(HIGHLIGHT_LAYER)) m.removeLayer(HIGHLIGHT_LAYER);
  if (m.getSource(HIGHLIGHT_SOURCE)) m.removeSource(HIGHLIGHT_SOURCE);
}

export const CHASE_LAYER_IDS = new Set([HIGHLIGHT_LAYER, '3d-buildings']);

type ChaseCallbacks = {
  onStart?: () => void;
  onEnd?: () => void;
};

type ChaseStartArgs = {
  map: mapboxgl.Map;
  coords: Coordinate[];
  color: string;
  distanceKm: number;
  runId: string;
  isDark: boolean;
  /** Dim overview layer while chasing (e.g. all-routes / routes). */
  overviewLayerId?: string;
  overviewDimOpacity?: number;
};

/**
 * Imperative 3D chase controller shared by TrackMap / RouteMap.
 * Call stop() on unmount, selection clear, or style teardown.
 */
export function createMapChaseController() {
  let animToken = 0;
  let chaseRaf: number | null = null;
  let chaseTimeout: ReturnType<typeof setTimeout> | null = null;
  let activeRunId: string | null = null;
  let running = false;
  let callbacks: ChaseCallbacks = {};

  const stop = (opts?: { silent?: boolean }) => {
    animToken += 1;
    if (chaseRaf != null) {
      cancelAnimationFrame(chaseRaf);
      chaseRaf = null;
    }
    if (chaseTimeout != null) {
      clearTimeout(chaseTimeout);
      chaseTimeout = null;
    }
    const wasRunning = running;
    running = false;
    activeRunId = null;
    if (wasRunning && !opts?.silent) callbacks.onEnd?.();
  };

  const isAnimating = () => running;

  const start = (args: ChaseStartArgs, cb: ChaseCallbacks = {}) => {
    const {
      map: m,
      coords,
      color,
      distanceKm,
      runId,
      isDark,
      overviewLayerId,
      overviewDimOpacity = 0.15,
    } = args;

    stop({ silent: true });
    callbacks = cb;
    injectMapTerrain(m, isDark, true);
    animToken += 1;
    const token = animToken;
    activeRunId = runId;
    running = true;
    callbacks.onStart?.();

    if (overviewLayerId && m.getLayer(overviewLayerId)) {
      m.setPaintProperty(overviewLayerId, 'line-opacity', overviewDimOpacity);
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

    const durationMs = (((distanceKm || 5) * 1000) / 850) * 1000;
    const duration = Math.min(Math.max(6000, durationMs), 22000);
    let startTime: number | null = null;
    let chaseStarted = false;

    const finishRunning = () => {
      if (animToken !== token) return;
      running = false;
      callbacks.onEnd?.();
    };

    const animate = (timestamp: number) => {
      if (animToken !== token) return;
      if (activeRunId !== runId) return;
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
        setChaseHighlightLine(m, lineCoords, color);

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
        chaseRaf = requestAnimationFrame(animate);
      } else {
        setChaseHighlightLine(m, coords, color);
        chaseTimeout = setTimeout(() => {
          if (animToken !== token) return;
          if (activeRunId !== runId) return;
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
          chaseRaf = null;
          chaseTimeout = null;
          finishRunning();
        }, 1200);
      }
    };

    const beginChase = () => {
      if (chaseStarted || animToken !== token) return;
      chaseStarted = true;
      if (chaseTimeout != null) {
        clearTimeout(chaseTimeout);
        chaseTimeout = null;
      }
      chaseRaf = requestAnimationFrame(animate);
    };

    setChaseHighlightLine(m, [coords[0]], color);

    m.flyTo({
      center: coords[0],
      bearing: currentBearing,
      pitch: 70,
      zoom: 16,
      duration: 3200,
      essential: true,
    });

    m.once('moveend', () => {
      if (animToken !== token) return;
      m.once('idle', beginChase);
      chaseTimeout = setTimeout(beginChase, 1800);
    });
  };

  return { start, stop, isAnimating };
}

export type MapChaseController = ReturnType<typeof createMapChaseController>;

export function createPlaneTakeoffSvgEl(size = 20): SVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.display = 'block';

  const p1 = document.createElementNS(ns, 'path');
  p1.setAttribute('d', 'M2 22h20');
  const p2 = document.createElementNS(ns, 'path');
  p2.setAttribute(
    'd',
    'M6.36 17.4 4 17l-2-4 1.1-.55a2 2 0 0 1 1.8 0l.17.1a2 2 0 0 0 1.8 0L8 12 5 6l.9-.45a2 2 0 0 1 2.09.2l4.02 3a2 2 0 0 0 2.1.2l4.19-2.06a2.41 2.41 0 0 1 1.73-.17L21 7a1.4 1.4 0 0 1 .87 1.99l-.38.76c-.23.46-.6.84-1.07 1.08L7.58 17.2a2 2 0 0 1-1.22.18Z'
  );

  svg.appendChild(p1);
  svg.appendChild(p2);
  return svg;
}

export function createChaseControlButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'route-map-3d-btn';

  const iconWrap = document.createElement('span');
  iconWrap.className = 'mapboxgl-ctrl-icon';
  iconWrap.setAttribute('aria-hidden', 'true');
  iconWrap.appendChild(createPlaneTakeoffSvgEl(20));
  btn.appendChild(iconWrap);

  return btn;
}

export function updateChaseControlButton(
  btn: HTMLButtonElement,
  state: { visible: boolean; chasing: boolean; title: string; dark?: boolean }
): void {
  btn.classList.toggle('is-hidden', !state.visible);
  btn.classList.toggle('is-chasing', state.chasing);
  btn.title = state.title;
  if (state.chasing) {
    btn.style.removeProperty('color');
  } else {
    btn.style.color =
      state.dark !== false ? '#f9fafb' : 'var(--color-text, #e5e7eb)';
  }
}
