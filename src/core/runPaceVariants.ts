import type { SplitRow } from './splits';

type N = number | null | undefined;
const has = (v: N): v is number => v != null && Number.isFinite(v);

/**
 * Lap-average pace ladder: each chart sample takes the pace of the lap that
 * covers its distance (km). Falls back to instantaneous when no lap matches.
 */
export function lapAveragePaceSeries(
  distanceKm: number[],
  instantPace: (number | null)[] | undefined,
  laps: SplitRow[]
): (number | null)[] {
  if (!instantPace || !laps.length) return instantPace ?? [];
  // Build cumulative lap end distances (m) from lap.distance.
  const ends: { endM: number; pace: number | null }[] = [];
  let acc = 0;
  for (const lap of laps) {
    const d = has(lap.distance) ? lap.distance : 0;
    acc += d;
    ends.push({ endM: acc, pace: has(lap.pace) ? lap.pace : null });
  }
  return distanceKm.map((km, i) => {
    const m = km * 1000;
    const hit = ends.find((e) => m <= e.endM + 1);
    if (hit && has(hit.pace)) return hit.pace;
    return instantPace[i] ?? null;
  });
}

/**
 * Simple GAP estimate from instantaneous pace + altitude.
 * grade% ≈ Δalt / Δdist_m * 100; factor ≈ 1 + 0.033 * grade (Minetti-ish linear).
 * Marked as estimate in the UI — not a device original.
 */
export function gradeAdjustedPaceSeries(
  distanceKm: number[],
  pace: (number | null)[] | undefined,
  alt: (number | null)[] | undefined
): (number | null)[] {
  if (!pace || !alt || pace.length !== distanceKm.length) return pace ?? [];
  const out: (number | null)[] = new Array(pace.length).fill(null);
  for (let i = 0; i < pace.length; i++) {
    const p = pace[i];
    if (!has(p) || p <= 0) continue;
    const j = i > 0 ? i - 1 : i < pace.length - 1 ? i + 1 : i;
    const dd = Math.abs((distanceKm[i] - distanceKm[j]) * 1000);
    const a0 = alt[j];
    const a1 = alt[i];
    if (!has(a0) || !has(a1) || dd < 0.5) {
      out[i] = p;
      continue;
    }
    const grade = ((a1 - a0) / dd) * 100; // %
    const factor = 1 + 0.033 * grade;
    if (factor <= 0.2) {
      out[i] = p;
      continue;
    }
    out[i] = p / factor;
  }
  return out;
}

/** Moving-average pace over a distance/time window of neighbouring samples. */
export function movingAveragePace(
  pace: (number | null)[] | undefined,
  radius = 4
): number | null {
  if (!pace?.length) return null;
  const vals: number[] = [];
  // Prefer mid-run samples; skip nulls.
  const mid = Math.floor(pace.length / 2);
  const a = Math.max(0, mid - radius * 3);
  const b = Math.min(pace.length, mid + radius * 3);
  for (let i = a; i < b; i++) {
    const p = pace[i];
    if (has(p) && p > 0 && p < 1200) vals.push(p);
  }
  if (!vals.length) {
    for (const p of pace) {
      if (has(p) && p > 0 && p < 1200) vals.push(p);
    }
  }
  if (!vals.length) return null;
  return vals.reduce((s, x) => s + x, 0) / vals.length;
}

export function bestPaceIndex(
  pace: (number | null)[] | undefined
): number | null {
  if (!pace?.length) return null;
  let bestI: number | null = null;
  let best = Infinity;
  for (let i = 0; i < pace.length; i++) {
    const p = pace[i];
    if (!has(p) || p <= 0 || p > 900) continue;
    if (p < best) {
      best = p;
      bestI = i;
    }
  }
  return bestI;
}
