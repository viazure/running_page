/** Approved analysis-page chart chrome (style preview v2 + compare controls). */

/** Pure line (no area fill), including HR "zone line" mode. */
export const ANALYSIS_LINE_STROKE_WIDTH = 2.25;
/** Area-mode top edge: solid same-color stroke, 100% opacity. */
export const ANALYSIS_AREA_STROKE_WIDTH = 2.5;

export type AreaFillOpacities = { top: number; bottom: number };

/** Single-chart area fill: one color, heavier at the data edge, a bit more open at the baseline. */
export const ANALYSIS_AREA_FILL: AreaFillOpacities = {
  top: 0.52,
  bottom: 0.28,
};
/** Compare area fill: lighter so two fills do not muddy. Top edge stays 2.5px solid. */
export const ANALYSIS_COMPARE_AREA_FILL: AreaFillOpacities = {
  top: 0.22,
  bottom: 0.12,
};

export function areaFillOpacities(compare: boolean): AreaFillOpacities {
  return compare ? ANALYSIS_COMPARE_AREA_FILL : ANALYSIS_AREA_FILL;
}

/** Area series uses the 2.5px top edge; a pure line stays 2.25px. */
export function seriesStrokeWidth(isAreaSeries: boolean): number {
  return isAreaSeries ? ANALYSIS_AREA_STROKE_WIDTH : ANALYSIS_LINE_STROKE_WIDTH;
}

/** HR zone-colored stroke is only for "zone line" mode, never mixed into area fill. */
export function usesHrZoneStroke(
  hrDrawStyle: 'fill' | 'zones',
  hasOverlay: boolean
): boolean {
  return hrDrawStyle === 'zones' && !hasOverlay;
}

/** Form-chart background bands may fade; mid of the approved 3.5%–6% range. */
export const ANALYSIS_DYNAMICS_BAND_OPACITY = 0.045;

/**
 * Form / scatter trial: 5px dots at opacity 0.68. Tailwind has size-1
 * (4px) and size-1.5 (6px) but no 5px step, so use an arbitrary
 * `size-[5px]` (width/height: 5px) rather than rem-based size-1.25.
 * Soften vs the original 6px / 0.92; zone colors and every point stay.
 */
export const ANALYSIS_FORM_DOT_SIZE_PX = 5;
export const ANALYSIS_FORM_DOT_SIZE_CLASS = 'size-[5px]';
export const ANALYSIS_FORM_DOT_CLASS =
  'pointer-events-none absolute size-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full';
export const ANALYSIS_FORM_DOT_OPACITY = 0.68;

/**
 * Compact capsule selectors: 44px tap target on a phone, visually flat
 * on desktop. Same height pattern as 距离/时间 and 每公里/设备圈.
 */
export const ANALYSIS_SELECTOR_CLASS =
  'min-h-11 cursor-pointer appearance-none rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-3.5 py-2 pr-7 text-[11px] leading-tight text-[var(--color-text)] outline-none transition-colors md:min-h-0 md:px-3 md:py-1 md:pr-6 focus-visible:ring-1 focus-visible:ring-[var(--color-border)]';

export const ANALYSIS_OVERFLOW_BUTTON_CLASS =
  'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-2.5 py-2 text-[13px] leading-none text-[var(--color-muted)] outline-none transition-colors hover:text-[var(--color-text)] md:min-h-0 md:min-w-0 md:px-2 md:py-1 focus-visible:ring-1 focus-visible:ring-[var(--color-border)]';

export const ANALYSIS_SELECT_CHEVRON: {
  backgroundImage: string;
  backgroundRepeat: 'no-repeat';
  backgroundPosition: string;
} = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")",
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 0.45rem center',
};

/**
 * Pace / power restored to the original series colors.
 * HR stays on the muted v2 red until we are asked to revert it too.
 */
export const ANALYSIS_SERIES_COLORS = {
  pace: '#3b82f6',
  hr: '#C36B66',
  power: '#a855f7',
} as const;

export type CompareRole = 'primary' | 'overlay';

export type CompareSelection = {
  primaryKey: string;
  overlayKey: string;
  overlayIsArea: boolean;
};

export function isCompareOptionDisabled(
  role: CompareRole,
  key: string,
  state: Pick<CompareSelection, 'primaryKey' | 'overlayKey'>
): boolean {
  return role === 'primary'
    ? key === state.overlayKey
    : key === state.primaryKey;
}

/** Change a compare selector. Resets drawing swap; rejects the other role's key. */
export function applyCompareMetricChange(
  state: CompareSelection,
  role: CompareRole,
  nextKey: string
): CompareSelection {
  if (role === 'primary' && nextKey !== state.overlayKey) {
    return { ...state, primaryKey: nextKey, overlayIsArea: false };
  }
  if (role === 'overlay' && nextKey !== state.primaryKey) {
    return { ...state, overlayKey: nextKey, overlayIsArea: false };
  }
  return state;
}

/**
 * "对调面积/折线" swaps which metric is drawn as area vs line.
 * It does not swap the primary/overlay metric assignment.
 */
export function applyOverlayDrawingSwap(
  state: CompareSelection
): CompareSelection {
  return { ...state, overlayIsArea: !state.overlayIsArea };
}

export type CompareSeriesDrawing = {
  primaryHasArea: boolean;
  primaryHasLine: boolean;
  overlayHasArea: boolean;
  overlayHasLine: boolean;
};

/**
 * Compare always keeps an outline on the area series. Clearing the line
 * used to drop HR's border, because hr-area has no fallback linePath.
 */
export function compareSeriesDrawing(
  overlayIsArea: boolean
): CompareSeriesDrawing {
  return {
    primaryHasArea: !overlayIsArea,
    primaryHasLine: true,
    overlayHasArea: overlayIsArea,
    overlayHasLine: true,
  };
}

export type ChartAreaFills = {
  useComparePrimaryArea: boolean;
  useCompareOverlayArea: boolean;
  useSingleArea: boolean;
};

/**
 * Single charts (including hr-area fill) must use the single-area fill only.
 * The compare fill is for overlay mode. Assigning areaPath to primaryArea
 * without this guard painted HR twice.
 */
export function chartAreaFills(hasOverlay: boolean): ChartAreaFills {
  return {
    useComparePrimaryArea: hasOverlay,
    useCompareOverlayArea: hasOverlay,
    useSingleArea: !hasOverlay,
  };
}
