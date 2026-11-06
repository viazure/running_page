import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useLocale } from '@/hooks/useLocale';
import { localizeMolTitle } from './localizeMolTitle';
import tipStyles from './SvgTitleTipHost.module.css';

type Tip = {
  /** Raw SVG <title> text; localize at render so locale flips need no setState. */
  raw: string;
  left: number;
  top: number;
};

function readTitle(el: Element | null, host: HTMLElement): string | null {
  let node: Element | null = el;
  while (node && node !== host) {
    if (node instanceof SVGElement) {
      for (let i = 0; i < node.children.length; i += 1) {
        const child = node.children[i];
        if (
          child.tagName.toLowerCase() === 'title' &&
          child.textContent?.trim()
        ) {
          return child.textContent.trim();
        }
      }
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Life / year-summary SVGs expose data via native SVG title (desktop hover).
 * Mobile has no hover tooltip — pin an HTML tip on tap; tap again / empty to clear.
 * Age segment "(N years old)" is rewritten from i18n for both native title and tip.
 */
export function SvgTitleTipHost({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState<Tip | null>(null);
  const { t } = useLocale();
  const yearsOldTpl = t('yearsOld');

  const localize = useCallback(
    (raw: string) => localizeMolTitle(raw, yearsOldTpl),
    [yearsOldTpl]
  );

  // Rewrite every SVG <title> so desktop native hover matches the mobile tip.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const apply = () => {
      host.querySelectorAll('title').forEach((el) => {
        const src =
          el.getAttribute('data-title-src') ?? el.textContent?.trim() ?? '';
        if (!src) return;
        if (!el.hasAttribute('data-title-src')) {
          el.setAttribute('data-title-src', src);
        }
        const next = localize(src);
        if (el.textContent !== next) el.textContent = next;
      });
    };

    apply();
    const mo = new MutationObserver(apply);
    mo.observe(host, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [localize]);

  const placeFromEvent = useCallback(
    (e: ReactPointerEvent, raw: string): Tip => {
      const host = hostRef.current!;
      const rect = host.getBoundingClientRect();
      return {
        raw,
        left: e.clientX - rect.left,
        top: e.clientY - rect.top,
      };
    },
    []
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse') return;
      const host = hostRef.current;
      if (!host) return;
      const raw = readTitle(e.target as Element, host);
      if (!raw) {
        setPinned(null);
        return;
      }
      e.stopPropagation();
      setPinned((prev) => (prev?.raw === raw ? null : placeFromEvent(e, raw)));
    },
    [placeFromEvent]
  );

  return (
    <div
      ref={hostRef}
      className={`${tipStyles.host}${className ? ` ${className}` : ''}`}
      onPointerDown={onPointerDown}
    >
      {children}
      {pinned ? (
        <div
          className={tipStyles.tip}
          style={{ left: pinned.left, top: pinned.top }}
          role="tooltip"
          data-export-hidden
        >
          {localize(pinned.raw)}
        </div>
      ) : null}
    </div>
  );
}
