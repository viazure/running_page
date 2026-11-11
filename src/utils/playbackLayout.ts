/**
 * Playback layout timing constants — dependency-free on purpose.
 *
 * `utils/mapChase3d` imports `mapbox-gl` at module top level, so anything that
 * only needs these numbers must not import from there or the map engine gets
 * pulled into the first-paint static dependency chain.
 */

/**
 * Card height ease: 480ms cubic-bezier(0.34, 1.45, 0.64, 1) (see .route-map-play-spring).
 * Hosts keep .route-map-play-surface at play height for the whole grow/shrink clip
 * (overflow:hidden on the outer shell). Resize once on play start, again at settle;
 * on exit, drop play-sizing then resize at PLAYBACK_LAYOUT_EXIT_RESIZE_MS.
 * Mid-animation resize blanks the WebGL canvas.
 */
export const PLAYBACK_LAYOUT_SETTLE_MS = 520;

/** After exit height clip: surface unsize + one resize (settle + React/layout slack). */
export const PLAYBACK_LAYOUT_EXIT_RESIZE_MS = PLAYBACK_LAYOUT_SETTLE_MS + 80;
