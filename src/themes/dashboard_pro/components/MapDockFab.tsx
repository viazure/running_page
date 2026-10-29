import { createPortal } from 'react-dom';

/**
 * Bookmark edge-peek FAB — mobile / map-dock range only (≤1023px).
 * MapDockFab only mounts while useMobileMapDock is active; RunAnalysis
 * pairs this with `lg:hidden` and a separate desktop centered FAB.
 */
/** ~80%+ peek: only tuck a small right edge so icon + label stay readable. */
export const bookmarkFabClass =
  'fixed right-0 z-[70] flex translate-x-4 cursor-pointer items-center gap-2 rounded-l-full border border-r-0 py-2.5 pl-3.5 pr-5 text-sm font-medium shadow-lg transition-transform duration-200 ease-out hover:translate-x-0 focus-visible:translate-x-0 active:translate-x-0';

/** Desktop (≥1024px / Tailwind `lg`): centered pill FAB. */
export const desktopCenteredFabClass =
  'fixed left-1/2 z-[70] hidden -translate-x-1/2 cursor-pointer items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium shadow-lg transition-transform hover:scale-[1.03] lg:flex';

/** Floating control to show/hide the map after it has scrolled off-screen. */
export function MapDockFab({
  expanded,
  labelShow,
  labelHide,
  onToggle,
  lifted = false,
}: {
  expanded: boolean;
  labelShow: string;
  labelHide: string;
  onToggle: () => void;
  /** Stack above a lower right bookmark (e.g. run-analysis). */
  lifted?: boolean;
}) {
  // Parent only mounts this when useMobileMapDock is active (max-width: 1023px).
  return createPortal(
    <button
      type="button"
      onClick={onToggle}
      style={{
        bottom: lifted
          ? 'calc(4rem + env(safe-area-inset-bottom, 0px))'
          : 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
      }}
      className={`${bookmarkFabClass} border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-text)]`}
      aria-pressed={expanded}
      title={expanded ? labelHide : labelShow}
      aria-label={expanded ? labelHide : labelShow}
    >
      <svg
        className="size-4 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
        />
      </svg>
      {expanded ? labelHide : labelShow}
    </button>,
    document.body
  );
}
