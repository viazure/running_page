import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Activity } from '../types';
import { useLocale } from '../hooks/useLocale';

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

      {/* Explicit height so ResponsiveContainer works (%, min-h alone is not enough) */}
      <div className="h-[200px] min-h-0 w-full flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 4, left: -18, bottom: 0 }}
            barCategoryGap="18%"
          >
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
              cursor={{ fill: 'var(--color-accent)', fillOpacity: 0.08 }}
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
            <Bar
              dataKey="distance"
              fill="var(--color-accent)"
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
