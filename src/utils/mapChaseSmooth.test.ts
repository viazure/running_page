import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CHASE_BEARING_TAU_MS,
  CHASE_DT_MAX_MS,
  clampChaseDt,
  frameSmoothAlpha,
  chaseFollowCenter,
  nextChase3dPose,
  poseWhenTogglingMapLock,
  shortestAngleDelta,
  smoothAngleToward,
  smoothToward,
} from './mapChaseSmooth.ts';

describe('shortestAngleDelta', () => {
  it('returns signed shortest turn and wraps across 0°', () => {
    assert.equal(shortestAngleDelta(10, 40), 30);
    assert.equal(shortestAngleDelta(350, 10), 20);
    assert.equal(shortestAngleDelta(10, 350), -20);
    assert.equal(shortestAngleDelta(0, 270), -90);
  });
});

describe('clampChaseDt', () => {
  it('clamps hitches and drops non-positive values', () => {
    assert.equal(clampChaseDt(16.67), 16.67);
    assert.equal(clampChaseDt(5000), CHASE_DT_MAX_MS);
    assert.equal(clampChaseDt(0), 0);
    assert.equal(clampChaseDt(-8), 0);
    assert.equal(clampChaseDt(Number.NaN), 0);
  });
});

describe('frameSmoothAlpha', () => {
  it('is 0 when dt is 0 and rises with dt', () => {
    assert.equal(frameSmoothAlpha(0, CHASE_BEARING_TAU_MS), 0);
    const a16 = frameSmoothAlpha(16, CHASE_BEARING_TAU_MS);
    const a32 = frameSmoothAlpha(32, CHASE_BEARING_TAU_MS);
    assert.ok(a16 > 0 && a16 < 0.12);
    assert.ok(a32 > a16);
  });
});

describe('smoothAngleToward', () => {
  it('closes a sub-4° heading error instead of freezing', () => {
    let bearing = 0;
    for (let i = 0; i < 8; i++) {
      bearing = smoothAngleToward(bearing, 3, 16, CHASE_BEARING_TAU_MS);
    }
    // The old 4° deadzone never moved here. Time-based easing must advance.
    assert.ok(bearing > 1.2, 'bearing=' + bearing);
    assert.ok(bearing < 3, 'bearing=' + bearing);
  });

  it('advances a similar amount for one 48ms step and three 16ms steps', () => {
    const once = smoothAngleToward(0, 40, 48, CHASE_BEARING_TAU_MS);
    let stepped = 0;
    for (let i = 0; i < 3; i++) {
      stepped = smoothAngleToward(stepped, 40, 16, CHASE_BEARING_TAU_MS);
    }
    assert.ok(
      Math.abs(once - stepped) < 0.01,
      'once=' + once + ' stepped=' + stepped
    );
  });

  it('does not lurch when a long hitch is clamped', () => {
    const capped = smoothAngleToward(
      0,
      90,
      CHASE_DT_MAX_MS,
      CHASE_BEARING_TAU_MS
    );
    const hitch = smoothAngleToward(0, 90, 5000, CHASE_BEARING_TAU_MS);
    assert.equal(hitch, capped);
    // Still only a partial step — not a snap to 90°.
    assert.ok(hitch < 35, 'hitch=' + hitch);
  });

  it('wraps the short way across 0°', () => {
    const next = smoothAngleToward(350, 10, 16, CHASE_BEARING_TAU_MS);
    assert.ok(next > 350 || next < 10, 'next=' + next);
    if (next > 350) assert.ok(next < 360);
    if (next < 10) assert.ok(next > 0);
  });
});

describe('smoothToward', () => {
  it('snaps a tiny residual instead of creeping forever', () => {
    assert.equal(smoothToward(16.02, 16, 16, 410), 16);
  });
});

describe('nextChase3dPose', () => {
  const current = { bearing: 40, zoom: 16.5, pitch: 50 };
  const target = { bearing: 90, zoom: 16.3, pitch: 44 };

  it('freezes bearing, pitch and zoom when locked, even on instant frames', () => {
    const snapped = nextChase3dPose(current, target, {
      locked: true,
      instant: true,
      dt: 16,
    });
    assert.deepEqual(snapped, current);
    const eased = nextChase3dPose(current, target, {
      locked: true,
      instant: false,
      dt: 16,
    });
    assert.deepEqual(eased, current);
  });

  it('snaps to the target when unlocked and instant', () => {
    const next = nextChase3dPose(current, target, {
      locked: false,
      instant: true,
      dt: 16,
    });
    assert.deepEqual(next, target);
  });

  it('eases toward the target when unlocked', () => {
    const next = nextChase3dPose(current, target, {
      locked: false,
      instant: false,
      dt: 16,
    });
    assert.ok(next.bearing > current.bearing && next.bearing < target.bearing);
    assert.ok(next.zoom < current.zoom && next.zoom > target.zoom);
    assert.ok(next.pitch < current.pitch && next.pitch > target.pitch);
  });
});

describe('chaseFollowCenter', () => {
  const follow = [120.1, 30.2] as const;
  const frozen = [121.5, 31.1] as const;

  it('keeps the locked center even as the runner moves', () => {
    assert.deepEqual(chaseFollowCenter(follow, frozen, true), frozen);
  });

  it('follows the runner when unlocked or if no center was captured', () => {
    assert.deepEqual(chaseFollowCenter(follow, frozen, false), follow);
    assert.deepEqual(chaseFollowCenter(follow, null, true), follow);
  });
});

describe('poseWhenTogglingMapLock', () => {
  it('keeps the current bearing/pitch/zoom instead of instant-snapping', () => {
    const current = { bearing: 40, zoom: 16.5, pitch: 50 };
    const target = { bearing: 90, zoom: 16.3, pitch: 44 };
    // Unlocked + instant is the bug path setMapLocked used to take.
    assert.deepEqual(
      nextChase3dPose(current, target, {
        locked: false,
        instant: true,
        dt: 16,
      }),
      target
    );
    assert.deepEqual(poseWhenTogglingMapLock(current), current);
    assert.notDeepEqual(poseWhenTogglingMapLock(current), target);
  });
});
