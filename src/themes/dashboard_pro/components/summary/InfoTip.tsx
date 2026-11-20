import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

/**
 * Small "?" affordance: long explanations stay out of the default layout and
 * appear on hover / keyboard focus.
 *
 * The bubble renders in a portal on `document.body` with `position: fixed`.
 * Summary panels are scroll containers (`overflow-y: auto` / `overflow: hidden`),
 * so an absolutely positioned child was clipped by the panel edge — measured at
 * 290-685px of clipping for the lower cards. Portal + fixed escapes every
 * clipping ancestor, and placement flips the bubble above the button when the
 * space below is too small.
 *
 * Not a native `title`: that duplicated the bubble on desktop and could not be
 * styled. Clicking / focusing the button opens it, which also covers touch.
 *
 * Position is written straight to the node instead of kept in state: measuring
 * inside an effect then calling setState would add a cascading re-render (and an
 * `@eslint-react/set-state-in-effect` warning) for a purely visual adjustment.
 *
 * Prefer placing next to the section title via `SectionTitle`.
 */

const GAP = 8;
const VIEWPORT_PAD = 12;

export function InfoTip({
  text,
  label = '说明',
}: {
  text: string;
  label?: string;
}) {
  const tipId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  /** Measure the live bubble and clamp it inside the viewport. */
  const place = useCallback(() => {
    const button = buttonRef.current;
    const pop = popRef.current;
    if (!button || !pop) return;

    const anchor = button.getBoundingClientRect();
    const width = pop.offsetWidth;
    const height = pop.offsetHeight;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Left-align to the button, then pull back inside the viewport.
    const left = Math.max(
      VIEWPORT_PAD,
      Math.min(anchor.left, viewportWidth - width - VIEWPORT_PAD)
    );

    const belowTop = anchor.bottom + GAP;
    const aboveTop = anchor.top - GAP - height;
    const fitsBelow = belowTop + height <= viewportHeight - VIEWPORT_PAD;
    const fitsAbove = aboveTop >= VIEWPORT_PAD;
    const placement = !fitsBelow && fitsAbove ? 'above' : 'below';

    pop.dataset.placement = placement;
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(placement === 'above' ? aboveTop : belowTop)}px`;
  }, []);

  // Runs before paint, so the bubble never flashes at an unmeasured position.
  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, place, text]);

  // Panels scroll independently; follow the button (capture catches inner
  // scroll containers, plain `window` scroll does not).
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

  const close = useCallback(() => setOpen(false), []);

  return (
    <span className="info-tip">
      <button
        ref={buttonRef}
        type="button"
        className="info-tip-btn"
        aria-label={label}
        aria-describedby={open ? tipId : undefined}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') setOpen(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') close();
        }}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') close();
        }}
      >
        ?
      </button>
      {open
        ? createPortal(
            <div
              ref={popRef}
              id={tipId}
              role="tooltip"
              className="info-tip-pop"
            >
              {text}
            </div>,
            document.body
          )
        : null}
    </span>
  );
}

/** Title row: heading + optional tip, with optional right-side meta. */
export function SectionTitle({
  title,
  tip,
  right,
}: {
  title: string;
  tip?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <h2 className="progress-q-title">{title}</h2>
        {tip ? <InfoTip text={tip} /> : null}
      </div>
      {right ?? null}
    </div>
  );
}
