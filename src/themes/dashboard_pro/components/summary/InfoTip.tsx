import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFixedPopover } from '../../hooks/useFixedPopover';

/**
 * Small "?" affordance: long explanations stay out of the default layout and
 * appear on hover / keyboard focus.
 *
 * The bubble renders in a portal on `document.body` with `position: fixed`.
 * Summary panels are scroll containers (`overflow-y: auto` / `overflow: hidden`),
 * so an absolutely positioned child was clipped by the panel edge — measured at
 * 290-685px of clipping for the lower cards. Placement lives in
 * `useFixedPopover`, which flips the bubble above the button when the space
 * below is too small.
 *
 * Not a native `title`: that duplicated the bubble on desktop and could not be
 * styled. Clicking / focusing the button opens it, which also covers touch.
 *
 * Prefer placing next to the section title via `SectionTitle`.
 */

export function InfoTip({
  text,
  label = '说明',
}: {
  text: string;
  label?: string;
}) {
  const tipId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const { popRef } = useFixedPopover(buttonRef, open, undefined, text);

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
