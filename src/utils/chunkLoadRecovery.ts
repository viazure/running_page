const RELOAD_KEY = 'vite-chunk-reload';
/** Skip another auto-reload if we already tried within this window. */
const RELOAD_COOLDOWN_MS = 30_000;

/** True when a dynamic import failed (often after a new deploy replaced hashed assets). */
export function isChunkLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  );
}

/**
 * Reload once within a short cooldown to pick up the latest index.html / chunk
 * hashes. Returns false if a reload was already attempted recently (avoids loops).
 */
export function reloadOnceForChunkError(): boolean {
  try {
    const prev = Number(sessionStorage.getItem(RELOAD_KEY));
    if (Number.isFinite(prev) && Date.now() - prev < RELOAD_COOLDOWN_MS) {
      return false;
    }
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // sessionStorage blocked — still attempt a reload
  }
  window.location.reload();
  return true;
}

/**
 * Vite fires `vite:preloadError` when a lazy chunk cannot be loaded.
 * @see https://vite.dev/guide/build#load-error-handling
 */
export function installChunkLoadRecovery(): void {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    reloadOnceForChunkError();
  });
}
