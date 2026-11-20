'use client';

import { useEffect, useRef, useState } from 'react';
import { idleLogoutAction } from '@/app/actions/auth';
import {
  IDLE_ACTIVITY_STORAGE_KEY,
  IDLE_WARNING_MS,
  getRemainingIdleMs,
  isIdleExpired,
} from '@/lib/idle-session';

interface IdleLogoutMonitorProps {
  loginAt?: number;
}

const KEEPALIVE_INTERVAL_MS = 60 * 1000;
const ACTIVITY_THROTTLE_MS = 1000;

export function IdleLogoutMonitor({ loginAt }: IdleLogoutMonitorProps) {
  const [warningSeconds, setWarningSeconds] = useState<number | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const lastThrottleRef = useRef<number>(0);
  const lastKeepaliveRef = useRef<number>(Date.now());
  const loggingOutRef = useRef<boolean>(false);

  const performIdleLogout = async () => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    try {
      localStorage.removeItem(IDLE_ACTIVITY_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
    try {
      await idleLogoutAction();
    } catch {
      window.location.href = '/login?reason=idle';
    }
  };

  const recordActivity = (force = false) => {
    if (loggingOutRef.current) return;
    const now = Date.now();
    if (!force && now - lastThrottleRef.current < ACTIVITY_THROTTLE_MS) {
      return;
    }
    lastThrottleRef.current = now;
    lastActivityRef.current = now;
    setWarningSeconds(null);
    try {
      localStorage.setItem(IDLE_ACTIVITY_STORAGE_KEY, String(now));
    } catch {
      // Ignore storage errors
    }
  };

  useEffect(() => {
    const now = Date.now();
    let initialActivity = now;

    try {
      const storedRaw = localStorage.getItem(IDLE_ACTIVITY_STORAGE_KEY);
      const storedTs = storedRaw ? Number(storedRaw) : NaN;
      if (Number.isFinite(storedTs) && storedTs > 0 && (!loginAt || storedTs >= loginAt)) {
        initialActivity = storedTs;
      } else {
        localStorage.setItem(IDLE_ACTIVITY_STORAGE_KEY, String(now));
      }
    } catch {
      // Ignore storage errors
    }

    lastActivityRef.current = initialActivity;

    if (isIdleExpired(initialActivity, now)) {
      performIdleLogout();
      return;
    }

    const onUserActivity = () => recordActivity(false);

    const activityEvents: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
      'click',
    ];

    activityEvents.forEach((evt) => {
      window.addEventListener(evt, onUserActivity, { passive: true });
    });

    const onStorage = (e: StorageEvent) => {
      if (e.key === IDLE_ACTIVITY_STORAGE_KEY && e.newValue) {
        const ts = Number(e.newValue);
        if (Number.isFinite(ts) && ts > lastActivityRef.current) {
          lastActivityRef.current = ts;
          setWarningSeconds(null);
        }
      }
    };
    window.addEventListener('storage', onStorage);

    const checkIdle = () => {
      if (loggingOutRef.current) return;
      const current = Date.now();

      try {
        const storedRaw = localStorage.getItem(IDLE_ACTIVITY_STORAGE_KEY);
        const storedTs = storedRaw ? Number(storedRaw) : NaN;
        if (Number.isFinite(storedTs) && storedTs > lastActivityRef.current) {
          lastActivityRef.current = storedTs;
        }
      } catch {
        // Ignore storage errors
      }

      const remainingMs = getRemainingIdleMs(lastActivityRef.current, current);
      if (remainingMs <= 0) {
        performIdleLogout();
        return;
      }

      if (remainingMs <= IDLE_WARNING_MS) {
        setWarningSeconds(Math.ceil(remainingMs / 1000));
      } else {
        setWarningSeconds(null);
      }

      // Slide server JWT session only if real user activity occurred recently
      const idleDuration = current - lastActivityRef.current;
      if (
        idleDuration < KEEPALIVE_INTERVAL_MS &&
        current - lastKeepaliveRef.current >= KEEPALIVE_INTERVAL_MS
      ) {
        lastKeepaliveRef.current = current;
        fetch('/api/auth/session', { method: 'GET', cache: 'no-store' }).catch(() => {
          // Ignore transient network errors
        });
      }
    };

    const intervalId = window.setInterval(checkIdle, 1000);
    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        checkIdle();
      }
    };

    window.addEventListener('focus', checkIdle);
    document.addEventListener('visibilitychange', onFocusOrVisible);

    return () => {
      window.clearInterval(intervalId);
      activityEvents.forEach((evt) => {
        window.removeEventListener(evt, onUserActivity);
      });
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', checkIdle);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, [loginAt]);

  if (warningSeconds === null) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="idle-warning-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 no-print print:hidden"
    >
      <div className="w-full max-w-md bg-white rounded-2xl border border-amber-200 shadow-2xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 font-bold text-lg">
            ⏳
          </div>
          <div>
            <h2 id="idle-warning-title" className="text-base font-bold text-slate-900">
              Session Expiring Due to Inactivity
            </h2>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              For your security, your account will be automatically signed out in{' '}
              <span className="font-bold text-amber-700 font-mono">{warningSeconds}s</span>{' '}
              after 8 minutes of inactivity.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={performIdleLogout}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
          >
            Sign Out Now
          </button>
          <button
            type="button"
            onClick={() => recordActivity(true)}
            className="px-4 py-2 text-xs font-bold text-white bg-[#1985A1] hover:bg-[#146E85] rounded-xl shadow-sm transition"
          >
            Stay Signed In
          </button>
        </div>
      </div>
    </div>
  );
}
