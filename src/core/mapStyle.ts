import type { StyleSpecification } from 'mapbox-gl';
import { MAPBOX_TOKEN } from './config';

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

export type BasemapProvider = 'mapbox' | 'carto';

export function mapboxBasemapStyle(dark: boolean): string {
  return dark !== false
    ? 'mapbox://styles/mapbox/dark-v11'
    : 'mapbox://styles/mapbox/light-v11';
}

/** Free CARTO GL styles — no token required. */
export function cartoBasemapStyle(dark: boolean): string {
  return dark !== false
    ? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
    : 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
}

export function initialBasemapProvider(): BasemapProvider {
  return MAPBOX_TOKEN ? 'mapbox' : 'carto';
}

export function basemapStyleUrl(
  provider: BasemapProvider,
  dark: boolean
): string {
  return provider === 'mapbox'
    ? mapboxBasemapStyle(dark)
    : cartoBasemapStyle(dark);
}

/** If Mapbox style never loads (e.g. blocked network), fall back to CARTO. */
export const MAP_STYLE_LOAD_TIMEOUT_MS = 8000;

export function isMapboxAuthError(error: unknown): boolean {
  const status = (error as Error & { status?: number })?.status;
  return status === 401 || status === 403;
}
