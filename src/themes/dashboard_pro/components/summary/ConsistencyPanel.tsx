/**
 * Consistency & durability (L0).
 * Eddington + attendance metrics, with a 12-week volume sparkline so the card
 * does not sit half-empty beside taller neighbors.
 */
import { useMemo } from 'react';
import type { Activity } from '@/types';
import { SectionTitle } from './InfoTip';

function startOfIsoWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function weekKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function longestStreakDays(activities: Activity[]): number {
  const days = [
    ...new Set(activities.map((a) => a.start_date_local.slice(0, 10))),
  ].sort();
  if (!days.length) return 0;
  let best = 1;
  let cur = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(`${days[i - 1]}T12:00:00`);
    const next = new Date(`${days[i]}T12:00:00`);
    const diff = Math.round((next.getTime() - prev.getTime()) / 86400000);
    if (diff === 1) {
      cur += 1;
      best = Math.max(best, cur);
    } else {
      cur = 1;
    }
  }
  return best;
}

export function ConsistencyPanel({
  eddington,
  activeDays,
  runCount,
  streak,
  activities,
  locale,
  tr,
}: {
  eddington: number;
  activeDays: number;
  runCount: number;
  streak: number;
  activities: Activity[];
  locale: string;
  tr: (zh: string, en: string) => string;
}) {
  const freq = activeDays > 0 ? runCount / activeDays : 0;
  const longest = useMemo(() => longestStreakDays(activities), [activities]);

  const weeks = useMemo(() => {
    const thisWeek = startOfIsoWeek(new Date());
    const buckets = Array.from({ length: 12 }, (_, i) => {
      const start = new Date(thisWeek);
      start.setDate(start.getDate() - (11 - i) * 7);
      return {
        key: weekKey(start),
        label:
          locale === 'zh'
            ? `${start.getMonth() + 1}/${start.getDate()}`
            : `${start.getMonth() + 1}/${start.getDate()}`,
        km: 0,
        days: new Set<string>(),
      };
    });
    const byKey = new Map(buckets.map((b) => [b.key, b]));
    for (const a of activities) {
      const d = new Date(a.start_date_local);
      if (Number.isNaN(d.getTime())) continue;
      const bucket = byKey.get(weekKey(startOfIsoWeek(d)));
      if (!bucket) continue;
      bucket.km += a.distance / 1000;
      bucket.days.add(a.start_date_local.slice(0, 10));
    }
    return buckets.map((b) => ({
      key: b.key,
      label: b.label,
      km: Math.round(b.km * 10) / 10,
      activeDays: b.days.size,
    }));
  }, [activities, locale]);

  const maxKm = Math.max(0.01, ...weeks.map((w) => w.km));

  return (
    <section className="card summary-section-compact flex h-full min-h-0 flex-col p-4 md:p-4">
      <SectionTitle
        title={tr('持续性', 'Consistency')}
        tip={tr(
          'Eddington：满足「至少 E 天跑满 E km」的最大 E。它奖励长期重复而非单次峰值，比 PB 更能反映耐久性。',
          'Eddington: the largest E with at least E days of E+ km. It rewards repeated distance rather than a single peak, so it reads durability better than a PR.'
        )}
        right={
          <span className="text-[11px] text-[var(--color-muted)]">
            {tr('生涯累计', 'All time')}
          </span>
        }
      />

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-2.5">
        <div className="rounded-[6px] bg-[var(--color-bg)] px-3 py-3">
          <div className="mb-1 text-[11px] tracking-[0.8px] text-[var(--color-muted)]">
            Eddington
          </div>
          <div className="metric text-lg font-semibold">{eddington}</div>
          <div className="mt-0.5 text-[10px] text-[var(--color-muted)]">
            {tr(
              `${eddington} 天 ≥ ${eddington} km`,
              `${eddington} days ≥ ${eddington} km`
            )}
          </div>
        </div>
        <div className="rounded-[6px] bg-[var(--color-bg)] px-3 py-3">
          <div className="mb-1 text-[11px] tracking-[0.8px] text-[var(--color-muted)]">
            {tr('活跃天', 'Active days')}
          </div>
          <div className="metric text-lg font-semibold">{activeDays}</div>
          <div className="mt-0.5 text-[10px] text-[var(--color-muted)]">
            {freq
              ? tr(`日均 ${freq.toFixed(2)} 次`, `${freq.toFixed(2)} / day`)
              : '--'}
          </div>
        </div>
        <div className="rounded-[6px] bg-[var(--color-bg)] px-3 py-3">
          <div className="mb-1 text-[11px] tracking-[0.8px] text-[var(--color-muted)]">
            {tr('连续', 'Streak')}
          </div>
          <div className="metric text-lg font-semibold">
            {streak} {tr('天', 'd')}
          </div>
          <div className="mt-0.5 text-[10px] text-[var(--color-muted)]">
            {tr(`最长 ${longest} 天`, `best ${longest} d`)}
          </div>
        </div>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <span className="text-[11px] text-[var(--color-muted)]">
            {tr('近 12 周跑量', 'Last 12 weeks')}
          </span>
          <span className="metric text-[11px] text-[var(--color-muted)]">
            {weeks.reduce((s, w) => s + w.km, 0).toFixed(0)} km
          </span>
        </div>
        <div
          className="flex min-h-0 flex-1 flex-col justify-center gap-2 rounded-[8px] bg-[var(--color-bg)] px-3 py-3"
          role="img"
          aria-label={tr('近12周跑量', 'Last 12 weeks volume')}
        >
          {/* Newest week first — thin bars, room between rows. */}
          {[...weeks].reverse().map((w) => {
            const pct = Math.max(w.km > 0 ? 4 : 0, (w.km / maxKm) * 100);
            return (
              <div
                key={w.key}
                className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2"
                title={`${w.label}: ${w.km} km · ${w.activeDays}${tr('天', 'd')}`}
              >
                <span className="text-[10px] text-[var(--color-muted)] tabular-nums">
                  {w.label}
                </span>
                <span className="block h-1.5 overflow-hidden rounded-full bg-[var(--color-sunken,var(--color-card))]">
                  <span
                    className="block h-full rounded-full bg-[var(--color-accent)]"
                    style={{
                      width: `${pct}%`,
                      opacity: w.km > 0 ? 0.85 : 0.2,
                    }}
                  />
                </span>
                <span className="metric text-right text-[10px] text-[var(--color-muted)] tabular-nums">
                  {w.km > 0 ? w.km.toFixed(1) : '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
