/**
 * Pace scatter — plain SVG instead of Recharts.
 *
 * Why not Recharts: this series is one run per point (~400 on a full career),
 * and every pointer move dispatched a tooltip state update that re-rendered
 * every point element. The dots are static, so they live in a memoized child
 * that only re-renders when the geometry changes; hovering just moves a single
 * tooltip div. 400 circles reconcile once, not once per mouse move.
 */
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react';
import { formatPaceSeconds } from '@/core/splits';

export type PacePoint = {
  id: number;
  km: number;
  pace: number;
  /** `MM-DD` — stable label for the tooltip heading. */
  day: string;
};

const HEIGHT = 180;
const PAD = { top: 12, right: 16, bottom: 22, left: 46 };
/** Pointer→point snapping distance in px. */
const HIT_RADIUS = 14;
const DOT_R = 3;

type Geom = {
  width: number;
  innerW: number;
  innerH: number;
  maxKm: number;
  paceLo: number;
  paceHi: number;
};

function paceTicks(lo: number, hi: number): number[] {
  if (!(hi > lo)) return [lo];
  const step = Math.max(30, Math.round((hi - lo) / 3 / 30) * 30);
  const out: number[] = [];
  for (let v = lo; v <= hi + 0.5; v += step) out.push(v);
  return out;
}

function kmTicks(maxKm: number): number[] {
  if (!(maxKm > 0)) return [0];
  return [0, maxKm / 3, (maxKm * 2) / 3, maxKm];
}

/** Static dot layer — bails out of all React work while the tooltip moves. */
const Dots = memo(function Dots({
  cx,
  cy,
}: {
  cx: Float64Array;
  cy: Float64Array;
}) {
  const nodes: ReactElement[] = [];
  for (let i = 0; i < cx.length; i++) {
    nodes.push(
      <circle
        key={i}
        cx={cx[i]}
        cy={cy[i]}
        r={DOT_R}
        fill="var(--color-run)"
        fillOpacity={0.78}
      />
    );
  }
  return <g>{nodes}</g>;
});

export function PaceScatter({
  points,
  label,
}: {
  points: PacePoint[];
  /** Pre-translated aria label for the chart region. */
  label: string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const read = () => {
      const w = el.clientWidth;
      if (w > 0) setWidth((prev) => (prev === w ? prev : w));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geom = useMemo<Geom>(() => {
    let maxKm = 1;
    let minPace = 300;
    let maxPace = 360;
    for (const p of points) {
      if (p.km > maxKm) maxKm = p.km;
      if (p.pace < minPace) minPace = p.pace;
      if (p.pace > maxPace) maxPace = p.pace;
    }
    return {
      width,
      innerW: Math.max(0, width - PAD.left - PAD.right),
      innerH: HEIGHT - PAD.top - PAD.bottom,
      maxKm: maxKm * 1.05,
      paceLo: Math.max(0, Math.floor(minPace / 30) * 30 - 30),
      paceHi: Math.ceil(maxPace / 30) * 30 + 30,
    };
  }, [points, width]);

  const projected = useMemo(() => {
    const n = points.length;
    const cx = new Float64Array(n);
    const cy = new Float64Array(n);
    const { innerW, innerH, maxKm, paceLo, paceHi } = geom;
    if (innerW <= 0 || innerH <= 0) return { cx, cy };
    const xScale = innerW / (maxKm || 1);
    const yRange = paceHi - paceLo || 1;
    for (let i = 0; i < n; i++) {
      const p = points[i];
      cx[i] = PAD.left + p.km * xScale;
      // Faster pace (smaller number) sits higher, matching the old reversed axis.
      cy[i] = PAD.top + ((p.pace - paceLo) / yRange) * innerH;
    }
    return { cx, cy };
  }, [points, geom]);

  const onMove = useCallback(
    (e: ReactPointerEvent<SVGRectElement>) => {
      // Projected coords are in SVG viewport space, so measure against the
      // <svg> root — measuring against the inner hit rect would offset every
      // test by PAD.left/PAD.top and make narrow hit-testing miss.
      const svg = e.currentTarget.ownerSVGElement;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const { cx, cy } = projected;
      let best = -1;
      let bestD = HIT_RADIUS * HIT_RADIUS;
      for (let i = 0; i < cx.length; i++) {
        const dx = cx[i] - px;
        const dy = cy[i] - py;
        const d = dx * dx + dy * dy;
        if (d <= bestD) {
          bestD = d;
          best = i;
        }
      }
      setActive((prev) => (prev === best ? prev : best < 0 ? null : best));
    },
    [projected]
  );

  const onLeave = useCallback(() => setActive(null), []);

  // Derive instead of syncing in an effect: a stale index after the data
  // shrinks (year switch) simply resolves to "no active point".
  const activePoint =
    active != null && active < points.length ? points[active] : null;
  const activeX = activePoint ? projected.cx[active as number] : 0;
  const activeY = activePoint ? projected.cy[active as number] : 0;

  return (
    <div
      ref={wrapRef}
      className="progress-scatter-wrap"
      role="img"
      aria-label={label}
    >
      {geom.width > 0 ? (
        <svg width={geom.width} height={HEIGHT}>
          {/* Pace grid + reversed ticks (faster at the top). */}
          {paceTicks(geom.paceLo, geom.paceHi).map((v) => {
            const y =
              PAD.top +
              ((v - geom.paceLo) / (geom.paceHi - geom.paceLo || 1)) *
                geom.innerH;
            return (
              <g key={`y-${v}`}>
                <line
                  x1={PAD.left}
                  x2={PAD.left + geom.innerW}
                  y1={y}
                  y2={y}
                  stroke="var(--color-border)"
                  strokeDasharray="3 4"
                />
                <text
                  x={PAD.left - 6}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={10}
                  fill="var(--color-muted)"
                >
                  {formatPaceSeconds(v)}
                </text>
              </g>
            );
          })}

          {/* Distance grid + ticks. */}
          {kmTicks(geom.maxKm).map((v) => {
            const x = PAD.left + (v / (geom.maxKm || 1)) * geom.innerW;
            return (
              <g key={`x-${v}`}>
                <line
                  x1={x}
                  x2={x}
                  y1={PAD.top}
                  y2={PAD.top + geom.innerH}
                  stroke="var(--color-border)"
                  strokeDasharray="3 4"
                />
                <text
                  x={x}
                  y={PAD.top + geom.innerH + 14}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--color-muted)"
                >
                  {`${Number(v.toFixed(1))} km`}
                </text>
              </g>
            );
          })}

          <Dots cx={projected.cx} cy={projected.cy} />

          {activePoint ? (
            <circle
              cx={activeX}
              cy={activeY}
              r={DOT_R + 2.5}
              fill="none"
              stroke="var(--color-run)"
              strokeWidth={2}
            />
          ) : null}

          {/* Transparent hit surface on top so the pointer never has to land on
              a 3px dot. */}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={geom.innerW}
            height={geom.innerH}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={onLeave}
            onPointerCancel={onLeave}
          />
        </svg>
      ) : null}

      {activePoint ? (
        <div
          className="progress-scatter-tip is-floating"
          style={{
            left: Math.min(
              Math.max(activeX + 12, 8),
              Math.max(8, geom.width - 156)
            ),
            top: Math.max(8, activeY - 54),
          }}
        >
          <strong>{activePoint.day}</strong>
          <div>
            {activePoint.km.toFixed(2)} km ·{' '}
            {formatPaceSeconds(activePoint.pace)} /km
          </div>
        </div>
      ) : null}
    </div>
  );
}
