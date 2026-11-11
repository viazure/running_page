import { formatClock } from '@/core/splits';
import { useLocale } from '@/hooks/useLocale';
import type { BestEffortSeries } from '../../hooks/useSummaryAggregates';
import { SectionTitle } from './InfoTip';

/**
 * Distance ladder. Labels come from i18n so EN reads "Half marathon" instead of
 * a bare "Half"; a distance is only rendered once the data has a record for it.
 */
const ORDER: { key: string; i18nKey: string }[] = [
  { key: '1k', i18nKey: 'dist1k' },
  { key: '5k', i18nKey: 'dist5k' },
  { key: '10k', i18nKey: 'dist10k' },
  { key: 'half', i18nKey: 'distHalf' },
  { key: 'full', i18nKey: 'distFull' },
];

/**
 * Best efforts and personal-record progression.
 *
 * Each distance shows the current best and the most recent improvements, so the
 * page answers "how fast am I now" and "am I getting faster" — the two questions
 * a PR list alone does not. Requires per-sample streams (L4); hidden otherwise.
 */
export function BestEfforts({
  series,
  tr,
}: {
  series: BestEffortSeries;
  /** Kept for call-site compatibility; labels resolve through `t()` instead. */
  locale?: string;
  tr: (zh: string, en: string) => string;
}) {
  const { t } = useLocale();
  const rows = ORDER.map(({ key, i18nKey }) => {
    const list = series[key] ?? [];
    const best = list[list.length - 1];
    const recent = list.slice(-3);
    return { key, label: t(i18nKey), best, recent, count: list.length };
  }).filter((r) => r.best != null);

  // "Recent improvements" is one merged timeline, newest first. Taking
  // `flatMap(...).slice(6)` used to keep whatever distances happened to come
  // first in ORDER, so 10K / half never showed once 1K + 5K filled the quota.
  const recent = rows
    .flatMap((r) =>
      r.recent.map((p) => ({
        id: `${r.key}-${p.date}`,
        label: r.label,
        date: p.date,
        seconds: p.seconds,
      }))
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  if (!rows.length) return null;

  return (
    <section className="card summary-section-compact p-4 md:p-4">
      <SectionTitle
        title={tr('最佳成绩与进展', 'Best efforts & progression')}
        tip={tr(
          '由逐点轨迹流计算任意起点的滚动最快，因此可能略快于 GPS 分段成绩；提升次数指历史上刷新过多少次该距离最好成绩。',
          'Computed as the fastest rolling window from per-sample streams, so it may beat GPS lap splits. "Improvements" counts how often that distance record was broken.'
        )}
        right={
          <span className="text-[11px] text-[var(--color-muted)]">
            {tr('任意起点滚动最快', 'Rolling fastest segment')}
          </span>
        }
      />

      {/* Column count follows the number of distances that actually have data
          (4 → 4-up, 5 → 5-up), so a missing full marathon never leaves a hole. */}
      <div
        className={`mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:gap-2.5 ${
          rows.length >= 5 ? 'md:grid-cols-5' : 'md:grid-cols-4'
        }`}
      >
        {rows.map((r) => (
          <div
            key={r.key}
            className="rounded-[6px] bg-[var(--color-bg)] px-3 py-3"
          >
            <div className="text-[11px] tracking-[0.8px] text-[var(--color-muted)]">
              {r.label}
            </div>
            <div className="metric mt-1 text-lg font-semibold">
              {formatClock(r.best!.seconds)}
            </div>
            <div className="mt-0.5 text-[10px] text-[var(--color-muted)]">
              {r.best!.date}
            </div>
            <div className="mt-0.5 text-[10px] text-[var(--color-muted)]">
              {tr(`提升 ${r.count} 次`, `${r.count} improvements`)}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <div className="text-[11px] text-[var(--color-muted)]">
          {tr('最近刷新', 'Recent improvements')}
        </div>
        {/* Two-up instead of full-bleed rows: each improvement is short, so a
            single column left half the width empty. */}
        <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
          {recent.map((p) => (
            <div
              key={p.id}
              className="flex items-baseline justify-between gap-3 border-b border-[var(--color-border)] pb-1.5 text-[12px] last:border-b-0"
            >
              <span className="text-[var(--color-muted)]">
                {p.label} · {p.date}
              </span>
              <span className="metric font-medium">
                {formatClock(p.seconds)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
