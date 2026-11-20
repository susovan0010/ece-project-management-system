import { describe, it, expect } from 'vitest';
import {
  IDLE_TIMEOUT_SECONDS,
  IDLE_TIMEOUT_MS,
  IDLE_WARNING_MS,
  getRemainingIdleMs,
  isIdleExpired,
} from '@/lib/idle-session';

describe('Idle Session Timeout Helpers', () => {
  it('configures an exact 8-minute (480s) idle timeout and 60s warning window', () => {
    expect(IDLE_TIMEOUT_SECONDS).toBe(480);
    expect(IDLE_TIMEOUT_MS).toBe(480_000);
    expect(IDLE_WARNING_MS).toBe(60_000);
  });

  it('computes remaining time and does not expire before 8 minutes', () => {
    const start = 1_000_000;
    expect(getRemainingIdleMs(start, start + 60_000)).toBe(420_000);
    expect(isIdleExpired(start, start + 479_999)).toBe(false);
    expect(getRemainingIdleMs(start, start + 479_999)).toBe(1);
  });

  it('expires at exactly 8 minutes and beyond', () => {
    const start = 1_000_000;
    expect(isIdleExpired(start, start + 480_000)).toBe(true);
    expect(getRemainingIdleMs(start, start + 480_000)).toBe(0);
    expect(isIdleExpired(start, start + 600_000)).toBe(true);
    expect(getRemainingIdleMs(start, start + 600_000)).toBe(0);
  });
});
