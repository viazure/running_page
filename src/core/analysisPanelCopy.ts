/** Shared analysis-panel copy and layout tokens (safe for node:test). */

type Tr = (zh: string, en: string) => string;

/** Shared left column for zone tables: name + range, no wrap. */
export const ZONE_TABLE_NAME_COL = '6.5rem';
export const ZONE_TABLE_GRID_CLASS = 'grid-cols-[6.5rem_1fr_auto]';

/** Splits pace bars and fastest-split pace use the running orange, not accent purple. */
export const SPLITS_BAR_COLOR = 'var(--color-run)';
export const SPLITS_FAST_PACE_TEXT_CLASS = 'text-[var(--color-run)]';
/**
 * Same left-to-right wash on every split bar. Hue follows --color-run
 * (light #c45c26 / dark #e8a87c); opacity and stops do not change with pace.
 */
export const SPLITS_BAR_FILL_STOPS = [
  { offset: 0, opacity: 0.32 },
  { offset: 0.72, opacity: 0.5 },
  { offset: 1, opacity: 0.58 },
] as const;

export const SPLITS_BAR_RGB = {
  light: [196, 92, 38],
  dark: [232, 168, 124],
} as const;

export function splitsBarFillGradient(
  rgb: readonly [number, number, number]
): string {
  const [r, g, b] = rgb;
  const parts = SPLITS_BAR_FILL_STOPS.map((s) => {
    const pct = `${Math.round(s.offset * 100)}%`;
    return `rgba(${r}, ${g}, ${b}, ${s.opacity.toFixed(2)}) ${pct}`;
  });
  return `linear-gradient(90deg, ${parts.join(', ')})`;
}

export const SPLITS_BAR_FILL = `linear-gradient(90deg, ${SPLITS_BAR_FILL_STOPS.map(
  (s) =>
    `color-mix(in srgb, var(--color-run) ${Math.round(s.opacity * 100)}%, transparent) ${Math.round(s.offset * 100)}%`
).join(', ')})`;
/** Pace column width: room for a pace plus the 快 mark. */
export const SPLITS_PACE_COL_CLASS = 'w-16 shrink-0 text-right';

/** Pace arrows stay evaluative: green when faster, red when slower. */
export const SPLITS_PACE_DELTA_UP_CLASS = 'text-emerald-500';
export const SPLITS_PACE_DELTA_DOWN_CLASS = 'text-rose-500';
/**
 * HR arrows are directional only, not better/worse. Same mid-ink for
 * up and down; follows --color-muted so it stays readable on light
 * paper (#8a8680) and dark cards (#8b919c).
 */
export const SPLITS_HR_DELTA_CLASS = 'text-[var(--color-muted)]';

export type SplitDeltaKind = 'pace' | 'hr';

export function splitDeltaClass(kind: SplitDeltaKind, better: boolean): string {
  if (kind === 'hr') return SPLITS_HR_DELTA_CLASS;
  return better ? SPLITS_PACE_DELTA_UP_CLASS : SPLITS_PACE_DELTA_DOWN_CLASS;
}

export type SplitPaceAxis = {
  /** Slower end (larger s/km), left of the bar track. */
  slowPace: number;
  /** Faster end (smaller s/km), right of the bar track. */
  fastPace: number;
  ticks: number[];
};

const PACE_TICK_STEPS = [15, 30, 60, 120, 180, 300];

function snapAxis(
  slowest: number,
  fastest: number,
  step: number
): {
  slow: number;
  fast: number;
  tickCount: number;
} {
  let slow = Math.ceil(slowest / step) * step;
  let fast = Math.floor(fastest / step) * step;
  if (slow <= slowest) slow += step;
  if (fast >= fastest) fast = Math.max(step, fast - step);
  if (fast >= slow) {
    slow = Math.ceil((slowest + step) / step) * step;
    fast = Math.max(step, Math.floor((fastest - step) / step) * step);
  }
  const tickCount = Math.round((slow - fast) / step);
  return { slow, fast, tickCount };
}

/**
 * Cropped pace axis for split bars. Ends are this run's slowest / fastest,
 * rounded out to readable pace ticks. Length is mapped in speed (1/pace),
 * not linearly in minutes, and not from zero speed.
 */
export function splitPaceAxis(paces: number[]): SplitPaceAxis | null {
  const nums = paces.filter((p) => Number.isFinite(p) && p > 0);
  if (!nums.length) return null;
  const fastest = Math.min(...nums);
  const slowest = Math.max(...nums);
  let chosen = snapAxis(slowest, fastest, 30);
  let step = 30;
  for (const s of PACE_TICK_STEPS) {
    const cand = snapAxis(slowest, fastest, s);
    // tickCount is the number of steps; labels = tickCount + 1. Aim for 3–5 labels.
    if (cand.fast < cand.slow && cand.tickCount >= 2 && cand.tickCount <= 4) {
      chosen = cand;
      step = s;
      break;
    }
    if (cand.fast < cand.slow) {
      chosen = cand;
      step = s;
    }
  }
  if (chosen.fast >= chosen.slow) return null;
  const ticks: number[] = [];
  for (let t = chosen.slow; t >= chosen.fast - 1e-9; t -= step) {
    ticks.push(Math.round(t));
  }
  return { slowPace: chosen.slow, fastPace: chosen.fast, ticks };
}

/** Position of a pace on the cropped speed axis, 0 at the slow end. */
export function splitBarRatio(pace: number, axis: SplitPaceAxis): number {
  if (!Number.isFinite(pace) || pace <= 0) return 0;
  const v = 1 / pace;
  const vSlow = 1 / axis.slowPace;
  const vFast = 1 / axis.fastPace;
  if (vFast === vSlow) return 0.5;
  const t = (v - vSlow) / (vFast - vSlow);
  if (t < 0) return 0;
  if (t > 1) return 1;
  return t;
}

/** Caption under an HR zone table that has data. Device/LTHR: none. Estimated only. */
export function hrZoneFilledCaption(
  estimated: boolean,
  tr: Tr
): string | undefined {
  if (!estimated) return undefined;
  return tr('区间为估算', 'Zones are estimated');
}

/** Empty-state caption only. Never used as a source line under a filled table. */
export function hrZoneEmptyCaption(
  emptyReason: 'no_hr_data' | 'no_baseline' | undefined,
  tr: Tr
): string {
  if (emptyReason === 'no_hr_data') {
    return tr(
      '这次活动没有记录到心率。',
      'No heart rate recorded for this run.'
    );
  }
  return [
    tr(
      '信息不足，无法计算心率区间。',
      'Not enough info to show heart rate zones.'
    ),
    tr(
      '需要设备记录的心率数据，或提供乳酸阈心率、出生年月来估算。',
      'Add heart rate data from your device, or provide your lactate threshold and birth month for an estimate.'
    ),
  ].join(tr(' ', ' '));
}

export function hrZoneTitle(tr: Tr): string {
  return tr('心率区间', 'Heart Rate Zones');
}
