import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { downsampleScatterIndices } from './scatterDownsample.ts';

const chartsSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'AnalysisCharts.tsx'),
  'utf8'
);

describe('scatter downsample keeps bucket extrema and endpoints', () => {
  it('returns every finite index when there are at most maxDots points', () => {
    const xs = [0, 1, 2, 3, 4];
    const ys = [1, null, 3, 4, 5];
    assert.deepEqual(downsampleScatterIndices(xs, ys, 1200), [0, 2, 3, 4]);
  });

  it('keeps first, last, and each bucket min/max when over the cap', () => {
    const xs: number[] = [];
    const ys: number[] = [];
    // 20 points across x=0..19. With maxDots=6, inner=4 buckets.
    // Put a unique low and high in the second inner bucket.
    for (let i = 0; i < 20; i++) {
      xs.push(i);
      ys.push(10);
    }
    ys[0] = 10;
    ys[19] = 11;
    ys[7] = 1; // min in its bucket
    ys[8] = 20; // max in its bucket
    const idx = downsampleScatterIndices(xs, ys, 6);
    assert.ok(idx.includes(0), 'first point');
    assert.ok(idx.includes(19), 'last point');
    assert.ok(idx.includes(7), 'bucket minimum');
    assert.ok(idx.includes(8), 'bucket maximum');
    assert.equal(ys[7], Math.min(...ys));
    assert.equal(ys[8], Math.max(...ys));
  });

  it('is used by the analysis scatter charts', () => {
    assert.match(chartsSrc, /downsampleScatterIndices\(/);
    assert.doesNotMatch(
      chartsSrc,
      /samples\[Math\.floor\(samples\.length \/ 2\)\]/
    );
  });
});
