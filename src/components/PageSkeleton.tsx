/** Shared pulse block for first-paint skeletons */
function Block({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-[var(--color-card,#161b22)] ${className}`}
      style={{ border: '1px solid var(--color-border, #30363d)' }}
    />
  );
}

/** Full-page shell used while theme chunk or activity data is loading */
export function PageSkeleton() {
  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: 'var(--color-bg, #0d1117)',
        color: 'var(--color-muted, #8b949e)',
      }}
    >
      <header
        className="sticky top-0 z-50 border-b px-4 py-4 md:px-6"
        style={{ borderColor: 'var(--color-border, #30363d)' }}
      >
        <div className="mx-auto flex max-w-[1400px] items-center justify-between">
          <div
            className="h-6 w-36 animate-pulse rounded"
            style={{ backgroundColor: 'var(--color-card, #161b22)' }}
          />
          <div className="flex gap-4">
            <div
              className="hidden h-4 w-10 animate-pulse rounded md:block"
              style={{ backgroundColor: 'var(--color-card, #161b22)' }}
            />
            <div
              className="hidden h-4 w-10 animate-pulse rounded md:block"
              style={{ backgroundColor: 'var(--color-card, #161b22)' }}
            />
            <div
              className="h-8 w-8 animate-pulse rounded-lg"
              style={{ backgroundColor: 'var(--color-card, #161b22)' }}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6 md:px-6">
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px]">
          <div className="min-w-0 space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Block className="h-24" />
              <Block className="h-24" />
              <Block className="col-span-2 h-24 sm:col-span-1" />
            </div>
            <Block className="h-40" />
            <Block className="h-72" />
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            <Block className="h-36" />
            <Block className="h-56" />
            <Block className="h-80" />
          </div>
        </div>
      </main>
    </div>
  );
}

/** Content-area only (header already visible) */
export function DashboardContentSkeleton() {
  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6 md:px-6">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px]">
        <div className="min-w-0 space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Block className="h-24" />
            <Block className="h-24" />
            <Block className="col-span-2 h-24 sm:col-span-1" />
          </div>
          <Block className="h-40" />
          <Block className="h-72" />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <Block className="h-36" />
          <Block className="h-56" />
          <Block className="h-80" />
        </div>
      </div>
    </main>
  );
}
