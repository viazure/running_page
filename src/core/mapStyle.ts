import type { StyleSpecification } from 'mapbox-gl';

/** Local blank style — no Mapbox CDN; used for privacy lights-off / offline fallback. */
export function blankMapStyle(background = '#0d1117'): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': background },
      },
    ],
  };
}

export function mapboxBasemapStyle(dark: boolean): string {
  return dark !== false
    ? 'mapbox://styles/mapbox/dark-v11'
    : 'mapbox://styles/mapbox/light-v11';
}

/** If Mapbox style never loads (e.g. blocked network), fall back to blank. */
export const MAP_STYLE_LOAD_TIMEOUT_MS = 8000;
