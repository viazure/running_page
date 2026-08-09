import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './RouteMap.css';
import * as polyline from '@mapbox/polyline';
import type { Activity } from '../types';
import { MAPBOX_TOKEN } from '../config';
import {
  blankMapStyle,
  mapboxBasemapStyle,
  MAP_STYLE_LOAD_TIMEOUT_MS,
} from '../core/mapStyle';

const ROUTE_LAYER_IDS = new Set(['routes', 'selected']);

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

export function RouteMap({
  activities,
  selectedActivity,
  dark,
  onClearSelection,
  lightsOff = false,
  className = '',
}: RouteMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const lightsOffRef = useRef(lightsOff);
  const activitiesRef = useRef(activities);
  const selectedRef = useRef(selectedActivity);

  useEffect(() => {
    lightsOffRef.current = lightsOff;
    activitiesRef.current = activities;
    selectedRef.current = selectedActivity;
  });

  const useBlank = lightsOff || !MAPBOX_TOKEN;
  const bg = dark !== false ? '#0d1117' : '#f6f8fa';
  const style = useBlank
    ? blankMapStyle(bg)
    : mapboxBasemapStyle(dark !== false);

  const updateRoutesRef = useRef(() => {
    const map = mapRef.current;
    if (!map) return;

    if (map.getLayer('routes')) map.removeLayer('routes');
    if (map.getSource('routes')) map.removeSource('routes');
    if (map.getLayer('selected')) map.removeLayer('selected');
    if (map.getSource('selected')) map.removeSource('selected');

    const selected = selectedRef.current;
    const acts = activitiesRef.current;

    if (selected?.summary_polyline) {
      const coords = polyline
        .decode(selected.summary_polyline)
        .map(([lat, lng]) => [lng, lat]);

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
          'line-color': selected.type === 'Run' ? '#f97316' : '#3b82f6',
          'line-width': 3,
          'line-opacity': 0.9,
        },
      });

      const bounds = new mapboxgl.LngLatBounds();
      for (const c of coords) bounds.extend(c as [number, number]);
      map.fitBounds(bounds, {
        padding: 50,
        maxZoom: 14,
        duration: lightsOffRef.current ? 200 : 800,
      });
      applyLightsOff(map, lightsOffRef.current);
      return;
    }

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

    const trimPct = 0.1;
    const trimCount = Math.floor(allCoords.length * trimPct);
    const lngs = allCoords.map((c) => c[0]).sort((a, b) => a - b);
    const lats = allCoords.map((c) => c[1]).sort((a, b) => a - b);

    const bounds = new mapboxgl.LngLatBounds(
      [lngs[trimCount], lats[trimCount]],
      [lngs[lngs.length - 1 - trimCount], lats[lats.length - 1 - trimCount]]
    );

    map.fitBounds(bounds, {
      padding: 30,
      maxZoom: 13,
      duration: lightsOffRef.current ? 200 : 800,
    });
    applyLightsOff(map, lightsOffRef.current);
  });

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (MAPBOX_TOKEN) mapboxgl.accessToken = MAPBOX_TOKEN;

    const onStyleReady = () => {
      updateRoutesRef.current();
    };

    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style,
      center: [121.4, 31.2],
      zoom: 10,
      attributionControl: !useBlank,
    });

    mapRef.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
    if (!useBlank) {
      mapRef.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');
    }

    mapRef.current.on('style.load', onStyleReady);

    // Mapbox CDN blocked / slow → fall back to blank so routes still render
    let timedOut = false;
    const timer = window.setTimeout(() => {
      if (!mapRef.current || mapRef.current.isStyleLoaded() || timedOut) return;
      timedOut = true;
      console.warn('Map style load timed out; falling back to blank basemap');
      mapRef.current.setStyle(blankMapStyle(bg));
    }, MAP_STYLE_LOAD_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timer);
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Recreate when basemap mode changes (blank ↔ mapbox)
  }, [dark, useBlank]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (mapRef.current.isStyleLoaded()) {
      updateRoutesRef.current();
    } else {
      mapRef.current.once('style.load', () => updateRoutesRef.current());
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
      style={lightsOff || useBlank ? { backgroundColor: bg } : undefined}
    >
      {selectedActivity && (
        <button
          type="button"
          onClick={onClearSelection}
          className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 text-xs font-medium shadow-md transition-colors hover:bg-[var(--color-bg)]"
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
          Overview
        </button>
      )}
      <div ref={mapContainerRef} className="h-full w-full" />
    </div>
  );
}
