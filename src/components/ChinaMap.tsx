import { useEffect, useMemo, useState } from 'react';
import type { Activity, SportFilter } from '../types';
import { useLocale } from '../hooks/useLocale';
import { extractProvince } from '../hooks/useActivities';

interface ChinaMapProps {
  activities: Activity[];
  filter: SportFilter;
  onSelectProvince?: (province: string | null) => void;
  selectedProvince?: string | null;
  className?: string;
}

type GeoFeature = {
  type: 'Feature';
  properties: { name: string; adcode: number };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][][];
  };
};

// Simple equirectangular projection bounded to China (tight for larger visual scale)
const BOUNDS = { minLng: 73.5, maxLng: 135.5, minLat: 17.8, maxLat: 53.8 };
const MAP_SCALE = 1.18;

function project(
  lng: number,
  lat: number,
  w: number,
  h: number
): [number, number] {
  const x = ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * w;
  const y = h - ((lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * h;
  return [x, y];
}

function ringToPath(ring: number[][], w: number, h: number): string {
  return (
    ring
      .map(([lng, lat], i) => {
        const [x, y] = project(lng, lat, w, h);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ') + ' Z'
  );
}

function featureToPath(feature: GeoFeature, w: number, h: number): string {
  const { type, coordinates } = feature.geometry;
  if (type === 'Polygon') {
    return (coordinates as unknown as number[][][])
      .map((r) => ringToPath(r, w, h))
      .join(' ');
  }
  // MultiPolygon
  return (coordinates as unknown as number[][][][])
    .flatMap((poly) => poly.map((r) => ringToPath(r, w, h)))
    .join(' ');
}

export function ChinaMap({
  activities,
  filter,
  onSelectProvince,
  selectedProvince,
  className = '',
}: ChinaMapProps) {
  const { locale } = useLocale();
  const [hoveredProvince, setHoveredProvince] = useState<string | null>(null);
  const [features, setFeatures] = useState<GeoFeature[]>([]);

  const SVG_W = 240;
  const SVG_H = 174;

  // Lazy-load GeoJSON to keep initial bundle small
  useEffect(() => {
    import('../assets/china-provinces.json').then((mod) => {
      setFeatures((mod.default as { features: GeoFeature[] }).features);
    });
  }, []);

  // Build province → activity count map
  const provinceCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of activities) {
      const p = extractProvince(a.location_country);
      if (p) map.set(p, (map.get(p) ?? 0) + 1);
    }
    return map;
  }, [activities]);

  const visitedCount = provinceCount.size;
  const displayProvince = hoveredProvince ?? selectedProvince;
  const displayCount = displayProvince
    ? (provinceCount.get(displayProvince) ?? 0)
    : 0;

  function handleClick(name: string) {
    if (!onSelectProvince) return;
    const visited = (provinceCount.get(name) ?? 0) > 0;
    if (!visited) return;
    onSelectProvince(selectedProvince === name ? null : name);
  }

  return (
    <div
      className={`flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3.5 ${className || 'h-full'}`}
    >
      {/* Header */}
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-balance">
          {locale === 'zh' ? '足迹地图' : 'Footprint Map'}
        </h2>
        <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
          {selectedProvince ? (
            <button
              onClick={() => onSelectProvince?.(null)}
              className="flex items-center gap-1 text-[var(--color-accent)] transition-opacity hover:opacity-70"
            >
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              {locale === 'zh' ? '清除筛选' : 'Clear'}
            </button>
          ) : (
            <>
              <span className="font-mono font-bold text-[var(--color-accent)]">
                {visitedCount}
              </span>
              <span>
                / {features.length || 35}{' '}
                {locale === 'zh' ? '省份' : 'provinces'}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Mobile: keep aspect; desktop: fill remaining height to align with heatmap */}
      <div className="relative aspect-[240/174] min-h-[120px] min-w-0 flex-1 touch-manipulation lg:aspect-auto">
        <svg
          key={filter}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          preserveAspectRatio="xMidYMid meet"
          width="100%"
          height="100%"
          className="absolute inset-0 block size-full"
        >
          <g
            transform={`translate(${SVG_W / 2} ${SVG_H / 2}) scale(${MAP_SCALE}) translate(${-SVG_W / 2} ${-SVG_H / 2})`}
          >
            {features.map((feature) => {
              const name = feature.properties.name;
              const count = provinceCount.get(name) ?? 0;
              const visited = count > 0;
              const isHovered = hoveredProvince === name;
              const isSelected = selectedProvince === name;

              let fill: string;
              if (visited) {
                if (isSelected) {
                  fill = 'var(--color-accent)';
                } else if (isHovered) {
                  fill =
                    'color-mix(in srgb, var(--color-accent) 80%, transparent)';
                } else if (selectedProvince) {
                  // dim other provinces when one is selected
                  fill =
                    'color-mix(in srgb, var(--color-accent) 25%, transparent)';
                } else {
                  fill =
                    'color-mix(in srgb, var(--color-accent) 55%, transparent)';
                }
              } else {
                fill = 'var(--color-border)';
              }

              return (
                <path
                  key={feature.properties.adcode}
                  d={featureToPath(feature, SVG_W, SVG_H)}
                  fill={fill}
                  stroke="var(--color-bg)"
                  strokeWidth="0.75"
                  className={`transition-all duration-150 ${visited ? 'cursor-pointer' : 'cursor-default'}`}
                  onMouseEnter={() => setHoveredProvince(name)}
                  onMouseLeave={() => setHoveredProvince(null)}
                  onClick={() => handleClick(name)}
                />
              );
            })}
          </g>
        </svg>
      </div>

      {/* Tooltip */}
      <div className="mt-1.5 h-4 shrink-0 text-xs text-[var(--color-muted)]">
        {displayProvince && (
          <>
            <span className="font-medium text-[var(--color-text)]">
              {displayProvince}
            </span>
            {displayCount > 0 && (
              <span className="ml-1.5">
                {displayCount} {locale === 'zh' ? '次' : 'activities'}
              </span>
            )}
            {selectedProvince === displayProvince && !hoveredProvince && (
              <span className="ml-1.5 text-[var(--color-accent)]">
                {locale === 'zh' ? '（已筛选）' : '(filtered)'}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
