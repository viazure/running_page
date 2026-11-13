import { useSyncExternalStore } from 'react';

export type PlaybackPrefs = {
  showEndpoints: boolean;
  showStats: boolean;
  /** 2D: freeze chase camera bearing (no route-follow yaw). */
  lockOrientation: boolean;
  /** Freeze the camera center; the runner marker can still move. */
  lockMap: boolean;
  /** 3D: freeze bearing, pitch and zoom at lock-time values. */
  lockView3d: boolean;
};

const STORAGE_KEY = 'playback-prefs';

const DEFAULTS: PlaybackPrefs = {
  showEndpoints: true,
  showStats: true,
  lockOrientation: false,
  lockMap: false,
  lockView3d: true,
};

let current: PlaybackPrefs | null = null;
const listeners = new Set<() => void>();

export function parsePlaybackPrefs(
  parsed: Partial<PlaybackPrefs> | null | undefined
): PlaybackPrefs {
  const p = parsed ?? {};
  return {
    showEndpoints: p.showEndpoints !== false,
    showStats: p.showStats !== false,
    lockOrientation: p.lockOrientation === true,
    lockMap: p.lockMap === true,
    lockView3d: p.lockView3d !== false,
  };
}

/** Bearing / view lock pref for the active chase camera mode. */
export function bearingLockPrefForMode(
  mode: '2d' | '3d',
  prefs: Pick<PlaybackPrefs, 'lockOrientation' | 'lockView3d'>
): boolean {
  return mode === '3d' ? prefs.lockView3d : prefs.lockOrientation;
}

function read(): PlaybackPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return parsePlaybackPrefs(JSON.parse(raw) as Partial<PlaybackPrefs>);
  } catch {
    return { ...DEFAULTS };
  }
}

function ensure(): PlaybackPrefs {
  if (!current) current = read();
  return current;
}

export function getPlaybackPrefs(): PlaybackPrefs {
  return ensure();
}

export function setPlaybackPrefs(patch: Partial<PlaybackPrefs>): void {
  current = { ...ensure(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* private mode */
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePlaybackPrefs(): PlaybackPrefs {
  return useSyncExternalStore(subscribe, getPlaybackPrefs, () => DEFAULTS);
}
