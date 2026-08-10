import {
  memo,
  useCallback,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { DIST_UNIT } from '@/themes/classic/utils/utils';

interface ChartData {
  day: number;
  distance: string;
}

interface SummaryActivityChartProps {
  data: ChartData[];
  yAxisMax: number;
  /** Chart x-axis bucket: day-of-month / weekday / month-of-year. */
  interval: 'month' | 'week' | 'year';
}

type Tip = {
  day: number;
  value: number;
  /** Bar top-center in viewBox coords (for HTML overlay). */
  anchorX: number;
  anchorY: number;
};

type DaySelection = {
  /** Invalidates hover/pin when chart data changes. */
  dataId: string;
  day: number | null;
};

const VIEW_W = 320;
const VIEW_H = 140;
const PAD = { top: 12, right: 6, bottom: 20, left: 28 };

function formatBucketLabel(
  interval: SummaryActivityChartProps['interval'],
  bucket: number
): string {
  if (interval === 'year') return `Month ${bucket}`;
  // month → day of month; week → weekday index 1–7
  return `Day ${bucket}`;
}

/**
 * Dashboard Summary embed chart: SVG bars + HTML tip (readable px font on mobile).
 */
function SummaryActivityChartInner({
  data,
  yAxisMax,
  interval,
}: SummaryActivityChartProps) {
  const values = useMemo(
    () => data.map((d) => parseFloat(d.distance) || 0),
    [data]
  );

  const dataId = useMemo(
    () => `${interval}:${yAxisMax}:${values.join(',')}`,
    [interval, yAxisMax, values]
  );

  /** Mouse hover (cleared on leave). */
  const [hoverSel, setHoverSel] = useState<DaySelection>({
    dataId,
    day: null,
  });
  /** Touch tap (sticky until next tap / empty area). */
  const [pinnedSel, setPinnedSel] = useState<DaySelection>({
    dataId,
    day: null,
  });

  const hoverDay = hoverSel.dataId === dataId ? hoverSel.day : null;
  const pinnedDay = pinnedSel.dataId === dataId ? pinnedSel.day : null;

  const max = Math.max(yAxisMax, 1);
  const plotW = VIEW_W - PAD.left - PAD.right;
  const plotH = VIEW_H - PAD.top - PAD.bottom;
  const n = Math.max(values.length, 1);
  const gap = n > 20 ? 1 : n > 7 ? 2 : 3.5;
  const barW = Math.max(1.5, (plotW - gap * (n - 1)) / n);
  const xLabelEvery = Math.max(1, Math.ceil(n / 6));

  const yTicks = useMemo(() => {
    const steps = 3;
    return Array.from({ length: steps + 1 }, (_, i) =>
      Math.round((max * i) / steps)
    );
  }, [max]);

  const barLayout = useMemo(() => {
    return values.map((value, i) => {
      const h = (value / max) * plotH;
      const x = PAD.left + i * (barW + gap);
      const y = PAD.top + plotH - h;
      const day = data[i]?.day ?? i + 1;
      return { day, value, x, y, h, i };
    });
  }, [values, max, plotH, barW, gap, data]);

  const pickDayAt = useCallback(
    (clientX: number, clientY: number, svg: SVGSVGElement): number | null => {
      const ctm = svg.getScreenCTM();
      if (!ctm) return null;
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const loc = pt.matrixTransform(ctm.inverse());
      const relX = loc.x - PAD.left;
      if (relX < 0 || relX > plotW) return null;
      const i = Math.min(n - 1, Math.max(0, Math.floor(relX / (barW + gap))));
      const value = values[i];
      if (!value || value <= 0) return null;
      return data[i]?.day ?? i + 1;
    },
    [barW, gap, data, n, plotW, values]
  );

  const activeDay = pinnedDay ?? hoverDay;

  const tip = useMemo((): Tip | null => {
    if (activeDay === null) return null;
    const bar = barLayout.find((b) => b.day === activeDay);
    if (!bar || bar.value <= 0) return null;
    return {
      day: bar.day,
      value: bar.value,
      anchorX: bar.x + barW / 2,
      anchorY: bar.y,
    };
  }, [activeDay, barLayout, barW]);

  const tipStyle = useMemo(() => {
    if (!tip) return null;
    const leftPct = (tip.anchorX / VIEW_W) * 100;
    const topPct = (tip.anchorY / VIEW_H) * 100;
    const flipBelow = tip.anchorY < PAD.top + 36;
    return {
      left: `${leftPct}%`,
      top: `${topPct}%`,
      transform: flipBelow
        ? 'translate(-50%, 8px)'
        : 'translate(-50%, -8px) translateY(-100%)',
    };
  }, [tip]);

  const handlePlotPointerMove = useCallback(
    (e: ReactPointerEvent<SVGRectElement>) => {
      if (e.pointerType !== 'mouse') return;
      const day = pickDayAt(
        e.clientX,
        e.clientY,
        e.currentTarget.ownerSVGElement!
      );
      setHoverSel((prev) =>
        prev.dataId === dataId && prev.day === day ? prev : { dataId, day }
      );
    },
    [dataId, pickDayAt]
  );

  const handlePlotPointerLeave = useCallback(
    (e: ReactPointerEvent<SVGRectElement>) => {
      if (e.pointerType === 'mouse') {
        setHoverSel({ dataId, day: null });
      }
    },
    [dataId]
  );

  const handlePlotPointerDown = useCallback(
    (e: ReactPointerEvent<SVGRectElement>) => {
      const svg = e.currentTarget.ownerSVGElement!;
      const day = pickDayAt(e.clientX, e.clientY, svg);
      if (e.pointerType === 'mouse') {
        if (day !== null) setHoverSel({ dataId, day });
        return;
      }
      e.stopPropagation();
      if (day === null) {
        setPinnedSel({ dataId, day: null });
        return;
      }
      setPinnedSel((prev) => ({
        dataId,
        day: prev.dataId === dataId && prev.day === day ? null : day,
      }));
    },
    [dataId, pickDayAt]
  );

  const handleSvgPointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      if (e.target !== e.currentTarget) return;
      setPinnedSel({ dataId, day: null });
      if (e.pointerType === 'mouse') setHoverSel({ dataId, day: null });
    },
    [dataId]
  );

  return (
    <div className="relative h-full min-h-0 w-full">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
        height="100%"
        className="block h-full w-full"
        role="img"
        aria-label={`distance chart (${DIST_UNIT})`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={handleSvgPointerDown}
      >
        {yTicks.map((tick) => {
          const y = PAD.top + plotH - (tick / max) * plotH;
          return (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={VIEW_W - PAD.right}
                y1={y}
                y2={y}
                stroke="var(--color-summary-border, var(--color-border, var(--color-activity-card)))"
                strokeDasharray="3 3"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 6}
                y={y + 3}
                textAnchor="end"
                fill="var(--color-run-table-thead)"
                fontSize={9}
              >
                {tick}
              </text>
            </g>
          );
        })}

        <text
          x={PAD.left - 6}
          y={PAD.top - 2}
          textAnchor="end"
          fill="var(--color-run-table-thead)"
          fontSize={8}
          opacity={0.7}
        >
          {DIST_UNIT}
        </text>

        {barLayout.map(({ day, value, x, y, h, i }) => {
          const radius = Math.min(2.5, barW / 2);
          const isActive = activeDay === day;
          const barH = Math.max(h, value > 0 ? 1 : 0);

          return (
            <g key={day} pointerEvents="none">
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={radius}
                ry={radius}
                fill="var(--color-summary-accent, var(--color-primary))"
                opacity={1}
              />
              {isActive ? (
                <rect
                  x={x - 1}
                  y={y - 1}
                  width={barW + 2}
                  height={barH + 2}
                  rx={radius + 1}
                  ry={radius + 1}
                  fill="none"
                  stroke="var(--color-summary-accent, var(--color-primary))"
                  strokeWidth={2}
                  opacity={0.7}
                />
              ) : null}
              {i % xLabelEvery === 0 || i === n - 1 ? (
                <text
                  x={x + barW / 2}
                  y={VIEW_H - 6}
                  textAnchor="middle"
                  fill="var(--color-run-table-thead)"
                  fontSize={9}
                  fontWeight={isActive ? 600 : 400}
                >
                  {day}
                </text>
              ) : null}
            </g>
          );
        })}

        {/* Single hit layer — avoids flicker between column hit targets */}
        <rect
          x={PAD.left}
          y={PAD.top}
          width={plotW}
          height={plotH}
          fill="transparent"
          style={{ cursor: 'crosshair', touchAction: 'manipulation' }}
          onPointerMove={handlePlotPointerMove}
          onPointerLeave={handlePlotPointerLeave}
          onPointerDown={handlePlotPointerDown}
        />
      </svg>

      {tip && tipStyle ? (
        <div
          className="pointer-events-none absolute z-10 flex w-[6.75rem] flex-col items-center gap-0.5 rounded-md border border-[var(--color-border)] bg-[var(--color-card)] px-2.5 py-1.5 shadow-md max-[640px]:w-[7.5rem] max-[640px]:gap-1 max-[640px]:px-3 max-[640px]:py-2"
          style={tipStyle}
        >
          <span className="text-[11px] leading-none font-medium tracking-wide text-[var(--color-run-table-thead)] max-[640px]:text-xs">
            {formatBucketLabel(interval, tip.day)}
          </span>
          <span className="text-sm leading-none font-semibold text-[var(--color-text)] tabular-nums max-[640px]:text-[15px]">
            {tip.value.toFixed(2)}
            <span className="ml-1 text-[11px] font-medium text-[var(--color-run-table-thead)] max-[640px]:text-xs">
              {DIST_UNIT}
            </span>
          </span>
        </div>
      ) : null}
    </div>
  );
}

function areEqual(
  prev: SummaryActivityChartProps,
  next: SummaryActivityChartProps
) {
  if (prev.yAxisMax !== next.yAxisMax) return false;
  if (prev.interval !== next.interval) return false;
  if (prev.data.length !== next.data.length) return false;
  for (let i = 0; i < prev.data.length; i++) {
    if (
      prev.data[i].day !== next.data[i].day ||
      prev.data[i].distance !== next.data[i].distance
    ) {
      return false;
    }
  }
  return true;
}

export const SummaryActivityChart = memo(SummaryActivityChartInner, areEqual);
