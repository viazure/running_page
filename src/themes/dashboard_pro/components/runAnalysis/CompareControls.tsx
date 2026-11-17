import { useEffect, useId, useRef, useState } from 'react';
import {
  ANALYSIS_OVERFLOW_BUTTON_CLASS,
  ANALYSIS_SELECT_CHEVRON,
  ANALYSIS_SELECTOR_CLASS,
  applyCompareMetricChange,
  applyOverlayDrawingSwap,
  isCompareOptionDisabled,
  type CompareRole,
  type CompareSelection,
} from './analysisChartStyle';

type Tr = (zh: string, en: string) => string;

export type CompareMetricOption = {
  key: string;
  title: string;
};

function MetricSelect({
  role,
  label,
  value,
  options,
  state,
  onChange,
}: {
  role: CompareRole;
  label: string;
  value: string;
  options: CompareMetricOption[];
  state: CompareSelection;
  onChange: (next: CompareSelection) => void;
}) {
  const id = useId();
  return (
    <label className="inline-flex min-w-0 items-center gap-1.5" htmlFor={id}>
      <span className="shrink-0 text-[11px] text-[var(--color-muted)]">
        {label}
      </span>
      <select
        id={id}
        value={value}
        aria-label={label}
        onChange={(e) =>
          onChange(applyCompareMetricChange(state, role, e.target.value))
        }
        className={ANALYSIS_SELECTOR_CLASS}
        style={ANALYSIS_SELECT_CHEVRON}
      >
        {options.map((opt) => (
          <option
            key={`${role}-${opt.key}`}
            value={opt.key}
            disabled={isCompareOptionDisabled(role, opt.key, state)}
          >
            {opt.title}
          </option>
        ))}
      </select>
    </label>
  );
}

function CompareOverflowMenu({ onSwap, tr }: { onSwap: () => void; tr: Tr }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    itemRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={ANALYSIS_OVERFLOW_BUTTON_CLASS}
        aria-label={tr('更多对比选项', 'More compare options')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute top-full left-0 z-20 mt-1 min-w-[11rem] rounded-md border border-[var(--color-border)] bg-[var(--color-card)] py-1 shadow-[var(--shadow-card)]"
        >
          <button
            ref={itemRef}
            type="button"
            role="menuitem"
            className="block w-full cursor-pointer px-3 py-2 text-left text-[12px] text-[var(--color-text)] outline-none hover:bg-[var(--color-sunken)] focus-visible:bg-[var(--color-sunken)]"
            onClick={() => {
              onSwap();
              setOpen(false);
              buttonRef.current?.focus();
            }}
          >
            {tr('对调面积/折线', 'Swap area/line')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** One-row compare selectors plus the overflow menu for 对调面积/折线. */
export function CompareMetricSelectors({
  options,
  state,
  onChange,
  tr,
}: {
  options: CompareMetricOption[];
  state: CompareSelection;
  onChange: (next: CompareSelection) => void;
  tr: Tr;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <MetricSelect
        role="primary"
        label={tr('主指标', 'Primary')}
        value={state.primaryKey}
        options={options}
        state={state}
        onChange={onChange}
      />
      <span className="text-[11px] text-[var(--color-muted)]" aria-hidden>
        /
      </span>
      <MetricSelect
        role="overlay"
        label={tr('叠加', 'Overlay')}
        value={state.overlayKey}
        options={options}
        state={state}
        onChange={onChange}
      />
      <CompareOverflowMenu
        tr={tr}
        onSwap={() => onChange(applyOverlayDrawingSwap(state))}
      />
    </div>
  );
}
