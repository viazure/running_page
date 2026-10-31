import type { StyleSpecification } from 'mapbox-gl';
import { MAPBOX_TOKEN } from './config';

/** Local blank style — no Mapbox CDN; used for privacy lights-off only. */
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

export type BasemapProvider = 'mapbox' | 'carto' | 'openfreemap';

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

/**
 * Free OpenFreeMap styles (classic theme mapcn_openfreemap) — no token.
 * Prefer as fallback when CARTO tiles are blocked or never settle.
 */
export function openfreemapBasemapStyle(dark: boolean): string {
  return dark !== false
    ? 'https://tiles.openfreemap.org/styles/dark'
    : 'https://tiles.openfreemap.org/styles/bright';
}

export function initialBasemapProvider(): BasemapProvider {
  return MAPBOX_TOKEN ? 'mapbox' : 'carto';
}

export function basemapStyleUrl(
  provider: BasemapProvider,
  dark: boolean
): string {
  if (provider === 'mapbox') return mapboxBasemapStyle(dark);
  if (provider === 'openfreemap') return openfreemapBasemapStyle(dark);
  return cartoBasemapStyle(dark);
}

/**
 * Automatic fallback chain when a style fails or times out:
 * Mapbox → CARTO → OpenFreeMap. Never falls through to blank
 * (blank is reserved for privacy lights-off).
 */
export function nextBasemapProvider(
  provider: BasemapProvider
): BasemapProvider | null {
  if (provider === 'mapbox') return 'carto';
  if (provider === 'carto') return 'openfreemap';
  return null;
}

/** Mapbox/MapLibre-compatible label language code from app locale. */
export function mapLabelLanguage(locale: 'zh' | 'en'): string {
  return locale === 'zh' ? 'zh-Hans' : 'en';
}

/** Mapbox built-in control UI strings (overrides English defaults). */
export function mapboxControlLocale(t: (key: string) => string): {
  [key: string]: string;
} {
  return {
    'NavigationControl.ZoomIn': t('zoomIn'),
    'NavigationControl.ZoomOut': t('zoomOut'),
    'NavigationControl.ResetBearing': t('resetNorth'),
    'FullscreenControl.Enter': t('enterFullscreen'),
    'FullscreenControl.Exit': t('exitFullscreen'),
    'AttributionControl.ToggleAttribution': t('toggleAttribution'),
  };
}

/** If Mapbox/CARTO style never loads (e.g. blocked network), advance the fallback chain. */
export const MAP_STYLE_LOAD_TIMEOUT_MS = 8000;

export function isMapboxAuthError(error: unknown): boolean {
  const status = (error as Error & { status?: number })?.status;
  return status === 401 || status === 403;
}
