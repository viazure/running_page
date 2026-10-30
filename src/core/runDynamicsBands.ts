/**
 * Garmin-style running-dynamics percentile bands (purple best → red).
 * Thresholds are configurable constants for the open-source config surface.
 */

export type DynamicsMetric = 'gct' | 'vo' | 'vr' | 'cadence';

/** Purple (>95) → blue (70–95) → green (30–69) → orange (5–29) → red (<5). */
export const DYNAMICS_BAND_COLORS = [
  '#a855f7', // purple — best
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // orange
  '#ef4444', // red — worst
] as const;

export type DynamicsBand = {
  /** Inclusive lower bound; null = −∞ */
  lo: number | null;
  /** Exclusive upper bound except last; null = +∞ */
  hi: number | null;
  /** Higher is better (cadence) vs lower is better (GCT/VO/VR). */
};

/**
 * Band edges from Garmin help screenshots.
 * Index 0 = best (purple), 4 = worst (red).
 * GCT/VO/VR: lower better. Cadence: higher better.
 */
export const DYNAMICS_BANDS: Record<DynamicsMetric, number[]> = {
  // GCT ms: <208 / 208–240 / 241–272 / 273–305 / >305
  gct: [208, 241, 273, 306],
  // VO cm: <6.4 / 6.4–8.1 / 8.1–9.7 / 9.7–11.5 / >11.5
  vo: [6.4, 8.1, 9.7, 11.5],
  // VR %: <6.1 / 6.1–7.4 / 7.4–8.6 / 8.6–10.1 / >10.1
  vr: [6.1, 7.4, 8.6, 10.1],
  // Cadence spm: >185 / 174–185 / 163–173 / 151–162 / <151
  // Stored as ascending cut points for lower-is-worse indexing after flip.
  cadence: [151, 163, 174, 186],
};

/** Cadence: higher better — reverse the colour index. */
const HIGHER_IS_BETTER: Record<DynamicsMetric, boolean> = {
  gct: false,
  vo: false,
  vr: false,
  cadence: true,
};

export function dynamicsBandIndex(
  metric: DynamicsMetric,
  value: number | null | undefined
): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const cuts = DYNAMICS_BANDS[metric];
  let i = 0;
  while (i < cuts.length && value >= cuts[i]) i += 1;
  // i = 0..4 where 0 is below first cut (best for GCT/VO/VR, worst for cadence)
  if (HIGHER_IS_BETTER[metric]) {
    return cuts.length - i; // 4..0 → map so high cadence → 0 (purple)
  }
  return i;
}

export function dynamicsBandColor(
  metric: DynamicsMetric,
  value: number | null | undefined
): string | null {
  const idx = dynamicsBandIndex(metric, value);
  if (idx == null) return null;
  return DYNAMICS_BAND_COLORS[Math.max(0, Math.min(4, idx))];
}

export function dynamicsBandLabels(
  metric: DynamicsMetric
): { label: string; color: string }[] {
  const c = DYNAMICS_BAND_COLORS;
  switch (metric) {
    case 'gct':
      return [
        { label: '<208', color: c[0] },
        { label: '208–240', color: c[1] },
        { label: '241–272', color: c[2] },
        { label: '273–305', color: c[3] },
        { label: '>305', color: c[4] },
      ];
    case 'vo':
      return [
        { label: '<6.4', color: c[0] },
        { label: '6.4–8.1', color: c[1] },
        { label: '8.1–9.7', color: c[2] },
        { label: '9.7–11.5', color: c[3] },
        { label: '>11.5', color: c[4] },
      ];
    case 'vr':
      return [
        { label: '<6.1', color: c[0] },
        { label: '6.1–7.4', color: c[1] },
        { label: '7.4–8.6', color: c[2] },
        { label: '8.6–10.1', color: c[3] },
        { label: '>10.1', color: c[4] },
      ];
    case 'cadence':
      return [
        { label: '>185', color: c[0] },
        { label: '174–185', color: c[1] },
        { label: '163–173', color: c[2] },
        { label: '151–162', color: c[3] },
        { label: '<151', color: c[4] },
      ];
  }
}

/** Value ranges for each band (best→worst), clipped to [plotLo, plotHi]. */
export function dynamicsBandRanges(
  metric: DynamicsMetric,
  plotLo: number,
  plotHi: number
): { lo: number; hi: number; color: string }[] {
  const cuts = DYNAMICS_BANDS[metric];
  const edges: (number | null)[] = [null, ...cuts, null];
  const out: { lo: number; hi: number; color: string }[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const rawLo = edges[i];
    const rawHi = edges[i + 1];
    const mid =
      rawLo == null && rawHi == null
        ? (plotLo + plotHi) / 2
        : rawLo == null
          ? (rawHi as number) - 0.001
          : rawHi == null
            ? (rawLo as number) + 0.001
            : (rawLo + rawHi) / 2;
    const color = dynamicsBandColor(metric, mid);
    if (!color) continue;
    const lo = rawLo == null ? plotLo : Math.max(plotLo, rawLo);
    const hi = rawHi == null ? plotHi : Math.min(plotHi, rawHi);
    if (hi > lo) out.push({ lo, hi, color });
  }
  return out;
}

/** Time-weighted seconds in each Garmin cadence band (best→worst). */
export function cadenceGarminZonesFromChart(
  cad: (number | null)[] | undefined,
  t?: number[]
): { seconds: number[]; labels: string[] } | null {
  if (!cad || !t || t.length !== cad.length || cad.length < 2) return null;
  const secs = [0, 0, 0, 0, 0];
  for (let i = 0; i < cad.length; i++) {
    const v = cad[i];
    if (v == null || !Number.isFinite(v) || v <= 0 || v > 220) continue;
    const dt = i + 1 < t.length ? t[i + 1] - t[i] : i > 0 ? t[i] - t[i - 1] : 0;
    if (dt <= 0 || dt > 120) continue;
    const idx = dynamicsBandIndex('cadence', v);
    if (idx == null) continue;
    secs[idx] += dt;
  }
  if (secs.reduce((a, b) => a + b, 0) < 30) return null;
  return {
    seconds: secs.map((s) => Math.round(s)),
    labels: dynamicsBandLabels('cadence').map((x) => x.label),
  };
}
