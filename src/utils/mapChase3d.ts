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

/**
 * Terrain DEM + extruded buildings. Only for Mapbox streets styles that expose
 * the `composite` source. CARTO / blank styles skip this so a missing DEM
 * token cannot black out the canvas; pitch/orbit still work.
 */
export function injectMapTerrain(
  m: mapboxgl.Map,
  isDark: boolean,
  enabled = true
): void {
  if (!enabled) return;
  try {
    if (!m.getSource('composite')) return;
    if (!m.getSource('mapbox-dem')) {
      m.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14,
      });
    }
    if (!m.getTerrain()) {
      m.setTerrain({ source: 'mapbox-dem', exaggeration: 1.45 });
    }
    if (!m.getLayer('3d-buildings')) {
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

/** In-place orbit around a fitted track (koobai / upstairs pattern).
 * Pitch/zoom tuned so terrain + buildings read as 3D without hugging the ground.
 */
export const ORBIT_PITCH = 75;
export const ORBIT_PITCH_WOBBLE = 3;
export const ORBIT_ZOOM_WOBBLE = 0.2;
export const ORBIT_DURATION_MS = 36000;
export const ORBIT_FIT_PADDING = 28;
export const ORBIT_FIT_MAX_ZOOM = 17;

function coordsExtent(
  coords: Coordinate[]
): [[number, number], [number, number]] | null {
  if (coords.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of coords) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [
    [minX, minY],
    [maxX, maxY],
  ];
}

type OrbitStartArgs = {
  map: mapboxgl.Map;
  coords: Coordinate[];
  isDark: boolean;
};

/**
 * Fits the track, pitches to ~75°, then slowly spins in place.
 * Pointer / wheel / drag / zoom-control cancels the spin and leaves the pitched camera.
 */
export function createMapOrbitController() {
  let animToken = 0;
  let raf: number | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let map: mapboxgl.Map | null = null;

  const stop = (opts?: { keepCameraMotion?: boolean }) => {
    animToken += 1;
    if (raf != null) {
      cancelAnimationFrame(raf);
      raf = null;
    }
    if (timeout != null) {
      clearTimeout(timeout);
      timeout = null;
    }
    // NavigationControl zoomIn/Out starts an easeTo that shares this path via
    // zoomstart+originalEvent; map.stop() would cancel that ease mid-flight.
    if (running && !opts?.keepCameraMotion) map?.stop();
    running = false;
  };

  /** Pointer / wheel / drag: cancel orbit (same as before). */
  const handleUserInput = (event: { originalEvent?: Event }) => {
    if (!running || !event.originalEvent) return;
    stop();
  };

  /**
   * Zoom +/- buttons call map.zoomIn/Out({}, { originalEvent }), which never
   * hits map mousedown/wheel. Listen on zoomstart and soft-stop so the ease
   * continues (wheel already stops via the wheel listener above).
   */
  const handleUserZoom = (event: { originalEvent?: Event }) => {
    if (!running || !event.originalEvent) return;
    stop({ keepCameraMotion: true });
  };

  const detach = () => {
    if (!map) return;
    map.off('mousedown', handleUserInput);
    map.off('touchstart', handleUserInput);
    map.off('wheel', handleUserInput);
    map.off('dragstart', handleUserInput);
    map.off('zoomstart', handleUserZoom);
  };

  const attach = (next: mapboxgl.Map) => {
    if (map === next) return;
    detach();
    map = next;
    next.on('mousedown', handleUserInput);
    next.on('touchstart', handleUserInput);
    next.on('wheel', handleUserInput);
    next.on('dragstart', handleUserInput);
    next.on('zoomstart', handleUserZoom);
  };

  const start = ({ map: m, coords, isDark }: OrbitStartArgs) => {
    stop();
    const extent = coordsExtent(coords);
    if (!extent) return;

    attach(m);
    injectMapTerrain(m, isDark, true);
    animToken += 1;
    const token = animToken;
    running = true;

    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cam = m.cameraForBounds(extent, {
      padding: ORBIT_FIT_PADDING,
      maxZoom: ORBIT_FIT_MAX_ZOOM,
      pitch: ORBIT_PITCH,
    });
    const center = cam?.center ?? [
      (extent[0][0] + extent[1][0]) / 2,
      (extent[0][1] + extent[1][1]) / 2,
    ];
    const zoom = cam?.zoom ?? m.getZoom();
    let spinStarted = false;

    const beginSpin = () => {
      if (spinStarted || animToken !== token) return;
      spinStarted = true;
      if (timeout != null) {
        clearTimeout(timeout);
        timeout = null;
      }
      if (reduce) {
        running = false;
        return;
      }
      const spinCenter = m.getCenter();
      const baseZoom = m.getZoom();
      const baseBearing = m.getBearing();
      const startTs = performance.now();
      const tick = (ts: number) => {
        if (animToken !== token) return;
        const turn = ((ts - startTs) / ORBIT_DURATION_MS) % 1;
        m.jumpTo({
          center: spinCenter,
          bearing: (baseBearing + turn * 360) % 360,
          pitch:
            ORBIT_PITCH + ORBIT_PITCH_WOBBLE * Math.sin(turn * Math.PI * 2),
          zoom: baseZoom + ORBIT_ZOOM_WOBBLE * Math.sin(turn * Math.PI * 4),
        });
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    m.easeTo({
      center,
      zoom,
      pitch: ORBIT_PITCH,
      duration: reduce ? 200 : 1200,
      essential: true,
    });
    m.once('moveend', beginSpin);
    timeout = setTimeout(beginSpin, reduce ? 280 : 1600);
  };

  const dispose = () => {
    stop();
    detach();
    map = null;
  };

  return {
    start,
    stop,
    dispose,
    isAnimating: () => running,
  };
}

export type MapOrbitController = ReturnType<typeof createMapOrbitController>;

export function isMapFullscreen(map: mapboxgl.Map | null): boolean {
  if (!map || typeof document === 'undefined') return false;
  const doc = document as Document & { webkitFullscreenElement?: Element };
  const fs = document.fullscreenElement ?? doc.webkitFullscreenElement;
  if (!fs) return false;
  const root = map.getContainer();
  return fs === root || root.contains(fs) || fs.contains(root);
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
    geometry: {
      type: 'LineString' as const,
      coordinates: coords.length >= 2 ? coords : [],
    },
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
  /**
   * Camera after the chase finishes. Read at end time so a 3D toggle during
   * playback can return to orbit (`keep`) instead of flattening.
   */
  getEndView?: () => 'flat' | 'keep';
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
      getEndView,
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
          pitch: 75,
          zoom: 17,
          duration: 48,
          easing: (t) => t,
        });
        chaseRaf = requestAnimationFrame(animate);
      } else {
        setChaseHighlightLine(m, coords, color);
        chaseTimeout = setTimeout(() => {
          if (animToken !== token) return;
          if (activeRunId !== runId) return;
          const endView = getEndView?.() ?? 'flat';
          if (endView === 'flat') {
            const extent = coordsExtent(coords);
            const endCam = extent
              ? m.cameraForBounds(extent, { padding: 60 })
              : null;
            if (endCam) {
              m.easeTo({ ...endCam, pitch: 0, bearing: 0, duration: 1800 });
            }
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

    setChaseHighlightLine(m, [], color);

    m.flyTo({
      center: coords[0],
      bearing: currentBearing,
      pitch: 75,
      zoom: 16.5,
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

function createStrokeSvg(size: number, paths: string[]): SVGElement {
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
  for (const d of paths) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

/** Lucide route - path-follow / cruise glyph (inline; no lucide dependency). */
export function createRouteSvgEl(size = 16): SVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = createStrokeSvg(size, [
    'M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15',
  ]);
  for (const [cx, cy, r] of [
    [6, 19, 3],
    [18, 5, 3],
  ] as const) {
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', String(cx));
    circle.setAttribute('cy', String(cy));
    circle.setAttribute('r', String(r));
    svg.insertBefore(circle, svg.firstChild);
  }
  return svg;
}

/** Mapbox-native square control button chrome (zoom / compass siblings). */
function createCtrlIconButton(className: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  const icon = document.createElement('span');
  icon.className = 'mapboxgl-ctrl-icon';
  icon.setAttribute('aria-hidden', 'true');
  btn.appendChild(icon);
  return btn;
}

export function createChaseControlButton(): HTMLButtonElement {
  const btn = createCtrlIconButton('route-map-cruise-btn');
  const icon = btn.querySelector('.mapboxgl-ctrl-icon');
  if (icon) icon.appendChild(createRouteSvgEl(16));
  return btn;
}

export function updateChaseControlButton(
  btn: HTMLButtonElement,
  state: { visible: boolean; chasing: boolean; title: string }
): void {
  btn.classList.toggle('is-hidden', !state.visible);
  btn.classList.toggle('is-chasing', state.chasing);
  btn.title = state.title;
  btn.setAttribute('aria-label', state.title);
}

export function create3dToggleButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'route-map-3d-btn';
  btn.textContent = '3D';
  return btn;
}

export function update3dToggleButton(
  btn: HTMLButtonElement,
  state: { visible: boolean; active: boolean; title: string }
): void {
  btn.classList.toggle('is-hidden', !state.visible);
  btn.classList.toggle('is-active', state.active);
  btn.setAttribute('aria-pressed', state.active ? 'true' : 'false');
  btn.title = state.title;
  btn.setAttribute('aria-label', state.title);
}

export function createFullscreenButton(): HTMLButtonElement {
  // Classes reuse Mapbox's fullscreen / shrink icon background-images.
  return createCtrlIconButton(
    'mapboxgl-ctrl-fullscreen route-map-fullscreen-btn'
  );
}

export function updateFullscreenButton(
  btn: HTMLButtonElement,
  state: { visible: boolean; active: boolean; title: string }
): void {
  btn.classList.toggle('is-hidden', !state.visible);
  btn.classList.toggle('mapboxgl-ctrl-fullscreen', !state.active);
  btn.classList.toggle('mapboxgl-ctrl-shrink', state.active);
  btn.title = state.title;
  btn.setAttribute('aria-label', state.title);
  btn.setAttribute('aria-pressed', state.active ? 'true' : 'false');
}

export function toggleMapFullscreen(map: mapboxgl.Map): void {
  const root = map.getContainer();
  const doc = document as Document & {
    webkitFullscreenElement?: Element;
    webkitExitFullscreen?: () => void;
  };
  if (isMapFullscreen(map)) {
    if (document.exitFullscreen) void document.exitFullscreen();
    else doc.webkitExitFullscreen?.();
    return;
  }
  const el = root as HTMLElement & { webkitRequestFullscreen?: () => void };
  if (root.requestFullscreen) void root.requestFullscreen();
  else el.webkitRequestFullscreen?.();
}

export type MapModeControlHandles = {
  d3Button: HTMLButtonElement | null;
  fullscreenButton: HTMLButtonElement | null;
  chaseButton: HTMLButtonElement | null;
};

/**
 * Append 3D / cruise / fullscreen into the NavigationControl
 * `.mapboxgl-ctrl-group` (one Mapbox vertical stack; cruise above fullscreen).
 * Call after `addControl(new NavigationControl())`. Falls back to its own group.
 */
export function attachMapModeButtons(
  map: mapboxgl.Map,
  opts: {
    onToggle3d: () => void;
    onToggleChase: () => void;
  },
  handles: MapModeControlHandles
): () => void {
  const topRight = map.getContainer().querySelector('.mapboxgl-ctrl-top-right');
  let group = topRight?.querySelector(
    '.mapboxgl-ctrl-group:has(.mapboxgl-ctrl-zoom-in)'
  ) as HTMLElement | null;

  let ownControl: mapboxgl.IControl | null = null;
  if (!group) {
    const root = document.createElement('div');
    root.className = 'mapboxgl-ctrl mapboxgl-ctrl-group route-map-mode-ctrl';
    group = root;
    ownControl = {
      onAdd: () => root,
      onRemove: () => {},
    };
    map.addControl(ownControl, 'top-right');
  } else {
    group.classList.add('route-map-mode-ctrl');
  }

  const d3 = create3dToggleButton();
  d3.addEventListener('click', (event) => {
    event.preventDefault();
    opts.onToggle3d();
  });

  const fs = createFullscreenButton();
  fs.addEventListener('click', (event) => {
    event.preventDefault();
    toggleMapFullscreen(map);
  });

  const chase = createChaseControlButton();
  chase.addEventListener('click', (event) => {
    event.preventDefault();
    opts.onToggleChase();
  });

  // Hidden until React syncs visibility (privacy / GPS / fullscreen gates).
  d3.classList.add('is-hidden');
  fs.classList.add('is-hidden');
  chase.classList.add('is-hidden');

  // Vertical stack: zoom / compass (Mapbox) -> 3D -> cruise -> fullscreen
  group.append(d3, chase, fs);
  handles.d3Button = d3;
  handles.fullscreenButton = fs;
  handles.chaseButton = chase;

  return () => {
    d3.remove();
    fs.remove();
    chase.remove();
    handles.d3Button = null;
    handles.fullscreenButton = null;
    handles.chaseButton = null;
    if (ownControl) {
      try {
        map.removeControl(ownControl);
      } catch {
        /* map already removed */
      }
    } else {
      group?.classList.remove('route-map-mode-ctrl');
    }
  };
}
