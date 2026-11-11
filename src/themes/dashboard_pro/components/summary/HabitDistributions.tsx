import { useMemo, useState } from 'react';

/**
 * Training-habit start-hour distribution (L0).
 * Pace bands live under Progress → Volume as a compact vertical chart —
 * keep this card to the hour histogram so it does not stretch into a tall
 * label list.
 *
 * Interaction matches the other bar charts on the page: hover previews on a
 * mouse, tap pins on touch, and the header readout follows the focused bar.
 * Previously the columns were inert spans with only a native `title`, so on a
 * phone nothing happened at all.
 */
export function HabitDistributions({
  hourDistribution,
  paceDistribution: _paceDistribution,
  locale,
  tr,
}: {
  hourDistribution: number[];
  /** Kept for call-site compatibility; rendered under Progress volume instead. */
  paceDistribution: { band: number; count: number }[];
  locale: string;
  tr: (zh: string, en: string) => string;
}) {
  void _paceDistribution;
  void locale;

  const [focus, setFocus] = useState<number | null>(null);

  const hourRows = useMemo(() => {
    const total = hourDistribution.reduce((s, v) => s + v, 0);
    if (!total) return [];
    return hourDistribution
      .map((count, hour) => ({
        hour,
        count,
        pct: (count / total) * 100,
      }))
      .filter((r) => r.count > 0);
  }, [hourDistribution]);

  const peakHour = useMemo(
    () =>
      hourRows.length
        ? hourRows.reduce((best, r) => (r.count > best.count ? r : best))
        : null,
    [hourRows]
  );

  if (!hourRows.length) return null;

  const maxHour = Math.max(1, ...hourRows.map((r) => r.count));
  const focusRow = focus != null ? hourRows[focus] : null;

  return (
    <section className="card summary-section-compact p-4 md:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="progress-q-title">
          {tr('训练习惯', 'Training habits')}
        </h2>
        <div className="progress-q-stat">
          {focusRow ? (
            <>
              <strong>{focusRow.hour}:00</strong>
              {' · '}
              {focusRow.count} {tr('次', 'runs')}
              {' · '}
              {focusRow.pct.toFixed(0)}%
            </>
          ) : peakHour ? (
            <>
              {tr('常在', 'usually')} <strong>{peakHour.hour}:00</strong>
              {' · '}
              {peakHour.count} {tr('次', 'runs')}
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-3 text-[11px] text-[var(--color-muted)]">
        {tr('起跑时刻', 'Start hour')}
      </div>
      <div
        className="progress-habit-bars mt-1.5"
        role="group"
        aria-label={tr('按小时的活动分布', 'Activities by hour of day')}
      >
        {hourRows.map((r, i) => {
          const on = focus === i;
          const peak = r.hour === peakHour?.hour;
          return (
            <button
              key={r.hour}
              type="button"
              className="progress-habit-col"
              aria-pressed={on}
              aria-label={`${r.hour}:00 · ${r.count} ${tr('次', 'runs')}`}
              onPointerEnter={(e) => {
                if (e.pointerType === 'mouse') setFocus(i);
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === 'mouse') {
                  setFocus((cur) => (cur === i ? null : cur));
                }
              }}
              onFocus={() => setFocus(i)}
              onBlur={() => setFocus((cur) => (cur === i ? null : cur))}
              onPointerDown={(e) => {
                if (e.pointerType === 'mouse') return;
                setFocus((cur) => (cur === i ? null : i));
              }}
            >
              <span
                aria-hidden
                className={`progress-habit-bar${peak ? 'is-peak' : ''}${
                  on ? 'is-on' : ''
                }`}
                style={{ height: `${Math.max(3, (r.count / maxHour) * 100)}%` }}
              />
              <span className="progress-habit-tick">{r.hour}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
