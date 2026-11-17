/**
 * Downsample a scatter series for drawing. When there are more than
 * `maxDots` finite points, bucket by x and keep each bucket's lowest
 * and highest y, plus the first and last points of the run.
 */

export function downsampleScatterIndices(
  xs: number[],
  ys: (number | null | undefined)[],
  maxDots = 1200
): number[] {
  const validIdx: number[] = [];
  const n = Math.min(xs.length, ys.length);
  for (let i = 0; i < n; i++) {
    const y = ys[i];
    if (y == null || !Number.isFinite(y) || !Number.isFinite(xs[i])) continue;
    validIdx.push(i);
  }
  if (validIdx.length <= maxDots) return validIdx;

  const first = validIdx[0];
  const last = validIdx[validIdx.length - 1];
  const inner = Math.max(1, maxDots - 2);
  const buckets: number[][] = Array.from({ length: inner }, () => []);
  const x0 = xs[first];
  const x1 = xs[last];
  const span = x1 - x0 || 1;
  for (const i of validIdx) {
    if (i === first || i === last) continue;
    let b = Math.floor(((xs[i] - x0) / span) * inner);
    if (b < 0) b = 0;
    if (b >= inner) b = inner - 1;
    buckets[b].push(i);
  }

  const picked = new Set<number>([first, last]);
  for (const group of buckets) {
    if (!group.length) continue;
    let minI = group[0];
    let maxI = group[0];
    let minY = ys[minI] as number;
    let maxY = ys[maxI] as number;
    for (const i of group) {
      const v = ys[i] as number;
      if (v < minY) {
        minY = v;
        minI = i;
      }
      if (v > maxY) {
        maxY = v;
        maxI = i;
      }
    }
    picked.add(minI);
    picked.add(maxI);
  }
  return [...picked].sort((a, b) => a - b);
}
