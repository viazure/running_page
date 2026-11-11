/** Capture an element to PNG data URL (html-to-image). */

import { mapHardcodedSvgFill } from './svgThemeFills';

/** Resolve a CSS color (incl. color-mix / vars) to a concrete rgb/hex string. */
function resolveCssColor(value: string, fallback: string): string {
  const v = value.trim();
  if (!v) return fallback;
  if (v.startsWith('#') || v.startsWith('rgb')) return v;
  try {
    const probe = document.createElement('div');
    probe.style.cssText = `position:fixed;left:-9999px;top:0;background:${v}`;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).backgroundColor;
    probe.remove();
    if (resolved && resolved !== 'rgba(0, 0, 0, 0)') return resolved;
  } catch {
    /* ignore */
  }
  return fallback;
}

type FillBackup = {
  el: Element;
  fill: string | null;
  hadFillAttr: boolean;
};

/**
 * Life / github SVGs ship with dark hardcoded fills (#222/#444/…).
 * On-screen CSS remaps them via attribute selectors + CSS variables, but
 * html-to-image often keeps the original attributes — temporarily bake theme
 * colors into the live DOM for the capture, then restore.
 */
function bakeThemeSvgFills(root: HTMLElement): {
  backups: FillBackup[];
  pageBg: string;
  prevRootBg: string;
} {
  const tokenHost =
    root.closest('.summary-life-classic') ??
    root.closest('[data-filter]') ??
    document.documentElement;
  const cs = getComputedStyle(tokenHost);
  const isDark = document.documentElement.classList.contains('dark');

  const card = resolveCssColor(
    cs.getPropertyValue('--color-card') || cs.backgroundColor,
    isDark ? '#151820' : '#ffffff'
  );
  const border = resolveCssColor(
    cs.getPropertyValue('--color-border'),
    isDark ? '#23272e' : '#e8e4de'
  );
  const accent = resolveCssColor(
    cs.getPropertyValue('--color-accent'),
    isDark ? '#8b7cf0' : '#5b4bdb'
  );
  const muted = resolveCssColor(
    cs.getPropertyValue('--color-muted'),
    isDark ? '#8b919c' : '#8a8680'
  );
  const run = resolveCssColor(
    cs.getPropertyValue('--color-run') ||
      cs.getPropertyValue('--svg-special-color'),
    isDark ? '#e8a87c' : '#c45c26'
  );
  const special2 = resolveCssColor(
    cs.getPropertyValue('--svg-special-color2') ||
      cs.getPropertyValue('--color-accent'),
    accent
  );
  const pageBg = resolveCssColor(
    cs.getPropertyValue('--color-bg') ||
      cs.getPropertyValue('--color-background'),
    isDark ? '#0f1218' : '#f7f6f3'
  );

  const palette = { card, border, accent, muted, run, special2 };

  const backups: FillBackup[] = [];
  const remember = (el: Element) => {
    backups.push({
      el,
      fill: el.getAttribute('fill'),
      hadFillAttr: el.hasAttribute('fill'),
    });
  };

  const setFill = (el: Element, value: string) => {
    remember(el);
    el.setAttribute('fill', value);
  };

  root.querySelectorAll('[fill]').forEach((node) => {
    const raw = (node.getAttribute('fill') || '').trim();
    const mapped = mapHardcodedSvgFill(raw, palette);
    if (mapped) setFill(node, mapped);
  });

  root.querySelectorAll('.svg-color-bg').forEach((n) => setFill(n, card));
  root
    .querySelectorAll('.svg-color-inactive-cell')
    .forEach((n) => setFill(n, border));
  root
    .querySelectorAll('.svg-color-active-cell')
    .forEach((n) => setFill(n, accent));
  root.querySelectorAll('.svg-special-color').forEach((n) => setFill(n, run));
  root
    .querySelectorAll('.svg-special-color2')
    .forEach((n) => setFill(n, special2));
  root.querySelectorAll('svg text, .svg-color-text').forEach((n) => {
    setFill(n, muted);
  });

  const prevRootBg = root.style.backgroundColor;
  root.style.backgroundColor = pageBg;

  return { backups, pageBg, prevRootBg };
}

function restoreThemeSvgFills(
  root: HTMLElement,
  backups: FillBackup[],
  prevRootBg: string
) {
  for (let i = backups.length - 1; i >= 0; i -= 1) {
    const b = backups[i];
    if (b.hadFillAttr && b.fill != null) b.el.setAttribute('fill', b.fill);
    else b.el.removeAttribute('fill');
  }
  root.style.backgroundColor = prevRootBg;
}

type SizeBackup = {
  el: SVGSVGElement;
  width: string | null;
  height: string | null;
};

/**
 * Life / github SVGs ship with physical units (`width="200mm"`). html-to-image
 * serialises the clone and lets the browser resolve those units, so a 200mm
 * canvas renders ~944px wide inside a 680px box: the graphic ends up shifted
 * right and clipped. Convert the intrinsic size to the pixel size actually laid
 * out on screen for the duration of the capture.
 */
function pixelateSvgUnits(root: HTMLElement): SizeBackup[] {
  const backups: SizeBackup[] = [];
  root.querySelectorAll('svg').forEach((node) => {
    const svg = node as SVGSVGElement;
    const width = svg.getAttribute('width');
    const height = svg.getAttribute('height');
    if (!width && !height) return;
    const hasPhysicalUnits = /mm|cm|in|pt|pc/.test(
      `${width ?? ''}${height ?? ''}`
    );
    if (!hasPhysicalUnits) return;
    const box = svg.getBoundingClientRect();
    if (!(box.width > 0) || !(box.height > 0)) return;
    backups.push({ el: svg, width, height });
    svg.setAttribute('width', String(Math.round(box.width)));
    svg.setAttribute('height', String(Math.round(box.height)));
  });
  return backups;
}

function restoreSvgUnits(backups: SizeBackup[]) {
  for (const b of backups) {
    if (b.width == null) b.el.removeAttribute('width');
    else b.el.setAttribute('width', b.width);
    if (b.height == null) b.el.removeAttribute('height');
    else b.el.setAttribute('height', b.height);
  }
}

export async function captureCard(element: HTMLElement): Promise<string> {
  const { toPng } = await import('html-to-image');
  const previous = {
    overflow: element.style.overflow,
    width: element.style.width,
    maxWidth: element.style.maxWidth,
    marginInline: element.style.marginInline,
    marginLeft: element.style.marginLeft,
    marginRight: element.style.marginRight,
    scrollLeft: element.scrollLeft,
  };
  const computed = getComputedStyle(element);
  const width = Math.ceil(
    Math.max(
      element.getBoundingClientRect().width,
      element.scrollWidth + parseFloat(computed.paddingRight) + 2
    )
  );
  element.classList.add('exporting');
  element.style.overflow = 'visible';
  element.style.maxWidth = 'none';
  element.style.width = `${width}px`;
  // A centred card (`margin-inline: auto`) is captured together with its side
  // margins, which shifts the whole graphic right inside the output and clips
  // the far edge. Pin it left for the capture. `!important` is required: the
  // theme CSS sets the centring rule with `!important`, so inline styles
  // without it lose.
  const pinMargin = (decl: string, value: string) =>
    element.style.setProperty(decl, value, 'important');
  pinMargin('margin-inline', '0px');
  pinMargin('margin-left', '0px');
  pinMargin('margin-right', '0px');

  const baked = bakeThemeSvgFills(element);
  const sizeBackups = pixelateSvgUnits(element);
  try {
    await document.fonts.ready;
    await new Promise(requestAnimationFrame);
    const bounds = element.getBoundingClientRect();
    // Prefer scroll size so tall share posters are not clipped.
    const exportW = Math.ceil(
      Math.max(bounds.width, element.scrollWidth, width)
    );
    const exportH = Math.ceil(Math.max(bounds.height, element.scrollHeight));
    return await toPng(element, {
      backgroundColor: baked.pageBg,
      width: exportW,
      height: exportH,
      pixelRatio: 2,
      cacheBust: true,
      filter: (node) =>
        !(
          node instanceof HTMLElement && node.hasAttribute('data-export-hidden')
        ),
    });
  } finally {
    restoreSvgUnits(sizeBackups);
    restoreThemeSvgFills(element, baked.backups, baked.prevRootBg);
    element.classList.remove('exporting');
    element.style.overflow = previous.overflow;
    element.style.width = previous.width;
    element.style.maxWidth = previous.maxWidth;
    element.style.marginInline = previous.marginInline;
    element.style.marginLeft = previous.marginLeft;
    element.style.marginRight = previous.marginRight;
    element.scrollLeft = previous.scrollLeft;
  }
}

/** Capture the full card, and restore live layout even if rendering fails. */
export async function exportCard(element: HTMLElement, filename: string) {
  const dataUrl = await captureCard(element);
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
  return dataUrl;
}
