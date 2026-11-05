import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import type { Activity, SportFilter } from '@/types';
import { useLocale } from '@/hooks/useLocale';
import { extractProvince } from '@/hooks/useActivities';

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

// Equirectangular projection for China mainland + islands.
// Slightly padded so Xinjiang / Heilongjiang / Hainan keep breathing room.
const BOUNDS = { minLng: 72.5, maxLng: 136.5, minLat: 16.5, maxLat: 54.5 };
/** Visual scale < 1 so the full outline fits inside the card with padding. */
const MAP_SCALE = 0.92;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

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
  return (coordinates as unknown as number[][][][])
    .flatMap((poly) => poly.map((r) => ringToPath(r, w, h)))
    .join(' ');
}

/**
 * China-province choropleth only.
 * extractProvince() drops non-China locations, so overseas runs never tint this map.
 * A true world view would need a separate countries GeoJSON + country aggregation
 * (ProfileCard already counts countries separately).
 */
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
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    /** True once the pointer moved enough — skip province click. */
    moved: boolean;
  } | null>(null);
  const pinchRef = useRef<{
    active: boolean;
    startDist: number;
    startZoom: number;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  const SVG_W = 240;
  const SVG_H = 174;

  useEffect(() => {
    import('@/assets/china-provinces.json').then((mod) => {
      setFeatures((mod.default as { features: GeoFeature[] }).features);
    });
  }, []);

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

  const clampPan = useCallback((x: number, y: number, z: number) => {
    if (z <= 1.01) return { x: 0, y: 0 };
    const maxX = ((z - 1) * SVG_W) / 2;
    const maxY = ((z - 1) * SVG_H) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }, []);

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const onWheel = (e: ReactWheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const next = Math.max(
      MIN_ZOOM,
      Math.min(MAX_ZOOM, zoom * (e.deltaY > 0 ? 0.9 : 1.1))
    );
    setZoom(next);
    setPan((p) => clampPan(p.x, p.y, next));
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    // Two-finger pinch is handled via native touch listeners.
    if (pinchRef.current?.active) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: panRef.current.x,
      origY: panRef.current.y,
      moved: false,
    };
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    const z = zoomRef.current;
    if (!d?.active || z <= 1.01 || pinchRef.current?.active) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const sx = SVG_W / Math.max(1, rect.width);
    const sy = SVG_H / Math.max(1, rect.height);
    setPan(clampPan(d.origX + dx * sx, d.origY + dy * sy, z));
  };

  const endDrag = () => {
    if (dragRef.current) dragRef.current.active = false;
  };

  // Mobile pinch-to-zoom (wheel already covers desktop trackpads).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const distOf = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchRef.current = {
          active: true,
          startDist: Math.max(1, distOf(e.touches)),
          startZoom: zoomRef.current,
        };
        if (dragRef.current) dragRef.current.active = false;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const pinch = pinchRef.current;
      if (!pinch?.active || e.touches.length !== 2) return;
      e.preventDefault();
      const ratio = distOf(e.touches) / pinch.startDist;
      const next = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, pinch.startZoom * ratio)
      );
      setZoom(next);
      setPan((p) => clampPan(p.x, p.y, next));
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2 && pinchRef.current) {
        pinchRef.current.active = false;
      }
    };

    svg.addEventListener('touchstart', onTouchStart, { passive: true });
    svg.addEventListener('touchmove', onTouchMove, { passive: false });
    svg.addEventListener('touchend', onTouchEnd);
    svg.addEventListener('touchcancel', onTouchEnd);
    return () => {
      svg.removeEventListener('touchstart', onTouchStart);
      svg.removeEventListener('touchmove', onTouchMove);
      svg.removeEventListener('touchend', onTouchEnd);
      svg.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [clampPan]);

  function handleClick(name: string) {
    if (!onSelectProvince) return;
    const visited = (provinceCount.get(name) ?? 0) > 0;
    if (!visited) return;
    onSelectProvince(selectedProvince === name ? null : name);
  }

  const baseTx = SVG_W / 2;
  const baseTy = SVG_H / 2;
  const mapTransform = `translate(${baseTx + pan.x} ${baseTy + pan.y}) scale(${MAP_SCALE * zoom}) translate(${-SVG_W / 2} ${-SVG_H / 2})`;

  return (
    <div className={`card flex flex-col p-3.5 ${className || 'h-full'}`}>
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
              <span className="metric font-semibold text-[var(--color-accent)]">
                {visitedCount}
              </span>
              <span>
                / {features.length || 35}{' '}
                {locale === 'zh' ? '省份' : 'provinces'}
              </span>
            </>
          )}
          {zoom > 1.01 ? (
            <button
              type="button"
              onClick={resetView}
              className="ml-1 cursor-pointer text-[var(--color-accent)] hover:opacity-70"
              title={locale === 'zh' ? '重置缩放' : 'Reset zoom'}
            >
              {locale === 'zh' ? '复位' : 'Reset'}
            </button>
          ) : null}
        </div>
      </div>

      <div className="group relative flex aspect-[240/174] min-h-[120px] min-w-0 flex-1 touch-none items-center justify-center overflow-hidden lg:aspect-auto">
        <svg
          ref={svgRef}
          key={filter}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          preserveAspectRatio="xMidYMid meet"
          width="100%"
          height="100%"
          className={`absolute inset-0 block size-full ${zoom > 1.01 ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <g transform={mapTransform}>
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
        <div className="pointer-events-none absolute right-1 bottom-1 flex flex-col gap-1 opacity-100 transition-opacity duration-150 lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
          <button
            type="button"
            className="pointer-events-auto flex size-6 cursor-pointer items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-card)]/90 text-xs text-[var(--color-muted)] shadow-sm hover:text-[var(--color-text)]"
            onClick={() => {
              const next = Math.min(MAX_ZOOM, zoom * 1.2);
              setZoom(next);
              setPan((p) => clampPan(p.x, p.y, next));
            }}
            aria-label={locale === 'zh' ? '放大' : 'Zoom in'}
          >
            +
          </button>
          <button
            type="button"
            className="pointer-events-auto flex size-6 cursor-pointer items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-card)]/90 text-xs text-[var(--color-muted)] shadow-sm hover:text-[var(--color-text)]"
            onClick={() => {
              const next = Math.max(MIN_ZOOM, zoom / 1.2);
              setZoom(next);
              setPan((p) => clampPan(p.x, p.y, next));
            }}
            aria-label={locale === 'zh' ? '缩小' : 'Zoom out'}
          >
            −
          </button>
        </div>
      </div>

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
