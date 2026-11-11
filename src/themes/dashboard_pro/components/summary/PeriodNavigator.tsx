import { useEffect, useRef, useState } from 'react';

export function PeriodNavigator({
  periodKeys,
  activeKey,
  labelFor,
  selectAria,
  onChange,
  tr,
}: {
  periodKeys: string[];
  activeKey: string;
  labelFor: (key: string) => string;
  selectAria: string;
  onChange: (key: string) => void;
  tr: (zh: string, en: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const idx = periodKeys.indexOf(activeKey);
  const canOlder = idx >= 0 && idx < periodKeys.length - 1;
  const canNewer = idx > 0;
  const label = labelFor(activeKey) || '—';

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="summary-period-nav" ref={rootRef}>
      <button
        type="button"
        className="summary-period-nav-arrow"
        aria-label={tr('上一期（更早）', 'Previous period')}
        disabled={!canOlder}
        onClick={() => {
          if (!canOlder) return;
          setOpen(false);
          onChange(periodKeys[idx + 1]);
        }}
      >
        <span className="summary-period-nav-chevron" aria-hidden="true">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path
              d="M6.5 1.5L3 5l3.5 3.5"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      <button
        type="button"
        className={`summary-period-nav-label ${open ? 'is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={selectAria}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
      </button>
      <button
        type="button"
        className="summary-period-nav-arrow"
        aria-label={tr('下一期（更新）', 'Next period')}
        disabled={!canNewer}
        onClick={() => {
          if (!canNewer) return;
          setOpen(false);
          onChange(periodKeys[idx - 1]);
        }}
      >
        <span className="summary-period-nav-chevron" aria-hidden="true">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path
              d="M3.5 1.5L7 5l-3.5 3.5"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      {open && periodKeys.length > 0 ? (
        <div
          className="summary-period-nav-menu"
          role="listbox"
          aria-label={selectAria}
        >
          {periodKeys.map((k) => {
            const on = k === activeKey;
            return (
              <button
                key={k}
                type="button"
                role="option"
                aria-selected={on}
                className={`summary-period-nav-option ${on ? 'is-active' : ''}`}
                onClick={() => {
                  onChange(k);
                  setOpen(false);
                }}
              >
                {labelFor(k)}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
