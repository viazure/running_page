/**
 * Run / walk / stop status along a chart timeline.
 * Prefer FIT activity_type when present; else infer from cadence + pace.
 */

export type MotionKind = 'run' | 'walk' | 'stop';

export type MotionSeg = {
  kind: MotionKind;
  /** Inclusive start index in chart series. */
  from: number;
  /** Exclusive end index. */
  to: number;
};

const STOP_PACE = 1200; // s/km ≈ 20:00 — essentially stopped / standing
const WALK_PACE = 540; // s/km = 9:00
const STOP_CAD = 40;
const WALK_CAD = 125;

/** Map FIT / decoder activity_type strings to our three buckets. */
export function motionFromActivityType(
  raw: string | number | null | undefined
): MotionKind | null {
  if (raw == null) return null;
  const s = String(raw).toLowerCase().trim();
  if (!s) return null;
  if (
    /^(run|running|trail_?running|treadmill|track|ultra)/.test(s) ||
    s === '1'
  ) {
    return 'run';
  }
  if (/^(walk|walking|hike|hiking|marching)/.test(s) || s === '2') {
    return 'walk';
  }
  if (
    /^(stop|stopped|stationary|rest|resting|still|idle|pause|inactive)/.test(
      s
    ) ||
    s === '0' ||
    s === '3'
  ) {
    return 'stop';
  }
  return null;
}

export function inferMotion(
  pace: number | null | undefined,
  cad: number | null | undefined
): MotionKind {
  const p = pace != null && Number.isFinite(pace) && pace > 0 ? pace : null;
  const c = cad != null && Number.isFinite(cad) && cad >= 0 ? cad : null;

  if ((c != null && c < STOP_CAD) || (p != null && p >= STOP_PACE)) {
    return 'stop';
  }
  if (
    (c != null && c < WALK_CAD && (p == null || p > WALK_PACE * 0.85)) ||
    (p != null && p >= WALK_PACE && (c == null || c < 150))
  ) {
    return 'walk';
  }
  if (p == null && c == null) return 'stop';
  return 'run';
}

/**
 * Build contiguous run/walk/stop segments.
 * `activity` series values may be FIT strings or already-bucketed kinds.
 */
export function buildMotionSegments(args: {
  pace?: (number | null)[];
  cad?: (number | null)[];
  activity?: (string | number | null)[];
  length: number;
}): MotionSeg[] {
  const { pace, cad, activity, length } = args;
  if (length < 1) return [];
  const kinds: MotionKind[] = [];
  for (let i = 0; i < length; i++) {
    const fromFit = activity
      ? motionFromActivityType(activity[i] as string | number | null)
      : null;
    kinds.push(fromFit ?? inferMotion(pace?.[i] ?? null, cad?.[i] ?? null));
  }
  const segs: MotionSeg[] = [];
  let from = 0;
  for (let i = 1; i <= kinds.length; i++) {
    if (i === kinds.length || kinds[i] !== kinds[from]) {
      segs.push({ kind: kinds[from], from, to: i });
      from = i;
    }
  }
  return segs;
}

export function motionSeconds(
  segs: MotionSeg[],
  t?: number[]
): Record<MotionKind, number> {
  const out: Record<MotionKind, number> = { run: 0, walk: 0, stop: 0 };
  if (!t || t.length < 2) {
    for (const s of segs) out[s.kind] += Math.max(0, s.to - s.from);
    return out;
  }
  for (const s of segs) {
    for (let i = s.from; i < s.to; i++) {
      const dt =
        i + 1 < t.length ? t[i + 1] - t[i] : i > 0 ? t[i] - t[i - 1] : 0;
      if (dt > 0 && dt <= 120) out[s.kind] += dt;
    }
  }
  return out;
}

export const MOTION_COLORS: Record<MotionKind, string> = {
  run: '#22c55e',
  walk: '#f59e0b',
  stop: '#9ca3af',
};
