import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parsePlaybackPrefs } from './playbackPrefs.ts';

describe('parsePlaybackPrefs', () => {
  it('defaults to following the map and locking the 3D view', () => {
    assert.deepEqual(parsePlaybackPrefs(undefined), {
      showEndpoints: true,
      showStats: true,
      lockOrientation: false,
      lockMap: false,
      lockView3d: true,
    });
  });

  it('only turns lockMap on when it is explicitly true', () => {
    assert.equal(parsePlaybackPrefs({}).lockMap, false);
    assert.equal(parsePlaybackPrefs({ lockMap: false }).lockMap, false);
    assert.equal(parsePlaybackPrefs({ lockMap: true }).lockMap, true);
  });

  it('keeps lockView3d on unless it is explicitly false', () => {
    assert.equal(parsePlaybackPrefs({}).lockView3d, true);
    assert.equal(parsePlaybackPrefs({ lockView3d: true }).lockView3d, true);
    assert.equal(parsePlaybackPrefs({ lockView3d: false }).lockView3d, false);
  });
});
