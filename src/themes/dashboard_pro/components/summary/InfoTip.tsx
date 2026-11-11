import type { ReactNode } from 'react';

/**
 * Small "?" affordance: long explanations stay out of the default layout and
 * appear on hover / keyboard focus. Uses title as a touch fallback.
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
  return (
    <span className="info-tip">
      <button
        type="button"
        className="info-tip-btn"
        aria-label={label}
        title={text}
      >
        ?
      </button>
      <span className="info-tip-pop" role="tooltip">
        {text}
      </span>
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
