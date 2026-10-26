import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';

const MOBILE_MQ = '(max-width: 1023px)';
/** Ignore IntersectionObserver "enter" blips while layout settles after collapse/expand. */
const INTERSECT_IGNORE_MS = 320;
/** Debounce before treating the slot as stably back in view. */
const ENTER_DEBOUNCE_MS = 160;

export type MapDockFrame = {
  left: number;
  width: number;
  height: number;
};

/**
 * Mobile: when the map slot leaves the viewport, collapse the in-flow height
 * (no blank hole) and offer a FAB to re-show the map as a fixed panel.
 * Desktop (lg+): inactive - caller keeps normal layout.
 *
 * Pass a slot RefObject from the caller (do not return it) so render logic is
 * not flagged by react-hooks/refs.
 */
export function useMobileMapDock(
  enabled: boolean,
  slotRef: RefObject<HTMLDivElement | null>
) {
  const [isMobile, setIsMobile] = useState(false);
  const [outOfView, setOutOfView] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [frame, setFrame] = useState<MapDockFrame | null>(null);
  const lastHeightRef = useRef(280);
  const ignoreIntersectUntilRef = useRef(0);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const active = enabled && isMobile;

  const snapshotFrame = useCallback(() => {
    const slot = slotRef.current;
    if (!slot) return;
    const rect = slot.getBoundingClientRect();
    if (rect.width <= 1) return;
    const height = rect.height > 1 ? rect.height : lastHeightRef.current;
    if (rect.height > 1) lastHeightRef.current = rect.height;
    setFrame({
      left: rect.left,
      width: rect.width,
      height,
    });
  }, [slotRef]);

  useEffect(() => {
    if (!active) {
      setOutOfView(false);
      setExpanded(false);
      return;
    }
    const slot = slotRef.current;
    if (!slot) return;

    let enterTimer: ReturnType<typeof setTimeout> | null = null;

    const clearEnterTimer = () => {
      if (enterTimer != null) {
        clearTimeout(enterTimer);
        enterTimer = null;
      }
    };

    /** Confirm the collapsed sentinel is really back in the dock root. */
    const slotStablyInView = () => {
      const rect = slot.getBoundingClientRect();
      // Match sticky top-16 / rootMargin -64px.
      const rootTop = 64;
      const rootBottom = window.innerHeight;
      return rect.bottom > rootTop && rect.top < rootBottom;
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          clearEnterTimer();
          // Capture size before React collapses the slot to h-px.
          snapshotFrame();
          setOutOfView(true);
          // Collapsing to h-px can briefly re-intersect; ignore that blip.
          ignoreIntersectUntilRef.current =
            performance.now() + INTERSECT_IGNORE_MS;
          return;
        }

        // Intersecting: may be a false positive right after collapse/expand.
        if (performance.now() < ignoreIntersectUntilRef.current) {
          return;
        }

        clearEnterTimer();
        enterTimer = setTimeout(() => {
          enterTimer = null;
          if (performance.now() < ignoreIntersectUntilRef.current) return;
          if (!slotStablyInView()) return;
          setOutOfView(false);
          setExpanded(false);
        }, ENTER_DEBOUNCE_MS);
      },
      // Match sticky top-16 offset so under-header counts as leaving.
      { rootMargin: '-64px 0px 0px 0px', threshold: 0 }
    );
    observer.observe(slot);
    snapshotFrame();
    return () => {
      observer.disconnect();
      clearEnterTimer();
    };
  }, [active, slotRef, snapshotFrame]);

  useEffect(() => {
    if (!active || !outOfView) return;
    const onResize = () => {
      const slot = slotRef.current;
      if (!slot) return;
      const rect = slot.getBoundingClientRect();
      if (rect.width > 1) {
        setFrame({
          left: rect.left,
          width: rect.width,
          height: lastHeightRef.current,
        });
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [active, outOfView, slotRef]);

  const expand = useCallback(() => {
    // Pinning / layout settle must not be undone by a transient IO enter.
    ignoreIntersectUntilRef.current = performance.now() + INTERSECT_IGNORE_MS;
    snapshotFrame();
    setExpanded(true);
  }, [snapshotFrame]);

  const collapse = useCallback(() => {
    ignoreIntersectUntilRef.current = performance.now() + INTERSECT_IGNORE_MS;
    setExpanded(false);
  }, []);

  const toggle = useCallback(() => {
    ignoreIntersectUntilRef.current = performance.now() + INTERSECT_IGNORE_MS;
    // Refresh frame before pin; harmless when collapsing.
    snapshotFrame();
    setExpanded((v) => !v);
  }, [snapshotFrame]);

  // Collapse in-flow height whenever out of view (even while FAB-expanded)
  // so the fixed panel does not leave a blank reserved hole.
  const collapsed = active && outOfView;
  const pinned = active && outOfView && expanded && frame != null;
  const showFab = active && outOfView;

  return {
    collapsed,
    pinned,
    frame,
    expanded,
    showFab,
    expand,
    collapse,
    toggle,
  };
}
