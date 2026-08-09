import { memo, useMemo } from 'react';
import { DIST_UNIT } from '../../utils/utils';

interface ChartData {
  day: number;
  distance: string;
}

interface ActivityChartProps {
  data: ChartData[];
  yAxisMax: number;
}

const VIEW_W = 320;
const VIEW_H = 140;
const PAD = { top: 12, right: 6, bottom: 20, left: 28 };

function ActivityChartInner({ data, yAxisMax }: ActivityChartProps) {
  const values = useMemo(
    () => data.map((d) => parseFloat(d.distance) || 0),
    [data]
  );

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

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width="100%"
      height="100%"
      role="img"
      aria-label={`distance chart (${DIST_UNIT})`}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* horizontal grid + y labels */}
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

      {/* unit hint */}
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

      {/* bars */}
      {values.map((value, i) => {
        const h = (value / max) * plotH;
        const x = PAD.left + i * (barW + gap);
        const y = PAD.top + plotH - h;
        const day = data[i]?.day ?? i + 1;
        const radius = Math.min(2.5, barW / 2);

        return (
          <g key={day}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={Math.max(h, value > 0 ? 1 : 0)}
              rx={radius}
              ry={radius}
              fill="var(--color-summary-accent, var(--color-primary))"
            >
              <title>
                {day}: {value.toFixed(2)} {DIST_UNIT}
              </title>
            </rect>
            {i % xLabelEvery === 0 || i === n - 1 ? (
              <text
                x={x + barW / 2}
                y={VIEW_H - 6}
                textAnchor="middle"
                fill="var(--color-run-table-thead)"
                fontSize={9}
              >
                {day}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function activityChartAreEqual(
  prev: ActivityChartProps,
  next: ActivityChartProps
) {
  if (prev.yAxisMax !== next.yAxisMax) return false;
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

export default memo(ActivityChartInner, activityChartAreEqual);
