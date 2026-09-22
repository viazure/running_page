import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './RouteMap.css';
import * as polyline from '@mapbox/polyline';
import type { Activity } from '../types';
import { MAPBOX_TOKEN } from '../config';
import {
  blankMapStyle,
  basemapStyleUrl,
  initialBasemapProvider,
  isMapboxAuthError,
  mapboxControlLocale,
  mapLabelLanguage,
  MAP_STYLE_LOAD_TIMEOUT_MS,
  type BasemapProvider,
} from '../core/mapStyle';
import { useLocale } from '../hooks/useLocale';
import type { Coordinate } from '../utils/routeAnimation';
import {
  CHASE_LAYER_IDS,
  createChaseControlButton,
  createMapChaseController,
  removeChaseHighlight,
  updateChaseControlButton,
} from '../utils/mapChase3d';
import {
  fitMapToRouteOverview,
  fitMapToSelectedRoute,
} from '../utils/mapRouteFit';

const ROUTE_LAYER_IDS = new Set(['routes', 'selected', ...CHASE_LAYER_IDS]);

interface RouteMapProps {
  activities: Activity[];
  selectedActivity?: Activity | null;
  dark?: boolean;
  onClearSelection?: () => void;
  /** Hide basemap tiles; keep route lines (classic privacy lights-off) */
  lightsOff?: boolean;
  className?: string;
}

function applyLightsOff(map: mapboxgl.Map, lightsOff: boolean) {
  const styleJson = map.getStyle();
  if (!styleJson?.layers) return;
  for (const layer of styleJson.layers) {
    if (ROUTE_LAYER_IDS.has(layer.id)) {
      map.setLayoutProperty(layer.id, 'visibility', 'visible');
      continue;
    }
    if (layer.id === 'background') {
      map.setLayoutProperty(layer.id, 'visibility', 'visible');
      continue;
    }
    map.setLayoutProperty(
      layer.id,
      'visibility',
      lightsOff ? 'none' : 'visible'
    );
  }
}

function routeColor(a: Activity): string {
  return a.type === 'Run' ? '#f97316' : '#3b82f6';
}

export function RouteMap({
  activities,
  selectedActivity,
  dark,
  onClearSelection,
  lightsOff = false,
  className = '',
}: RouteMapProps) {
  const { locale, t } = useLocale();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const lightsOffRef = useRef(lightsOff);
  const activitiesRef = useRef(activities);
  const selectedRef = useRef(selectedActivity);
  const chaseRef = useRef(createMapChaseController());
  const selectedCoordsRef = useRef<Coordinate[] | null>(null);
  const [chaseRunId, setChaseRunId] = useState<string | null>(null);
  const selectedId = selectedActivity ? String(selectedActivity.run_id) : null;
  const chasing = chaseRunId != null && chaseRunId === selectedId;
  const chaseButtonRef = useRef<HTMLButtonElement | null>(null);
  const toggle3dRef = useRef<() => void>(() => {});
  const styleIdleRef = useRef(false);
  const refitViewRef = useRef<() => void>(() => {});
  const [needsRecenter, setNeedsRecenter] = useState(false);
  const [provider, setProvider] = useState<BasemapProvider>(
    initialBasemapProvider
  );
  const useBlank = lightsOff;
  // Flat chase works on CARTO; Mapbox DEM/buildings are best-effort in injectMapTerrain.
  const can3d = !lightsOff;
  const bg = dark !== false ? '#0d1117' : '#f6f8fa';
  const style = useBlank
    ? blankMapStyle(bg)
    : basemapStyleUrl(provider, dark !== false);

  const stopChase = () => {
    chaseRef.current.stop({ silent: true });
  };

  useEffect(() => {
    lightsOffRef.current = lightsOff;
    activitiesRef.current = activities;
    selectedRef.current = selectedActivity;
  });

  const updateRoutesRef = useRef(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    stopChase();
    if (map.getLayer('routes')) map.removeLayer('routes');
    if (map.getSource('routes')) map.removeSource('routes');
    if (map.getLayer('selected')) map.removeLayer('selected');
    if (map.getSource('selected')) map.removeSource('selected');
    removeChaseHighlight(map);

    const selected = selectedRef.current;
    const acts = activitiesRef.current;

    if (selected?.summary_polyline) {
      const coords = polyline
        .decode(selected.summary_polyline)
        .map(([lat, lng]) => [lng, lat] as Coordinate);
      selectedCoordsRef.current = coords;
      const color = routeColor(selected);

      map.addSource('selected', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: coords },
        },
      });

      map.addLayer({
        id: 'selected',
        type: 'line',
        source: 'selected',
        paint: {
          'line-color': color,
          'line-width': 3,
          'line-opacity': 0.9,
        },
      });

      fitMapToSelectedRoute(map, coords, lightsOffRef.current);
      applyLightsOff(map, lightsOffRef.current);
      return;
    }

    selectedCoordsRef.current = null;

    const features = acts
      .filter((a) => a.summary_polyline)
      .map((a) => {
        const coords = polyline
          .decode(a.summary_polyline!)
          .map(([lat, lng]) => [lng, lat]);
        return {
          type: 'Feature' as const,
          properties: { type: a.type },
          geometry: {
            type: 'LineString' as const,
            coordinates: coords,
          },
        };
      });

    if (features.length === 0) {
      applyLightsOff(map, lightsOffRef.current);
      return;
    }

    map.addSource('routes', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features,
      },
    });

    map.addLayer({
      id: 'routes',
      type: 'line',
      source: 'routes',
      paint: {
        'line-color': [
          'match',
          ['get', 'type'],
          'Run',
          '#f97316',
          'Ride',
          '#3b82f6',
          '#a855f7',
        ],
        'line-width': lightsOffRef.current ? 2 : 1.5,
        'line-opacity': lightsOffRef.current ? 0.85 : 0.6,
      },
    });

    const allCoords: [number, number][] = [];
    for (const f of features) {
      if (f.geometry.coordinates.length > 0) {
        allCoords.push(f.geometry.coordinates[0] as [number, number]);
      }
    }

    if (allCoords.length === 0) {
      applyLightsOff(map, lightsOffRef.current);
      return;
    }

    fitMapToRouteOverview(map, acts, lightsOffRef.current);
    applyLightsOff(map, lightsOffRef.current);
  });

  useEffect(() => {
    refitViewRef.current = () => {
      const map = mapRef.current;
      if (!map?.isStyleLoaded()) return;
      const selected = selectedRef.current;
      const coords = selectedCoordsRef.current;
      if (selected && coords && coords.length > 0) {
        fitMapToSelectedRoute(map, coords, lightsOffRef.current);
      } else {
        fitMapToRouteOverview(map, activitiesRef.current, lightsOffRef.current);
      }
      setNeedsRecenter(false);
    };
  });

  const handleToggle3d = () => {
    const map = mapRef.current;
    const selected = selectedRef.current;
    const coords = selectedCoordsRef.current;
    if (!map || !selected || !coords || !can3d) return;

    if (chaseRef.current.isAnimating()) {
      stopChase();
      setChaseRunId(null);
      if (map.getLayer('selected')) {
        map.setPaintProperty('selected', 'line-opacity', 0.9);
      }
      const bounds = new mapboxgl.LngLatBounds();
      coords.forEach((c) => bounds.extend(c));
      map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
      map.fitBounds(bounds, { padding: 50, maxZoom: 14, duration: 800 });
      removeChaseHighlight(map);
      return;
    }

    // Prefer chase highlight over static selected line while flying
    if (map.getLayer('selected')) {
      map.setPaintProperty('selected', 'line-opacity', 0.25);
    }

    const runId = String(selected.run_id);
    chaseRef.current.start(
      {
        map,
        coords,
        color: routeColor(selected),
        distanceKm: selected.distance / 1000,
        runId,
        isDark: dark !== false,
        overviewLayerId: map.getLayer('routes') ? 'routes' : undefined,
      },
      {
        onStart: () => setChaseRunId(runId),
        onEnd: () => {
          setChaseRunId(null);
          if (map.getLayer('selected')) {
            map.setPaintProperty('selected', 'line-opacity', 0.9);
          }
        },
      }
    );
  };

  useEffect(() => {
    toggle3dRef.current = handleToggle3d;
  });

  useEffect(() => {
    const btn = chaseButtonRef.current;
    if (!btn) return;
    updateChaseControlButton(btn, {
      visible: Boolean(selectedActivity && can3d),
      chasing,
      title: chasing ? t('stopChase') : t('startChase'),
    });
  }, [chasing, selectedActivity, can3d, t]);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    if (MAPBOX_TOKEN) mapboxgl.accessToken = MAPBOX_TOKEN;

    styleIdleRef.current = false;

    const hasRouteLayers = (map: mapboxgl.Map) => {
      try {
        return Boolean(map.getLayer('routes') || map.getLayer('selected'));
      } catch {
        return false;
      }
    };

    const ensureRoutes = () => {
      const map = mapRef.current;
      if (!map?.isStyleLoaded()) return;
      styleIdleRef.current = true;
      if (chaseRef.current.isAnimating()) return;
      if (hasRouteLayers(map)) return;
      updateRoutesRef.current();
    };

    mapRef.current = new mapboxgl.Map({
      container,
      style,
      center: [121.4, 31.2],
      zoom: 10,
      pitch: 0,
      maxPitch: 85,
      attributionControl: false,
      keyboard: false,
      language: mapLabelLanguage(locale),
      locale: mapboxControlLocale(t),
    });

    if (!useBlank) {
      mapRef.current.addControl(
        new mapboxgl.AttributionControl({ compact: true }),
        'bottom-right'
      );
    }

    let settled = false;
    let timedOut = false;

    const fallBackFromMapbox = (reason: string) => {
      if (settled || provider !== 'mapbox' || lightsOff) return;
      settled = true;
      console.warn(reason);
      setProvider('carto');
    };

    const timer = window.setTimeout(() => {
      if (!mapRef.current || mapRef.current.isStyleLoaded() || timedOut) return;
      timedOut = true;
      if (provider === 'mapbox' && !lightsOff) {
        fallBackFromMapbox(
          'Map style load timed out; falling back to CARTO basemap'
        );
      } else if (!lightsOff) {
        console.warn(
          'CARTO style load timed out; falling back to blank basemap'
        );
        mapRef.current.setStyle(blankMapStyle(bg));
      }
    }, MAP_STYLE_LOAD_TIMEOUT_MS);

    const onError = (event: mapboxgl.ErrorEvent) => {
      if (isMapboxAuthError(event.error)) {
        fallBackFromMapbox('Mapbox auth failed; falling back to CARTO basemap');
      }
    };

    mapRef.current.on('error', onError);
    const onUserCameraChange = (event: { originalEvent?: Event }) => {
      // Programmatic fitBounds/easeTo have no originalEvent; ignore those.
      if (!event.originalEvent) return;
      if (chaseRef.current.isAnimating()) return;
      const map = mapRef.current;
      if (!map) return;
      try {
        if (map.getLayer('routes') || map.getLayer('selected')) {
          setNeedsRecenter(true);
        }
      } catch {
        /* style not ready */
      }
    };

    mapRef.current.on('style.load', () => {
      styleIdleRef.current = false;
      if (!timedOut) {
        settled = true;
        window.clearTimeout(timer);
      }
      ensureRoutes();
    });
    mapRef.current.on('idle', ensureRoutes);
    mapRef.current.on('dragend', onUserCameraChange);
    mapRef.current.on('zoomend', onUserCameraChange);
    mapRef.current.on('rotateend', onUserCameraChange);
    mapRef.current.on('pitchend', onUserCameraChange);
    if (mapRef.current.isStyleLoaded()) ensureRoutes();

    mapRef.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    // Custom "3D chase" button as a real Mapbox control (no overlay).
    const chaseControl: mapboxgl.IControl = {
      onAdd: () => {
        const root = document.createElement('div');
        root.className = 'route-map-3d-ctrl mapboxgl-ctrl mapboxgl-ctrl-group';

        const btn = createChaseControlButton();
        chaseButtonRef.current = btn;
        btn.onclick = () => toggle3dRef.current();
        updateChaseControlButton(btn, {
          visible: Boolean(selectedActivity && can3d),
          chasing: false,
          title: t('startChase'),
        });

        root.appendChild(btn);
        return root;
      },
      onRemove: () => {
        chaseButtonRef.current = null;
      },
    };

    mapRef.current.addControl(chaseControl, 'top-right');
    if (!useBlank) {
      // Add fullscreen after chase so chase appears above it.
      mapRef.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');
    }

    const resizeMap = () => {
      mapRef.current?.resize();
    };
    const ro = new ResizeObserver(() => {
      resizeMap();
      requestAnimationFrame(resizeMap);
    });
    ro.observe(container);

    const chase = chaseRef.current;
    return () => {
      ro.disconnect();
      window.clearTimeout(timer);
      chase.stop({ silent: true });
      styleIdleRef.current = false;
      mapRef.current?.off('error', onError);
      mapRef.current?.off('dragend', onUserCameraChange);
      mapRef.current?.off('zoomend', onUserCameraChange);
      mapRef.current?.off('rotateend', onUserCameraChange);
      mapRef.current?.off('pitchend', onUserCameraChange);
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Recreate when basemap mode or UI language changes
  }, [dark, lightsOff, provider, locale, t]);

  useEffect(() => {
    setNeedsRecenter(false);
    if (styleIdleRef.current) {
      updateRoutesRef.current();
    }
  }, [activities, selectedActivity]);

  useEffect(() => {
    if (!mapRef.current?.isStyleLoaded()) return;
    applyLightsOff(mapRef.current, lightsOff);
    if (mapRef.current.getLayer('routes')) {
      mapRef.current.setPaintProperty(
        'routes',
        'line-width',
        lightsOff ? 2 : 1.5
      );
      mapRef.current.setPaintProperty(
        'routes',
        'line-opacity',
        lightsOff ? 0.85 : 0.6
      );
    }
  }, [lightsOff]);

  return (
    <div
      className={`route-map-hover-ctrls relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] ${className || 'h-[220px] md:h-[380px]'}`}
      style={lightsOff ? { backgroundColor: bg } : undefined}
    >
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        {selectedActivity && onClearSelection ? (
          <button
            type="button"
            onClick={() => {
              stopChase();
              setChaseRunId(null);
              onClearSelection();
            }}
            className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 text-xs font-medium shadow-md transition-colors hover:bg-[var(--color-bg)]"
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
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            {t('overview')}
          </button>
        ) : null}
        {needsRecenter ? (
          <button
            type="button"
            className="route-map-recenter"
            aria-label={t('locateTrack')}
            title={t('locateTrack')}
            onClick={() => refitViewRef.current()}
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 2v4m0 12v4M2 12h4m12 0h4M12 8a4 4 0 100 8 4 4 0 000-8z"
              />
            </svg>
          </button>
        ) : null}
      </div>
      <div ref={mapContainerRef} className="h-full w-full" />
    </div>
  );
}
