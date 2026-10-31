import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';

const MOBILE_MQ = '(max-width: 1023px)';
/** Floating dock offset — Tailwind `top-20`. */
const PIN_TOP_PX = 80;
/** Sticky page header height — shrink IO viewport from the top so a
 *  slot only visible under the header counts as fully away (FAB). */
const HEADER_INSET_PX = 64;
const PIN_IN_MS = 470;
const PIN_OUT_MS = 420;
/** Pin already over the slot — skip exit motion. */
const AT_HOME_PX = 12;
/** Keep slot spacer after unfixed so in-flow height owns layout. */
const HANDOFF_MS = 100;

export type MapDockFrame = {
  left: number;
  width: number;
  height: number;
};

export type MapDockPinMotion = 'in' | 'out' | null;

type PinBox = { top: number; left: number; width: number; height: number };

/**
 * Mobile map dock — Option A (two states, no sticky while expanded).
 *
 * Collapsed: map is normal in-flow. FAB only when the slot is fully away.
 * Expanded: slide-down into `fixed top-20`; stays fixed until FAB
 * collapse (no sticky reseat). Collapse slides out (to slot if on-screen,
 * otherwise up), then releaseToFlow. Spacer keeps document height.
 *
 * Collapse handoff (anti-flash): stay `position:fixed` over the slot until
 * React has switched off `h-full` to the in-flow height class, then drop
 * fixed with matching pixel geometry. Never tween height mid-handoff.
 *
 * Never put CSS `transform` on `pinRef` / map ancestors (Mapbox projection).
 * Never clear `pinMotion === 'in'` from the away/IO path.
 */
export function useMobileMapDock(
  enabled: boolean,
  slotRef: RefObject<HTMLDivElement | null>,
  pinRef: RefObject<HTMLDivElement | null>,
  /** Remount signal (e.g. home allYears vs single year) so observers rebind. */
  layoutKey: string | number | boolean = 0
) {
  const [isMobile, setIsMobile] = useState(false);
  const [outOfView, setOutOfView] = useState(false);
  const [expanded, setExpanded] = useState(false);
  /** Keep slot height after unfixed until in-flow map owns the height. */
  const [holdSpacer, setHoldSpacer] = useState(false);
  const [frame, setFrame] = useState<MapDockFrame | null>(null);
  const [pinMotion, setPinMotion] = useState<MapDockPinMotion>(null);
  const lastHeightRef = useRef(280);
  const pinMotionRef = useRef<MapDockPinMotion>(null);
  const expandedRef = useRef(false);
  const outOfViewRef = useRef(false);
  const lastWrittenTopRef = useRef<number | null>(null);
  const releaseTimerRef = useRef<number | null>(null);
  const handoffRafRef = useRef<number | null>(null);
  /** True while fixed overlay still covers the slot during collapse handoff. */
  const fixedDuringHandoffRef = useRef(false);

  useEffect(() => {
    pinMotionRef.current = pinMotion;
  }, [pinMotion]);

  useEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);

  useEffect(() => {
    outOfViewRef.current = outOfView;
  }, [outOfView]);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(
    () => () => {
      if (releaseTimerRef.current != null) {
        window.clearTimeout(releaseTimerRef.current);
      }
      if (handoffRafRef.current != null) {
        cancelAnimationFrame(handoffRafRef.current);
      }
    },
    []
  );

  const active = enabled && isMobile;

  const readSlotBox = useCallback((): PinBox | null => {
    const slot = slotRef.current;
    if (!slot) return null;
    const rect = slot.getBoundingClientRect();
    if (rect.width <= 1) return null;
    if (rect.height > 1) lastHeightRef.current = rect.height;
    return {
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      height: Math.round(lastHeightRef.current),
    };
  }, [slotRef]);

  const readDockBox = useCallback((): PinBox | null => {
    const slot = readSlotBox();
    if (!slot) return null;
    return { ...slot, top: PIN_TOP_PX };
  }, [readSlotBox]);

  const writePin = useCallback(
    (box: PinBox, transitionMs = 0) => {
      const el = pinRef.current;
      if (!el) return;
      lastWrittenTopRef.current = box.top;
      el.style.position = 'fixed';
      el.style.zIndex = '40';
      el.style.left = `${box.left}px`;
      el.style.width = `${box.width}px`;
      el.style.height = `${box.height}px`;
      if (transitionMs > 0) {
        el.style.transition = `top ${transitionMs}ms ${
          transitionMs === PIN_OUT_MS ? 'ease-in' : 'ease-out'
        }`;
      } else {
        el.style.transition = 'none';
      }
      el.style.top = `${box.top}px`;
    },
    [pinRef]
  );

  /** Drop fixed placement; optionally keep pixel height for handoff. */
  const clearPinInline = useCallback(
    (keepHeight = false) => {
      const el = pinRef.current;
      if (!el) {
        lastWrittenTopRef.current = null;
        fixedDuringHandoffRef.current = false;
        return;
      }
      const heightPx = keepHeight
        ? el.style.height || `${lastHeightRef.current}px`
        : '';
      el.style.position = '';
      el.style.zIndex = '';
      el.style.top = '';
      el.style.left = '';
      el.style.width = '';
      el.style.transition = '';
      el.style.height = heightPx;
      lastWrittenTopRef.current = null;
      fixedDuringHandoffRef.current = false;
    },
    [pinRef]
  );

  const snapshotFrame = useCallback(() => {
    const box = readSlotBox();
    if (!box) return null;
    setFrame({
      left: box.left,
      width: box.width,
      height: box.height,
    });
    return box;
  }, [readSlotBox]);

  /**
   * Begin collapse handoff: snap fixed pin onto the on-screen slot and flip
   * React to in-flow height classes, but KEEP position:fixed until the
   * deferred layout effect sees matching geometry. Dropping fixed too early
   * (or flipping h-full→0) blanks Mapbox for a frame — Tracks「收起」flash.
   */
  const releaseToFlow = useCallback(() => {
    if (releaseTimerRef.current != null) {
      window.clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
    if (handoffRafRef.current != null) {
      cancelAnimationFrame(handoffRafRef.current);
      handoffRafRef.current = null;
    }
    const home = readSlotBox();
    const onScreen =
      !!home && home.top < window.innerHeight && home.top + home.height > 0;
    if (home && onScreen) {
      writePin(home, 0);
      void pinRef.current?.offsetHeight;
      fixedDuringHandoffRef.current = true;
    } else {
      const el = pinRef.current;
      if (el) {
        el.style.transition = 'none';
        if (el.style.position === 'fixed') {
          fixedDuringHandoffRef.current = true;
        }
      }
    }
    setHoldSpacer(true);
    setPinMotion(null);
    // Stay fixed — clearPinInline runs in the handoff layout effect.
    setExpanded(false);
  }, [pinRef, readSlotBox, writePin]);

  /**
   * After expanded flips false, React paints in-flow height (not h-full)
   * while we are still fixed over the slot. Then drop fixed with the same
   * pixel box and only then release the spacer.
   */
  useLayoutEffect(() => {
    if (!active || !holdSpacer || expanded) return;
    if (!fixedDuringHandoffRef.current) {
      // Already unfixed (e.g. inactive teardown) — just clear spacer shortly.
      releaseTimerRef.current = window.setTimeout(() => {
        releaseTimerRef.current = null;
        setHoldSpacer(false);
      }, HANDOFF_MS);
      return () => {
        if (releaseTimerRef.current != null) {
          window.clearTimeout(releaseTimerRef.current);
          releaseTimerRef.current = null;
        }
      };
    }

    const el = pinRef.current;
    const home = readSlotBox();
    if (el && home) {
      const childH = el.firstElementChild?.getBoundingClientRect().height ?? 0;
      const height = childH > 1 ? Math.round(childH) : Math.round(home.height);
      if (height > 1) lastHeightRef.current = height;
      const onScreen =
        home.top < window.innerHeight && home.top + home.height > 0;
      if (onScreen) {
        writePin({ ...home, height }, 0);
      } else {
        el.style.transition = 'none';
        el.style.height = `${height}px`;
      }
    }

    let raf2 = 0;
    let raf3 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        clearPinInline(true);
        raf3 = window.requestAnimationFrame(() => {
          const pin = pinRef.current;
          if (pin) pin.style.height = '';
          releaseTimerRef.current = window.setTimeout(() => {
            releaseTimerRef.current = null;
            setHoldSpacer(false);
            // Mapbox often needs one resize after leaving a fixed layer even
            // when CSS size is unchanged — otherwise the canvas stays blank.
            window.dispatchEvent(new CustomEvent('mobile-map-dock-settled'));
          }, HANDOFF_MS);
        });
      });
    });
    handoffRafRef.current = raf1;

    return () => {
      window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
      if (raf3) window.cancelAnimationFrame(raf3);
      if (handoffRafRef.current === raf1) handoffRafRef.current = null;
      if (releaseTimerRef.current != null) {
        window.clearTimeout(releaseTimerRef.current);
        releaseTimerRef.current = null;
      }
    };
  }, [
    active,
    holdSpacer,
    expanded,
    clearPinInline,
    pinRef,
    readSlotBox,
    writePin,
  ]);

  /**
   * Slot fully away vs in view — drives FAB when collapsed and spacer while
   * expanded. Uses the plain layout placeholder (no sticky on this node).
   * Root top inset = sticky header so a slot only peeking under the title
   * counts as away (show「显示轨迹」). Never clears pinMotion === 'in'.
   */
  useEffect(() => {
    if (!active) {
      setOutOfView(false);
      setExpanded(false);
      setHoldSpacer(false);
      setPinMotion(null);
      fixedDuringHandoffRef.current = false;
      clearPinInline(false);
      return;
    }
    const slot = slotRef.current;
    if (!slot) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          const rect = slot.getBoundingClientRect();
          if (rect.width > 1) {
            if (rect.height > 1) lastHeightRef.current = rect.height;
            setFrame({
              left: Math.round(rect.left),
              width: Math.round(rect.width),
              height: Math.round(lastHeightRef.current),
            });
          }
          setOutOfView(true);
          return;
        }
        setOutOfView(false);
      },
      {
        rootMargin: `-${HEADER_INSET_PX}px 0px 0px 0px`,
        threshold: 0,
      }
    );
    observer.observe(slot);

    const seed = slot.getBoundingClientRect();
    if (seed.width > 1 && seed.height > 1) {
      lastHeightRef.current = seed.height;
      setFrame({
        left: Math.round(seed.left),
        width: Math.round(seed.width),
        height: Math.round(seed.height),
      });
    }
    const away =
      seed.bottom <= HEADER_INSET_PX || seed.top >= window.innerHeight;
    setOutOfView(away);

    return () => observer.disconnect();
  }, [active, layoutKey, slotRef, clearPinInline]);

  // Expanded: keep fixed dock box in sync (always pinned — Option A).
  useEffect(() => {
    if (!active || !expanded) return;
    let raf = 0;
    const sync = () => {
      raf = 0;
      if (pinMotionRef.current != null) return;
      const box = readDockBox();
      if (!box) return;
      const el = pinRef.current;
      // Remount can leave geometry without position:fixed — re-assert full box.
      if (
        el &&
        el.style.position === 'fixed' &&
        lastWrittenTopRef.current != null &&
        Math.abs(lastWrittenTopRef.current - box.top) < 0.5
      ) {
        el.style.left = `${box.left}px`;
        el.style.width = `${box.width}px`;
        el.style.height = `${box.height}px`;
        return;
      }
      writePin(box, 0);
    };
    const onScrollOrResize = () => {
      if (raf) return;
      raf = requestAnimationFrame(sync);
    };
    sync();
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [active, expanded, layoutKey, readDockBox, writePin, pinRef]);

  // Enter / exit motion via `top` (no transform on map ancestors).
  useLayoutEffect(() => {
    if (!active || !expanded || pinMotion == null) return;
    const home = readSlotBox();
    const dock = readDockBox();
    if (!home || !dock) {
      if (pinMotion === 'out') {
        releaseToFlow();
      } else {
        setPinMotion(null);
      }
      return;
    }
    const el = pinRef.current;
    if (!el) return;

    if (pinMotion === 'in') {
      setHoldSpacer(false);
      // Prefer slide-down from above the dock.
      const fromAbove: PinBox = {
        ...dock,
        top: Math.min(home.top, PIN_TOP_PX - dock.height),
      };
      writePin(fromAbove, 0);
      void el.offsetHeight;
      writePin(dock, PIN_IN_MS);
      const t = window.setTimeout(() => {
        if (pinMotionRef.current === 'in') setPinMotion(null);
      }, PIN_IN_MS + 20);
      return () => window.clearTimeout(t);
    }

    // out — stay fixed through the slide, then releaseToFlow (spacer on).
    const slotOnScreen =
      home.top < window.innerHeight && home.top + home.height > 0;
    const alreadyHome =
      lastWrittenTopRef.current != null &&
      Math.abs(lastWrittenTopRef.current - home.top) <= AT_HOME_PX;

    if (alreadyHome && slotOnScreen) {
      releaseToFlow();
      return;
    }

    writePin(dock, 0);
    void el.offsetHeight;

    if (slotOnScreen) {
      // Ease back toward the on-screen slot, then hand off to flow.
      writePin(home, PIN_OUT_MS);
    } else {
      // Off-screen: mirror enter — slide up out of view; spacer keeps the hole.
      setHoldSpacer(true);
      const above: PinBox = {
        ...dock,
        top: PIN_TOP_PX - dock.height,
      };
      writePin(above, PIN_OUT_MS);
    }

    const t = window.setTimeout(() => {
      if (pinMotionRef.current !== 'out') return;
      releaseToFlow();
    }, PIN_OUT_MS + 20);
    return () => window.clearTimeout(t);
  }, [
    active,
    expanded,
    pinMotion,
    readSlotBox,
    readDockBox,
    writePin,
    releaseToFlow,
    pinRef,
  ]);

  useEffect(() => {
    if (!active) return;
    const slot = slotRef.current;
    if (!slot) return;
    const ro = new ResizeObserver(() => {
      const rect = slot.getBoundingClientRect();
      if (rect.height > 1) lastHeightRef.current = rect.height;
      if (expandedRef.current || outOfViewRef.current || holdSpacer) return;
      if (rect.width > 1 && rect.height > 1) {
        setFrame({
          left: Math.round(rect.left),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    });
    ro.observe(slot);
    return () => ro.disconnect();
  }, [active, layoutKey, holdSpacer, slotRef]);

  const expand = useCallback(() => {
    snapshotFrame();
    setHoldSpacer(false);
    fixedDuringHandoffRef.current = false;
    setExpanded(true);
    setPinMotion('in');
  }, [snapshotFrame]);

  const collapse = useCallback(() => {
    if (!expanded) return;
    if (pinMotionRef.current === 'out') return;
    // Smooth exit while still fixed; releaseToFlow runs when motion ends.
    setPinMotion('out');
  }, [expanded]);

  const toggle = useCallback(() => {
    if (expanded) {
      collapse();
      return;
    }
    expand();
  }, [expanded, collapse, expand]);

  /**
   * Auto-collapse once the slot is fully visible again.
   *
   * Option A keeps the dock pinned until the user taps the FAB, so scrolling
   * back to where the in-flow map already fits on screen still showed the
   * floating map.
   *
   * Uses an IntersectionObserver at ratio 1 (root inset by the sticky header)
   * so it fires on the exact frame the slot clears the header — no scroll
   * listener and no layout reads of our own, so the scroll thread stays free.
   * Then hands back with NO motion: at that moment the dock and the slot are
   * a few pixels apart, so a slide would only read as a stray animation, and
   * tweening `top` on a fixed Mapbox canvas costs a layout per frame. The FAB
   * keeps the animated path; this one is silent.
   */
  useEffect(() => {
    if (!active || !expanded) return;
    const slot = slotRef.current;
    if (!slot) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.999) return;
        if (!expandedRef.current || pinMotionRef.current === 'out') return;
        releaseToFlow();
      },
      { rootMargin: `-${HEADER_INSET_PX}px 0px 0px 0px`, threshold: 1 }
    );
    observer.observe(slot);
    return () => observer.disconnect();
  }, [active, expanded, releaseToFlow, slotRef]);

  const showFab = active && (expanded || outOfView || holdSpacer);
  // Reserve slot height while away, expanded (map is fixed), or handing off.
  const lockHeight =
    active && frame != null && (outOfView || expanded || holdSpacer);
  // Option A: always fixed while expanded.
  const pinned = active && expanded && frame != null;
  /** Always false — sticky reseat removed (Option A). */
  const stick = false;
  // h-full ONLY while expanded/fixed. During holdSpacer the pin stays fixed
  // until in-flow height classes paint, then unfixed — never paint h-full on
  // a static pin (that was the h-full→0 white flash after clearPinInline).
  const fillHeight = pinned;

  return {
    active,
    expanded,
    outOfView,
    frame,
    pinMotion,
    showFab,
    lockHeight,
    fillHeight,
    pinned,
    stick,
    expand,
    collapse,
    toggle,
  };
}
