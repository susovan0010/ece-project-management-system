'use client';

import { useEffect, useRef } from 'react';
import { processDueScheduledCommunicationsAction } from '@/app/actions/communication-schedule';

/**
 * Keeps Admin scheduled email dispatches running automatically across all Admin
 * dashboard pages, on tab focus/visibility restore, and every 20 seconds.
 */
export function ScheduledEmailKeeper() {
  const runningRef = useRef(false);

  useEffect(() => {
    const sweep = async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        await processDueScheduledCommunicationsAction();
      } catch {
        // Ignore transient network errors
      } finally {
        runningRef.current = false;
      }
    };

    sweep();
    const intervalId = setInterval(sweep, 20000);

    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        sweep();
      }
    };

    window.addEventListener('focus', sweep);
    document.addEventListener('visibilitychange', onFocusOrVisible);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', sweep);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, []);

  return null;
}
