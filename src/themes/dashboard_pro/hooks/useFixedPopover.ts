import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from 'react';

/**
 * Placement for popovers that must escape clipping ancestors.
 *
 * Why this exists: the dashboard panels are scroll containers — `overflow-y:
 * auto`, or `overflow-x-hidden` which browsers silently promote to `auto` on the
 * cross axis. Any `absolute` child that extends past the padding box gets
 * clipped, which is how the goal-card tooltips ended up as a thin white sliver
 * and how the compare menu lost its last items near the bottom of the analysis
 * pane.
 *
 * The fix is always the same: render the bubble in a portal on `document.body`
 * with `position: fixed`, then write `left`/`top` straight to the node. Keeping
 * the coordinates out of React state avoids a cascading re-render (and a
 * `set-state-in-effect` warning) for what is a purely visual adjustment.
 *
 * `fixed` escapes every ancestor's clipping, but it also means the bubble does
 * not scroll with the page — so this re-places it on scroll (capture, to catch
 * inner scrollers) and on resize while it is open.
 */

export type PopoverPlacement = 'above' | 'below';

export interface UseFixedPopoverOptions {
  /** Gap between the anchor and the bubble, in px. */
  gap?: number;
  /** Keep this far from the viewport edges, in px. */
  viewportPadding?: number;
  /** Horizontal alignment relative to the anchor. Default `start`. */
  align?: 'start' | 'end';
  /** Keep both edges inside the viewport even when the bubble is wider. */
  clampHorizontal?: boolean;
}

export interface FixedPopover {
  /** Attach to the bubble element rendered inside the portal. */
  popRef: RefObject<HTMLDivElement | null>;
  /** Call whenever the popover opens or its content changes. */
  place: () => void;
}

/**
 * Measure the live bubble and pin it near `anchor`, flipping above when there
 * is no room below.
 *
 * Runs in `useLayoutEffect` at the call site so the bubble never paints at an
 * unmeasured position, and re-runs on scroll/resize while `open`.
 */
export function useFixedPopover(
  anchorRef: RefObject<HTMLElement | null>,
  open: boolean,
  opts: UseFixedPopoverOptions = {},
  /** Re-place when this changes (e.g. bubble text length changed). */
  contentKey?: unknown
): FixedPopover {
  const {
    gap = 8,
    viewportPadding = 12,
    align = 'start',
    clampHorizontal = true,
  } = opts;
  const popRef = useRef<HTMLDivElement | null>(null);

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const pop = popRef.current;
    if (!anchor || !pop) return;

    const rect = anchor.getBoundingClientRect();
    const width = pop.offsetWidth;
    const height = pop.offsetHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Horizontal: align to the anchor edge, then pull back inside the viewport.
    const preferredLeft = align === 'end' ? rect.right - width : rect.left;
    const minLeft = viewportPadding;
    const maxLeft = viewportWidth - width - viewportPadding;
    const left = clampHorizontal
      ? Math.max(minLeft, Math.min(preferredLeft, maxLeft))
      : Math.max(minLeft, preferredLeft);

    // Vertical: prefer below, flip above when below would be cut off.
    const belowTop = rect.bottom + gap;
    const aboveTop = rect.top - gap - height;
    const fitsBelow = belowTop + height <= viewportHeight - viewportPadding;
    const fitsAbove = aboveTop >= viewportPadding;
    const placement: PopoverPlacement =
      !fitsBelow && fitsAbove ? 'above' : 'below';
    const top = placement === 'above' ? aboveTop : belowTop;

    pop.dataset.placement = placement;
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
  }, [anchorRef, align, clampHorizontal, gap, viewportPadding]);

  // Before paint, so there is no flash at the default position. `contentKey` is
  // a deliberate re-place trigger rather than a value read here.
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place, contentKey]);

  // Follow the anchor: capture catches inner scroll containers, which do not
  // bubble to `window`.
  useEffect(() => {
    if (!open) return;
    const onMove = () => place();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, place]);

  return { popRef, place };
}
