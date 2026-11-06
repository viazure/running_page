import { useLocale } from '@/hooks/useLocale';

const STAT_ROW_KEYS = ['acts', 'dist', 'time', 'pace'] as const;
const YEAR_PILL_KEYS = ['y0', 'y1', 'y2', 'y3', 'y4', 'y5'] as const;
const THUMB_KEYS = Array.from({ length: 40 }, (_, i) => `t${i}`);

/**
 * Eager shell for lazy TracksPage Suspense — geometry matches TracksPage success
 * layout (back/title + lg:[340px_1fr] + stats + map h-[320/360] + year bar + thumbs).
 * Must stay outside the TracksPage chunk so hard-nav/hard-refresh never paints null.
 */
export function TracksPageSkeleton() {
  const { locale } = useLocale();
  const mapLabel = locale === 'zh' ? '地图加载中' : 'Loading map';

  return (
    <div
      className="mx-auto flex h-full min-h-0 w-full max-w-[1400px] flex-col overflow-y-auto overscroll-contain px-4 py-6 md:px-6 lg:overflow-hidden"
      aria-busy="true"
      aria-label={locale === 'zh' ? '轨迹加载中' : 'Loading tracks'}
    >
      {/* Top bar: back + title — same mb/gap as TracksPage */}
      <div className="mb-5 flex shrink-0 items-center gap-4">
        <div
          className="h-4 w-14 animate-pulse rounded bg-[var(--color-sunken)]"
          aria-hidden
        />
        <div
          className="h-5 w-24 animate-pulse rounded bg-[var(--color-sunken)]"
          aria-hidden
        />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 items-start gap-5 lg:grid-cols-[340px_1fr] lg:items-stretch lg:overflow-hidden">
        {/* Left column mirrors TracksPage contents/flex stack */}
        <div className="contents lg:flex lg:flex-col lg:gap-4">
          {/* Stats card */}
          <div className="card order-1 space-y-3 p-4 lg:order-none">
            <div
              className="mb-1 h-2.5 w-12 animate-pulse rounded bg-[var(--color-sunken)]"
              aria-hidden
            />
            {STAT_ROW_KEYS.map((id, i) => (
              <div key={id} className="space-y-1.5">
                <div
                  className="h-2 w-10 animate-pulse rounded bg-[var(--color-sunken)]"
                  style={{ animationDelay: `${i * 40}ms` }}
                  aria-hidden
                />
                <div
                  className="h-7 w-20 animate-pulse rounded bg-[var(--color-sunken)]"
                  style={{ animationDelay: `${i * 40 + 20}ms` }}
                  aria-hidden
                />
              </div>
            ))}
          </div>

          {/* Map: fixed idle height — never collapse; faint loading cue */}
          <div className="card order-2 flex h-[320px] items-center justify-center overflow-hidden bg-[var(--color-sunken)]/50 md:h-[360px] lg:order-none">
            <span className="text-[11px] text-[var(--color-muted)] opacity-40">
              {mapLabel}
            </span>
          </div>
        </div>

        {/* Right: year chip strip height + thumb grid (success clustering geometry) */}
        <div className="order-4 min-w-0 lg:order-none">
          <div className="card p-4">
            <div className="mb-4 space-y-2.5 border-b border-[var(--color-border)] pb-3">
              <div className="flex min-w-0 items-center gap-2">
                <div className="-mx-1 flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-hidden px-1">
                  {YEAR_PILL_KEYS.map((id, i) => (
                    <div
                      key={id}
                      className="h-7 w-12 shrink-0 animate-pulse rounded-full bg-[var(--color-sunken)]"
                      style={{ animationDelay: `${i * 30}ms` }}
                      aria-hidden
                    />
                  ))}
                </div>
                <div
                  className="h-6 w-6 shrink-0 animate-pulse rounded bg-[var(--color-sunken)]"
                  aria-hidden
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-1">
              {THUMB_KEYS.map((id, i) => (
                <div
                  key={id}
                  className="h-[72px] w-[72px] animate-pulse rounded bg-[var(--color-sunken)] md:h-[80px] md:w-[80px]"
                  style={{ animationDelay: `${i * 20}ms` }}
                  aria-hidden
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
