import { useEffect, useState } from 'react';

/**
 * The current instant, ticking.
 *
 * This is the ONLY place in the app that calls `new Date()`. Every engine
 * function takes an explicit `at`, which is what makes the engine testable and
 * gives the time-scrubber for free — scrubbing just means passing a different
 * instant instead of this one.
 *
 * Ticks once a second by default because the countdown shows seconds. It
 * deliberately aligns to the wall-clock second rather than drifting a few
 * milliseconds per tick, so the displayed number changes when the user's own
 * clock changes rather than a quarter-second late.
 */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    const scheduleNext = () => {
      const delay = intervalMs - (Date.now() % intervalMs);
      timeout = setTimeout(() => {
        setNow(new Date());
        scheduleNext();
      }, delay);
    };

    scheduleNext();
    return () => clearTimeout(timeout);
  }, [intervalMs]);

  return now;
}

/**
 * A countdown as the app should say it: "2h 18m", "45m", "30s".
 *
 * Deliberately not "0h 45m" or "45 minutes, 0 seconds". Seconds only appear
 * under a minute, where they are the useful part; above that they are noise
 * that makes the number harder to read at a glance.
 */
export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return 'now';
  const total = Math.ceil(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${total}s`;
}
