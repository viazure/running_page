import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  handoffHeightClose,
  mapDockFabVisible,
  offscreenPinTop,
  PIN_MOTION_EASING,
  PIN_MOTION_MS,
  pinAlreadyHome,
  pinTransitionFallbackMs,
  slotFullyVisible,
} from './mapDockGeometry';

const MOBILE_MQ = '(max-width: 1023px)';
/** Floating dock offset — Tailwind `top-20`. */
const PIN_TOP_PX = 80;
/** Sticky page header height — shrink IO viewport from the top so a
 *  slot only visible under the header counts as fully away (FAB). */
const HEADER_INSET_PX = 64;
/** Pin already over the slot — skip exit motion. */
const AT_HOME_PX = 12;
/** Fallback only when in-flow height still disagrees after unfixed. */
const HANDOFF_MS = 100;

/**
 * Match `.route-map-play-surface.is-play-sized` /
 * `.card.route-map--playing` mobile play heights.
 */
export function playbackMapHeightPx(): number {
  const vh = window.innerHeight;
  if (window.matchMedia('(min-width: 768px)').matches) {
    return Math.round(Math.min(vh * 0.65, 560));
  }
  return Math.round(Math.min(vh * 0.7, 520));
}

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
 * Collapsed: map is normal in-flow. FAB when scrolled past / lower half
 * peeks under the header — not while the slot is still below the fold.
 * Expanded: slide-down into `fixed top-20`; stays fixed until FAB
 * collapse (no sticky reseat). Collapse slides out (to slot if on-screen,
 * otherwise up), then releaseToFlow. Spacer keeps document height.
 * Enter and exit share PIN_MOTION_MS and ease-out; motion end listens for
 * transitionend with a timeout fallback.
 *
 * Collapse handoff (anti-flash): stay `position:fixed` over the slot until
 * React has switched off `h-full` to the in-flow height class, then drop
 * fixed with matching pixel geometry. Never tween height mid-handoff.
 * If the kept height already matches in-flow, drop the spacer immediately
 * instead of a delayed second layout; keep the delay when heights disagree
 * so the document does not jump.
 *
 * Never put CSS `transform` on `pinRef` / map ancestors (Mapbox projection).
 * Never clear `pinMotion === 'in'` from the away/IO path.
 */
export function useMobileMapDock(
  enabled: boolean,
  slotRef: RefObject<HTMLDivElement | null>,
  pinRef: RefObject<HTMLDivElement | null>,
  /** Remount signal (e.g. home allYears vs single year) so observers rebind. */
  layoutKey: string | number | boolean = 0,
  /**
   * When non-null (chase play surface tall), grow the fixed pin and slot
   * spacer to this height so Mapbox compass stays inside the visible card.
   */
  playHeightPx: number | null = null
) {
  const [isMobile, setIsMobile] = useState(false);
  const [outOfView, setOutOfView] = useState(false);
  /** FAB affordance — stricter than outOfView (ignores below-fold). */
  const [fabVisible, setFabVisible] = useState(false);
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
  const pinTransitionCleanupRef = useRef<(() => void) | null>(null);
  /** True while fixed overlay still covers the slot during collapse handoff. */
  const fixedDuringHandoffRef = useRef(false);
  const holdSpacerRef = useRef(false);
  const playHeightPxRef = useRef<number | null>(playHeightPx);
  /** Idle map height before chase grow — never read from a play-sized spacer. */
  const baseHeightRef = useRef(280);

  useEffect(() => {
    playHeightPxRef.current = playHeightPx;
  }, [playHeightPx]);

  useEffect(() => {
    holdSpacerRef.current = holdSpacer;
  }, [holdSpacer]);

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
      if (pinTransitionCleanupRef.current != null) {
        pinTransitionCleanupRef.current();
        pinTransitionCleanupRef.current = null;
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
    // Slot is a locked spacer while away / expanded / handoff / chasing.
    // Sampling it after stop (playHeight already null, frame still tall) was
    // baking ~70vh into lastHeight — 「显示轨迹」→ play → stop stuck tall.
    const spacerLocked =
      expandedRef.current ||
      outOfViewRef.current ||
      holdSpacerRef.current ||
      playHeightPxRef.current != null;
    if (rect.height > 1 && !spacerLocked) {
      const h = Math.round(rect.height);
      lastHeightRef.current = h;
      baseHeightRef.current = h;
    }
    return {
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      height: Math.round(baseHeightRef.current || lastHeightRef.current),
    };
  }, [slotRef]);

  const readDockBox = useCallback((): PinBox | null => {
    const slot = readSlotBox();
    if (!slot) return null;
    return { ...slot, top: PIN_TOP_PX };
  }, [readSlotBox]);

  /** Dock box for the fixed pin — optionally taller while chasing. */
  const resolveDockBox = useCallback((): PinBox | null => {
    const box = readDockBox();
    if (!box) return null;
    // Non-null playHeightPx enables grow; recompute px so resize stays fresh.
    if (playHeightPxRef.current != null && playHeightPxRef.current > 0) {
      return { ...box, height: playbackMapHeightPx() };
    }
    return box;
  }, [readDockBox]);

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
        el.style.transition = `top ${transitionMs}ms ${PIN_MOTION_EASING}`;
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

  const cancelPinTransitionWait = useCallback(() => {
    if (pinTransitionCleanupRef.current == null) return;
    pinTransitionCleanupRef.current();
    pinTransitionCleanupRef.current = null;
  }, []);

  /** Resolve when `top` finishes, or after a bounded fallback. Cancel skips onDone. */
  const waitForPinTransition = useCallback(
    (el: HTMLElement, durationMs: number, onDone: () => void) => {
      cancelPinTransitionWait();
      let settled = false;
      let fallback = 0;
      const onEnd = (event: TransitionEvent) => {
        if (event.target !== el) return;
        if (event.propertyName !== 'top') return;
        finish();
      };
      const finish = () => {
        if (settled) return;
        settled = true;
        el.removeEventListener('transitionend', onEnd);
        window.clearTimeout(fallback);
        if (pinTransitionCleanupRef.current === cleanup) {
          pinTransitionCleanupRef.current = null;
        }
        onDone();
      };
      const cleanup = () => {
        if (settled) return;
        settled = true;
        el.removeEventListener('transitionend', onEnd);
        window.clearTimeout(fallback);
      };
      fallback = window.setTimeout(finish, pinTransitionFallbackMs(durationMs));
      el.addEventListener('transitionend', onEnd);
      pinTransitionCleanupRef.current = cleanup;
    },
    [cancelPinTransitionWait]
  );

  /**
   * Begin collapse handoff: snap fixed pin onto the on-screen slot and flip
   * React to in-flow height classes, but KEEP position:fixed until the
   * deferred layout effect sees matching geometry. Dropping fixed too early
   * (or flipping h-full→0) blanks Mapbox for a frame — Tracks「收起」flash.
   */
  const releaseToFlow = useCallback(() => {
    cancelPinTransitionWait();
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
  }, [cancelPinTransitionWait, pinRef, readSlotBox, writePin]);

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
      // Handoff after 「显示轨迹」+ chase: always reseat to frozen base height,
      // never the still-tall play surface / spacer.
      const base = Math.round(
        baseHeightRef.current || lastHeightRef.current || home.height || 320
      );
      const height = base;
      lastHeightRef.current = height;
      baseHeightRef.current = height;
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
    const settleMap = () => {
      // Mapbox often needs one resize after leaving a fixed layer even
      // when CSS size is unchanged — otherwise the canvas stays blank.
      window.dispatchEvent(new CustomEvent('mobile-map-dock-settled'));
    };
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        // Resize while still fixed so Mapbox matches the final box before
        // we leave the layer — a post-unfixed resize reads as a tail hitch.
        settleMap();
        const pin = pinRef.current;
        const keptHeight = pin
          ? pin.getBoundingClientRect().height
          : lastHeightRef.current;
        // Card already has in-flow height classes (not h-full) while we
        // are still fixed; that is the height we will wrap to, not only
        // baseHeightRef (which equals the written pin height and made the
        // previous fast path succeed even when CSS wanted a different size).
        const card = pin?.firstElementChild;
        const cardHeight =
          card instanceof HTMLElement
            ? card.getBoundingClientRect().height
            : keptHeight;
        const chasing =
          playHeightPxRef.current != null && playHeightPxRef.current > 0;
        const naturalHeight = chasing
          ? playbackMapHeightPx()
          : Math.round(
              cardHeight ||
                baseHeightRef.current ||
                lastHeightRef.current ||
                keptHeight
            );
        const canReleaseNow =
          !chasing && handoffHeightClose(keptHeight, naturalHeight);
        clearPinInline(true);
        if (pin && canReleaseNow) {
          pin.style.height = '';
        }
        // Keep holdSpacer (transition-none, no play-spring) for one more
        // frame so unfixed + height clear paint at rest first. Dropping
        // the spacer in the same turn re-attached the overshoot spring
        // on the same frame as the layout change.
        raf3 = window.requestAnimationFrame(() => {
          if (canReleaseNow) {
            setHoldSpacer(false);
            return;
          }
          const late = pinRef.current;
          if (late) late.style.height = '';
          releaseTimerRef.current = window.setTimeout(() => {
            releaseTimerRef.current = null;
            setHoldSpacer(false);
            settleMap();
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
   * Slot fully away vs in view — drives spacer while expanded / away.
   * FAB uses mapDockFabVisible (scrolled past / mid under header;
   * hide below-fold). Root top inset = sticky
   * header. Never clears pinMotion === 'in'.
   */
  useEffect(() => {
    if (!active) {
      setOutOfView(false);
      setFabVisible(false);
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
        const rect = slot.getBoundingClientRect();
        setFabVisible(mapDockFabVisible(rect, window.innerHeight));
        if (!entry.isIntersecting) {
          if (rect.width > 1) {
            // Away slot is a spacer — never learn base height from it.
            const height =
              playHeightPxRef.current != null && playHeightPxRef.current > 0
                ? playbackMapHeightPx()
                : Math.round(baseHeightRef.current || lastHeightRef.current);
            setFrame({
              left: Math.round(rect.left),
              width: Math.round(rect.width),
              height,
            });
          }
          setOutOfView(true);
          return;
        }
        setOutOfView(false);
      },
      {
        rootMargin: `-${HEADER_INSET_PX}px 0px 0px 0px`,
        // Extra steps so mid-crossing (lower-half peek) fires reliably.
        threshold: [0, 0.25, 0.5, 0.75, 1],
      }
    );
    observer.observe(slot);

    const seed = slot.getBoundingClientRect();
    if (seed.width > 1 && seed.height > 1) {
      const playing =
        playHeightPxRef.current != null && playHeightPxRef.current > 0;
      const spacerLocked =
        expandedRef.current || outOfViewRef.current || holdSpacerRef.current;
      if (!playing && !spacerLocked) {
        const h = Math.round(seed.height);
        lastHeightRef.current = h;
        baseHeightRef.current = h;
      }
      setFrame({
        left: Math.round(seed.left),
        width: Math.round(seed.width),
        height: playing
          ? playbackMapHeightPx()
          : Math.round(baseHeightRef.current || lastHeightRef.current),
      });
    }
    const away =
      seed.bottom <= HEADER_INSET_PX || seed.top >= window.innerHeight;
    setOutOfView(away);
    setFabVisible(mapDockFabVisible(seed, window.innerHeight));

    return () => observer.disconnect();
  }, [active, layoutKey, slotRef, clearPinInline]);

  // Keep FAB visibility in sync on scroll/resize — IO thresholds alone can
  // miss lower-half enter/leave while the slot stays "intersecting".
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const syncFab = () => {
      raf = 0;
      const slot = slotRef.current;
      if (!slot) return;
      setFabVisible(
        mapDockFabVisible(slot.getBoundingClientRect(), window.innerHeight)
      );
    };
    const onScrollOrResize = () => {
      if (raf) return;
      raf = requestAnimationFrame(syncFab);
    };
    syncFab();
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [active, layoutKey, slotRef]);

  // Expanded: keep fixed dock box in sync (always pinned — Option A).
  useEffect(() => {
    if (!active || !expanded) return;
    let raf = 0;
    const sync = () => {
      raf = 0;
      if (pinMotionRef.current != null) return;
      const box = resolveDockBox();
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
  }, [
    active,
    expanded,
    layoutKey,
    playHeightPx,
    resolveDockBox,
    writePin,
    pinRef,
  ]);

  // Enter / exit motion via `top` (no transform on map ancestors).
  useLayoutEffect(() => {
    if (!active || !expanded || pinMotion == null) return;
    const home = readSlotBox();
    const dock = resolveDockBox();
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
        top: Math.min(home.top, offscreenPinTop(dock.height)),
      };
      writePin(fromAbove, 0);
      void el.offsetHeight;
      if (fromAbove.top === dock.top) {
        writePin(dock, 0);
        setPinMotion(null);
        return;
      }
      writePin(dock, PIN_MOTION_MS);
      waitForPinTransition(el, PIN_MOTION_MS, () => {
        if (pinMotionRef.current === 'in') setPinMotion(null);
      });
      return () => cancelPinTransitionWait();
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

    const target: PinBox = slotOnScreen
      ? home
      : { ...dock, top: offscreenPinTop(dock.height) };
    if (!slotOnScreen) {
      // Off-screen: slide fully above the viewport (not to top-20 - height,
      // which left an 80px strip visible, then a second pop on handoff).
      setHoldSpacer(true);
    }
    if (target.top === dock.top) {
      releaseToFlow();
      return;
    }
    writePin(target, PIN_MOTION_MS);
    waitForPinTransition(el, PIN_MOTION_MS, () => {
      if (pinMotionRef.current !== 'out') return;
      releaseToFlow();
    });
    return () => cancelPinTransitionWait();
  }, [
    active,
    cancelPinTransitionWait,
    expanded,
    pinMotion,
    readSlotBox,
    resolveDockBox,
    writePin,
    releaseToFlow,
    pinRef,
    waitForPinTransition,
  ]);

  useEffect(() => {
    if (!active) return;
    const slot = slotRef.current;
    if (!slot) return;
    const ro = new ResizeObserver(() => {
      const rect = slot.getBoundingClientRect();
      if (
        expandedRef.current ||
        outOfViewRef.current ||
        holdSpacerRef.current
      ) {
        return;
      }
      if (rect.height > 1 && playHeightPxRef.current == null) {
        const h = Math.round(rect.height);
        lastHeightRef.current = h;
        baseHeightRef.current = h;
      }
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

  // Grow / shrink spacer + pin when chase play height toggles.
  // Always restore to baseHeightRef (captured before chase), including the
  // 「显示轨迹」expanded path — stop must shrink the fixed pin, not keep 70vh.
  useLayoutEffect(() => {
    if (!active) return;
    if (playHeightPx != null && playHeightPx > 0) {
      // Freeze idle height once at chase start (slot may already be a spacer).
      if (baseHeightRef.current < 1) {
        baseHeightRef.current = lastHeightRef.current || 320;
      }
    } else {
      // Play ended (or never started): keep lastHeight aligned to frozen base.
      const base = Math.round(
        baseHeightRef.current || lastHeightRef.current || 320
      );
      lastHeightRef.current = base;
    }

    const base = Math.round(
      baseHeightRef.current || lastHeightRef.current || 320
    );

    if (!expanded) {
      if (playHeightPx != null) {
        // Away + chasing: spacer tracks play height so document scroll stays sane.
        setFrame((prev) => {
          if (!prev) return prev;
          const h = playbackMapHeightPx();
          if (prev.height === h) return prev;
          return { ...prev, height: h };
        });
        return;
      }
      setFrame((prev) => {
        if (!prev || prev.height === base) return prev;
        return { ...prev, height: base };
      });
      return;
    }

    const box = resolveDockBox();
    if (!box) return;
    // resolveDockBox uses base via readSlotBox; force height explicitly on stop.
    const next = {
      ...box,
      height: playHeightPx != null ? playbackMapHeightPx() : base,
    };
    setFrame((prev) => {
      if (!prev) {
        return { left: next.left, width: next.width, height: next.height };
      }
      if (
        prev.height === next.height &&
        prev.left === next.left &&
        prev.width === next.width
      ) {
        return prev;
      }
      return {
        ...prev,
        left: next.left,
        width: next.width,
        height: next.height,
      };
    });
    if (pinMotionRef.current == null) {
      writePin(next, 0);
    }
  }, [active, expanded, playHeightPx, resolveDockBox, writePin]);

  const expand = useCallback(() => {
    // Capture idle height only while the map is still in normal document flow.
    // Off-screen 「显示轨迹」uses a locked spacer — trust baseHeightRef instead.
    const slot = slotRef.current;
    if (
      slot &&
      playHeightPxRef.current == null &&
      !outOfViewRef.current &&
      !holdSpacerRef.current
    ) {
      const rect = slot.getBoundingClientRect();
      if (rect.height > 1) {
        const h = Math.round(rect.height);
        lastHeightRef.current = h;
        baseHeightRef.current = h;
      }
    }
    snapshotFrame();
    setHoldSpacer(false);
    fixedDuringHandoffRef.current = false;
    setExpanded(true);
    setPinMotion('in');
  }, [snapshotFrame, slotRef]);

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
   * Near/far split: scrolling back slowly, the slot clears the header while
   * the dock is only ~16px away, so `releaseToFlow` takes it home silently —
   * the motionless handoff the design asks for. A fling can instead land the
   * slot mid-viewport in one frame, hundreds of px from the pin; releasing
   * silently there would teleport the map, so those go through `collapse()`
   * and reuse the tuned exit animation (which itself takes the silent path
   * once the pin is within `AT_HOME_PX` of its slot).
   *
   * Why not `IntersectionObserver` at `threshold: 1`: a ratio only fires when
   * it *crosses* a configured threshold, so a fling that lands inside the
   * fully-visible band in one frame (the review's「一次跳到完整可见区」), a
   * subpixel slot height capping the ratio under 1, or a slot taller than the
   * header-inset root all produced no entry and left the dock pinned. Exact
   * geometry is the reliable test, and it has to run on scroll — hence one
   * capture-phase `scroll` listener: scroll does not bubble, but capture at
   * `window` still sees nested scrollers (Tracks has its own overflow box).
   * One rAF-coalesced rect read per frame, and only while expanded.
   *
   * `armed` requires the slot to leave full view at least once first, so
   * expanding the dock can never be undone by its own entrance frame.
   */
  useEffect(() => {
    if (!active || !expanded) return;
    let raf = 0;
    // `expanded` stays true until React commits, so repeated ticks must not
    // re-enter the collapse.
    let done = false;
    let armed = false;
    const check = () => {
      raf = 0;
      if (done) return;
      // Mid slide-in / slide-out the pin is travelling; the slot being visible
      // then is the motion itself, not the user scrolling back to the map.
      if (pinMotionRef.current != null) return;
      // Chasing keeps the pin deliberately tall and pinned; collapsing here
      // would shrink the play surface out from under the compass.
      if (playHeightPxRef.current != null) return;
      if (!expandedRef.current || holdSpacerRef.current) return;
      const slot = slotRef.current;
      if (!slot) return;
      // One rect read serves both tests: "fully visible yet?" and, once armed
      // and releasing, "is the pin already sitting on it?".
      const rect = slot.getBoundingClientRect();
      if (!slotFullyVisible(rect, window.innerHeight)) {
        armed = true;
        return;
      }
      if (!armed) return;
      done = true;
      // Near the slot → silent handoff (the design's normal scroll-back).
      // Far from it → take the animated exit so the map does not teleport.
      if (pinAlreadyHome(rect.top, lastWrittenTopRef.current)) {
        releaseToFlow();
        return;
      }
      collapse();
    };
    const schedule = () => {
      if (done || raf) return;
      raf = requestAnimationFrame(check);
    };
    schedule();
    window.addEventListener('scroll', schedule, {
      passive: true,
      capture: true,
    });
    window.addEventListener('resize', schedule);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
    };
  }, [
    active,
    collapse,
    expanded,
    pinMotion,
    playHeightPx,
    releaseToFlow,
    slotRef,
  ]);

  const showFab = active && (expanded || fabVisible || holdSpacer);
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
