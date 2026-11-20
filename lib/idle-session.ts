export const IDLE_TIMEOUT_SECONDS = 8 * 60; // 8 minutes
export const IDLE_TIMEOUT_MS = IDLE_TIMEOUT_SECONDS * 1000;
export const IDLE_WARNING_MS = 60 * 1000; // Show warning 60 seconds before logout
export const IDLE_ACTIVITY_STORAGE_KEY = 'ece_last_activity_at';

/**
 * Returns remaining milliseconds before idle timeout expires (clamped to >= 0).
 */
export function getRemainingIdleMs(
  lastActivityMs: number,
  nowMs: number = Date.now(),
  timeoutMs: number = IDLE_TIMEOUT_MS
): number {
  const elapsed = Math.max(0, nowMs - lastActivityMs);
  return Math.max(0, timeoutMs - elapsed);
}

/**
 * Returns true when the elapsed inactivity has reached or exceeded timeoutMs.
 */
export function isIdleExpired(
  lastActivityMs: number,
  nowMs: number = Date.now(),
  timeoutMs: number = IDLE_TIMEOUT_MS
): boolean {
  return getRemainingIdleMs(lastActivityMs, nowMs, timeoutMs) === 0;
}
