/** Floating dock offset — Tailwind `top-20`. */
export const PIN_TOP_PX = 80;
/** Sticky page header height — anything under it reads as scrolled away. */
export const HEADER_INSET_PX = 64;
/** Pin already over the slot — skip exit motion. */
export const AT_HOME_PX = 12;
/**
 * Auto-collapse hands back silently only when the pinned dock already sits
 * within this many px of its slot. Scrolling back to the map crosses the
 * header inset (~16px above the dock's `top-20`), so the normal path stays
 * motionless; a fling that lands the slot mid-viewport is farther away and
 * takes the animated collapse instead of snapping.
 */
export const AUTO_SNAP_PX = 32;

type Rect = {
  top: number;
  bottom: number;
  width: number;
  height: number;
};

/**
 * Slot sits fully inside the viewport, below the sticky header.
 *
 * Pure geometry on purpose: `IntersectionObserver` with `threshold: 1` only
 * fires when the ratio *crosses* 1, so a fling that lands in the
 * fully-visible band in one frame (or a subpixel slot height capping the
 * ratio at 0.999) produced no entry and left the dock pinned. A sampled rect
 * has no crossing semantics to miss.
 *
 * The 1px slack absorbs subpixel rects (`top: 63.996`) that are visually but
 * not numerically clear of the header.
 */
export function slotFullyVisible(rect: Rect, viewBottom: number): boolean {
  if (rect.width < 1 || rect.height < 1 || viewBottom < 1) return false;
  return rect.top >= HEADER_INSET_PX - 1 && rect.bottom <= viewBottom + 1;
}

/**
 * When the collapsed map FAB may appear.
 * - Still below the fold → hide (homepage must not flash「显示轨迹」).
 * - Fully above the header → show (scrolled past — tap brings the map back).
 * - Midpoint at/above the header while bottom still peeks → show
 *   (lower half in the visible area).
 */
export function mapDockFabVisible(rect: Rect, viewBottom: number): boolean {
  const viewTop = HEADER_INSET_PX;
  if (rect.width < 1 || rect.height < 1 || viewBottom < 1) return false;
  if (rect.top >= viewBottom) return false;
  if (rect.bottom <= viewTop) return true;
  const mid = rect.top + rect.height * 0.5;
  return mid <= viewTop;
}

/**
 * The pin is close enough to its slot to be handed back with no motion.
 * A far jump would read as the map teleporting, so it takes the animated exit.
 */
export function pinAlreadyHome(
  slotTop: number,
  lastWrittenTop: number | null
): boolean {
  if (lastWrittenTop == null) return false;
  return Math.abs(slotTop - lastWrittenTop) <= AUTO_SNAP_PX;
}
