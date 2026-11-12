/**
 * Time-based chase-camera smoothing helpers.
 *
 * Playback used to ease bearing/pitch/zoom by a fixed fraction per animation
 * frame, and only started turning once heading error exceeded 4°. That left a
 * permanent ~4° lag and produced start-stop yaw, and made the follow rate
 * depend on the frame interval.
 */

export const CHASE_DT_MAX_MS = 80;

/** Matches the old 0.07/frame easing at 60 fps: -1000/60 / ln(1-0.07) ≈ 230ms. */
export const CHASE_BEARING_TAU_MS = 230;

/** Matches the old 0.04/frame 3D pitch/zoom easing at 60 fps ≈ 410ms. */
export const CHASE_PITCH_ZOOM_TAU_MS = 410;

/** Matches the old 0.12/frame 2D pitch/zoom easing at 60 fps ≈ 130ms. */
export const CHASE_PITCH_ZOOM_TAU_2D_MS = 130;

/** Snap residual error smaller than this instead of creeping forever. */
const SNAP_EPS = 0.05;

export function clampChaseDt(dtMs: number): number {
  if (!Number.isFinite(dtMs) || dtMs <= 0) return 0;
  return Math.min(dtMs, CHASE_DT_MAX_MS);
}

export function frameSmoothAlpha(dtMs: number, tauMs: number): number {
  const dt = clampChaseDt(dtMs);
  if (dt <= 0 || tauMs <= 0) return 0;
  return 1 - Math.exp(-dt / tauMs);
}

export function shortestAngleDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

export function smoothToward(
  current: number,
  target: number,
  dtMs: number,
  tauMs: number
): number {
  const delta = target - current;
  if (Math.abs(delta) < SNAP_EPS) return target;
  return current + delta * frameSmoothAlpha(dtMs, tauMs);
}

export function smoothAngleToward(
  current: number,
  target: number,
  dtMs: number,
  tauMs: number
): number {
  const delta = shortestAngleDelta(current, target);
  if (Math.abs(delta) < SNAP_EPS) return target;
  return (current + delta * frameSmoothAlpha(dtMs, tauMs) + 360) % 360;
}

export type Chase3dPose = {
  bearing: number;
  zoom: number;
  pitch: number;
};

/**
 * Next 3D chase pose for one frame.
 * When orientation is locked, bearing, pitch and zoom stay frozen;
 * only the map center still follows the runner.
 */
export function nextChase3dPose(
  current: Chase3dPose,
  target: Chase3dPose,
  opts: { locked: boolean; instant: boolean; dt: number }
): Chase3dPose {
  if (opts.locked) {
    return {
      bearing: current.bearing,
      zoom: current.zoom,
      pitch: current.pitch,
    };
  }
  if (opts.instant) {
    return { bearing: target.bearing, zoom: target.zoom, pitch: target.pitch };
  }
  return {
    bearing: smoothAngleToward(
      current.bearing,
      target.bearing,
      opts.dt,
      CHASE_BEARING_TAU_MS
    ),
    zoom: smoothToward(
      current.zoom,
      target.zoom,
      opts.dt,
      CHASE_PITCH_ZOOM_TAU_MS
    ),
    pitch: smoothToward(
      current.pitch,
      target.pitch,
      opts.dt,
      CHASE_PITCH_ZOOM_TAU_MS
    ),
  };
}

/** Keep the camera center frozen while the map is locked. */
export function chaseFollowCenter(
  follow: readonly [number, number],
  lockedCenter: readonly [number, number] | null,
  locked: boolean
): readonly [number, number] {
  return locked && lockedCenter ? lockedCenter : follow;
}
