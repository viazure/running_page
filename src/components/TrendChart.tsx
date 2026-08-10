import { useId, useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Activity } from '../types';
import { useLocale } from '../hooks/useLocale';
import './TrendChart.css';

interface TrendChartProps {
  activities: Activity[];
  /** Calendar year to plot (Jan–Dec) */
  year: number;
  className?: string;
}

export function TrendChart({
  activities,
  year,
  className = '',
}: TrendChartProps) {
  const { t, locale } = useLocale();
  const gradientId = useId().replace(/:/g, '');

  const data = useMemo(() => {
    const buckets = Array.from({ length: 12 }, (_, month) => {
      const label =
        locale === 'zh'
          ? `${month + 1}月`
          : new Date(year, month, 1).toLocaleString('en', { month: 'short' });
      return { month, label, distance: 0, count: 0 };
    });

    for (const a of activities) {
      const d = new Date(a.start_date_local);
      if (d.getFullYear() !== year) continue;
      const m = d.getMonth();
      buckets[m].distance += a.distance / 1000;
      buckets[m].count += 1;
    }

    return buckets.map((b) => ({
      ...b,
      distance: Math.round(b.distance * 10) / 10,
    }));
  }, [activities, year, locale]);

  const title = `${year} ${t('yearlyDistance')}`;
  const unit = 'km';

  return (
    <div
      className={`flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 ${className}`}
    >
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-balance">{title}</h3>
        <span className="text-[11px] text-[var(--color-muted)]">{unit}</span>
      </div>

      {/*
        Fixed height + min-w-0 avoids ResponsiveContainer (-1,-1) warn in flex layouts.
        mousedown preventDefault stops SVG focus ring without breaking tooltips.
      */}
      <div
        className="trend-chart-surface h-[200px] w-full min-w-0 shrink-0"
        onMouseDown={(e) => e.preventDefault()}
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          minWidth={0}
          debounce={50}
        >
          <AreaChart
            data={data}
            margin={{ top: 8, right: 4, left: -18, bottom: 0 }}
            accessibilityLayer={false}
            tabIndex={-1}
            style={{ outline: 'none' }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--color-accent)"
                  stopOpacity={0.35}
                />
                <stop
                  offset="100%"
                  stopColor="var(--color-accent)"
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-border)"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              interval={0}
              minTickGap={2}
            />
            <YAxis
              tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={36}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{
                stroke: 'var(--color-accent)',
                strokeWidth: 1,
                strokeOpacity: 0.35,
              }}
              wrapperStyle={{ outline: 'none' }}
              contentStyle={{
                backgroundColor: 'var(--color-card)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--color-text)',
                boxShadow: 'none',
              }}
              labelStyle={{ color: 'var(--color-muted)' }}
              itemStyle={{ color: 'var(--color-text)' }}
              formatter={(value, _name, item) => {
                const count = (item?.payload as { count?: number })?.count ?? 0;
                const v = typeof value === 'number' ? value : Number(value);
                return [
                  `${v.toFixed(1)} ${unit} · ${count} ${locale === 'zh' ? '次' : 'acts'}`,
                  locale === 'zh' ? '距离' : 'Distance',
                ];
              }}
            />
            <Area
              type="monotone"
              dataKey="distance"
              stroke="var(--color-accent)"
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              activeDot={{
                r: 4,
                strokeWidth: 0,
                fill: 'var(--color-accent)',
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
