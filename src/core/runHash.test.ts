import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  activityYear,
  formatRunHash,
  parseRunHash,
  readRunHash,
} from './runHash.ts';

describe('parseRunHash', () => {
  it('parses #run_<id> as locate-only', () => {
    assert.deepEqual(parseRunHash('#run_1794478711000'), {
      runId: 1794478711000,
      analysis: false,
    });
  });

  it('parses #run_<id>/analysis', () => {
    assert.deepEqual(parseRunHash('#run_1794478711000/analysis'), {
      runId: 1794478711000,
      analysis: true,
    });
  });

  it('accepts the value without a leading #', () => {
    assert.deepEqual(parseRunHash('run_42/analysis'), {
      runId: 42,
      analysis: true,
    });
  });

  it('ignores malformed or extra suffixes', () => {
    const rejected = [
      '',
      '#',
      '#run_',
      '#run_0',
      '#run_0123',
      '#run_abc',
      '#run_123foo',
      '#run_123/',
      '#run_123/analysis/',
      '#run_123/Analysis',
      '#run_123/splits',
      '#run_123?analysis',
      '#run_123&analysis',
      '#run_123/analysis?x=1',
      '?run=123',
      '#/run_123',
      '/splits/123',
      'run-123',
    ];
    for (const hash of rejected) {
      assert.equal(parseRunHash(hash), null, hash);
    }
  });
});

describe('formatRunHash', () => {
  it('writes locate and analysis forms', () => {
    assert.equal(formatRunHash(1794478711000), '#run_1794478711000');
    assert.equal(
      formatRunHash(1794478711000, true),
      '#run_1794478711000/analysis'
    );
    assert.equal(formatRunHash(1794478711000, false), '#run_1794478711000');
  });

  it('round-trips with parseRunHash', () => {
    for (const analysis of [false, true]) {
      const hash = formatRunHash(42, analysis);
      assert.deepEqual(parseRunHash(hash), { runId: 42, analysis });
    }
  });
});

describe('activityYear', () => {
  it('reads the year from a local start date', () => {
    assert.equal(activityYear('2026-11-12 18:18'), 2026);
    assert.equal(activityYear(''), null);
  });
});

describe('readRunHash', () => {
  it('caches the snapshot while the hash is unchanged', () => {
    const previous = (globalThis as { window?: unknown }).window;
    const location = { hash: '#run_42' };
    (globalThis as { window: { location: { hash: string } } }).window = {
      location,
    };
    try {
      const first = readRunHash();
      const second = readRunHash();
      assert.deepEqual(first, { runId: 42, analysis: false });
      assert.equal(first, second);

      location.hash = '#run_42/analysis';
      const analysis = readRunHash();
      assert.notEqual(analysis, first);
      assert.deepEqual(analysis, { runId: 42, analysis: true });
      assert.equal(analysis, readRunHash());

      location.hash = '#nope';
      assert.equal(readRunHash(), null);
      assert.equal(readRunHash(), null);
    } finally {
      if (previous === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        (globalThis as { window: unknown }).window = previous;
      }
    }
  });
});
