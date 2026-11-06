import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import './ChipScrollRow.css';

export interface ChipScrollRowProps {
  children: ReactNode;
  /** Outer row (relative + optional arrows). */
  className?: string;
  /** Flex row that holds chips (gap / chip utility classes). */
  contentClassName?: string;
  /** CSS color the edge fades blend into (page vs card). */
  fadeFrom?: string;
  /** Desktop chevrons when overflowing. Default true. */
  showArrows?: boolean;
  /** Forwarded to the scroll viewport (e.g. role / aria). */
  viewportProps?: HTMLAttributes<HTMLDivElement>;
}

type ScrollFlags = {
  overflow: boolean;
  canLeft: boolean;
  canRight: boolean;
};

const EPS = 1;

function readFlags(el: HTMLElement): ScrollFlags {
  const { scrollLeft, scrollWidth, clientWidth } = el;
  const overflow = scrollWidth > clientWidth + EPS;
  return {
    overflow,
    canLeft: overflow && scrollLeft > EPS,
    canRight: overflow && scrollLeft + clientWidth < scrollWidth - EPS,
  };
}

/**
 * Horizontal chip strip: native scrollbar hidden (no layout jump), edge fades
 * when content overflows, optional desktop arrows. Wheel (incl. Shift+wheel /
 * trackpad) and touch drag still pan.
 */
export function ChipScrollRow({
  children,
  className = '',
  contentClassName = '',
  fadeFrom = 'var(--color-bg)',
  showArrows = true,
  viewportProps,
}: ChipScrollRowProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [flags, setFlags] = useState<ScrollFlags>({
    overflow: false,
    canLeft: false,
    canRight: false,
  });

  const update = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    setFlags(readFlags(el));
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    update();
    const onScroll = () => update();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, [update, children]);

  // Vertical wheel → horizontal pan when the strip overflows (desktop).
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth + EPS) return;
      const dy = e.deltaY;
      const dx = e.deltaX;
      // Trackpad already sends deltaX; don't double-apply.
      if (Math.abs(dx) > Math.abs(dy)) return;
      if (dy === 0) return;
      el.scrollLeft += dy;
      e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [children]);

  const scrollByDir = (dir: -1 | 1) => {
    const el = viewportRef.current;
    if (!el) return;
    const step = Math.max(120, Math.floor(el.clientWidth * 0.6));
    el.scrollBy({ left: dir * step, behavior: 'smooth' });
  };

  const style = {
    ['--chip-scroll-fade' as string]: fadeFrom,
  } as CSSProperties;

  const { className: viewportClassName, ...restViewport } = viewportProps ?? {};

  return (
    <div
      className={`chip-scroll-row ${className}`.trim()}
      style={style}
      data-overflow={flags.overflow ? 'true' : 'false'}
      data-can-left={flags.canLeft ? 'true' : 'false'}
      data-can-right={flags.canRight ? 'true' : 'false'}
    >
      <div className="chip-scroll-rail">
        <div
          className="chip-scroll-fade chip-scroll-fade-left"
          aria-hidden
          data-export-hidden
        />
        <div
          className="chip-scroll-fade chip-scroll-fade-right"
          aria-hidden
          data-export-hidden
        />

        {showArrows ? (
          <button
            type="button"
            className="chip-scroll-arrow chip-scroll-arrow-left"
            aria-label="Scroll chips left"
            data-export-hidden
            disabled={!flags.canLeft}
            onClick={() => scrollByDir(-1)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        ) : null}

        <div
          ref={viewportRef}
          className={`chip-scroll-viewport ${viewportClassName ?? ''}`.trim()}
          {...restViewport}
        >
          <div className={`chip-scroll-content ${contentClassName}`.trim()}>
            {children}
          </div>
        </div>

        {showArrows ? (
          <button
            type="button"
            className="chip-scroll-arrow chip-scroll-arrow-right"
            aria-label="Scroll chips right"
            data-export-hidden
            disabled={!flags.canRight}
            onClick={() => scrollByDir(1)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}
