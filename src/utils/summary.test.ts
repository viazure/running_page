import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatElevationMeters,
  summarizeElevation,
} from './summaryElevation.ts';

describe('summarizeElevation', () => {
  it('returns null and incomplete when there are no activities', () => {
    const stats = summarizeElevation([]);
    assert.equal(stats.totalM, null);
    assert.equal(stats.complete, false);
  });

  it('treats null and undefined elevation as missing, not 0', () => {
    const stats = summarizeElevation([
      { elevation_gain: null },
      { elevation_gain: undefined },
    ]);
    assert.equal(stats.totalM, null);
    assert.equal(stats.complete, false);
  });

  it('keeps a real 0 as 0 and marks the total complete', () => {
    const stats = summarizeElevation([
      { elevation_gain: 0 },
      { elevation_gain: 0.0 },
    ]);
    assert.equal(stats.totalM, 0);
    assert.equal(stats.complete, true);
  });

  it('sums positive samples', () => {
    const stats = summarizeElevation([
      { elevation_gain: 12.4 },
      { elevation_gain: 7.6 },
    ]);
    assert.equal(stats.totalM, 20);
    assert.equal(stats.complete, true);
  });

  it('sums only present samples and flags a partial total', () => {
    const stats = summarizeElevation([
      { elevation_gain: 10 },
      { elevation_gain: null },
      { elevation_gain: 5 },
    ]);
    assert.equal(stats.totalM, 15);
    assert.equal(stats.complete, false);
  });

  it('treats a mix of real 0 and missing as a partial 0 total', () => {
    const stats = summarizeElevation([
      { elevation_gain: 0 },
      { elevation_gain: null },
    ]);
    assert.equal(stats.totalM, 0);
    assert.equal(stats.complete, false);
  });
});

describe('formatElevationMeters', () => {
  it('shows an em dash when there is no valid sample', () => {
    assert.equal(formatElevationMeters(null, false, 'zh'), '—');
    assert.equal(formatElevationMeters(undefined, false, 'en'), '—');
    assert.equal(formatElevationMeters(null, true, 'zh'), '—');
  });

  it('shows 0 m for a real zero total', () => {
    assert.equal(formatElevationMeters(0, true, 'zh'), '0 m');
    assert.equal(formatElevationMeters(0, true, 'en'), '0 m');
  });

  it('rounds and formats a positive complete total', () => {
    assert.equal(formatElevationMeters(12.4, true, 'zh'), '12 m');
    assert.equal(formatElevationMeters(20, true, 'en'), '20 m');
  });

  it('annotates a partial total instead of implying a full sum', () => {
    assert.equal(formatElevationMeters(15, false, 'zh'), '15 m（部分）');
    assert.equal(formatElevationMeters(15, false, 'en'), '15 m (partial)');
    assert.equal(formatElevationMeters(0, false, 'zh'), '0 m（部分）');
  });
});

describe('summary consumers stay compatible with nullable elevation', () => {
  it('formats summarize()-shaped stats without assuming a number', () => {
    const cases: {
      elevation: number | null;
      elevationComplete: boolean;
    }[] = [
      { elevation: null, elevationComplete: false },
      { elevation: 8, elevationComplete: false },
      { elevation: 0, elevationComplete: true },
    ];
    const formatted = cases.map((stats) =>
      formatElevationMeters(stats.elevation, stats.elevationComplete, 'zh')
    );
    assert.deepEqual(formatted, ['—', '8 m（部分）', '0 m']);
  });
});
