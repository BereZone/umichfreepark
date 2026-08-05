/**
 * The instant every screen renders for: the live clock, or the one the user
 * asked about instead.
 *
 * One hook rather than each screen deciding, because the map and the list must
 * answer for the same moment. A screen reading `useNow()` directly while its
 * sibling reads the preview would put two different Tuesdays on two tabs.
 *
 * `useNow` stays the only thing in the app that calls `new Date()`.
 */

import { useTrip } from '../state/trip';
import { useNow } from './use-now';

export interface Instant {
  /** Pass this to the engine. Never call `new Date()` at a call site instead. */
  at: Date;
  /** False when the user is previewing another time. Screens must say so. */
  isLive: boolean;
}

/**
 * @param intervalMs how often to re-read the live clock. The map wants seconds
 * for its countdown; the list wants a minute, because re-sorting 262 rows under
 * a thumb every second is worse than a slightly stale walk time.
 */
export function useAt(intervalMs = 1000): Instant {
  const { previewAt } = useTrip();

  /*
   * The clock keeps ticking while previewing, and its value is discarded.
   *
   * Hooks cannot be called conditionally, so this is not an optimisation that
   * was skipped — the alternative is two hooks and a branch, which is a rule
   * violation. The cost is a state update per interval that changes nothing on
   * screen, and it buys a live clock that is already correct the moment the user
   * presses "Now".
   */
  const now = useNow(intervalMs);

  return previewAt ? { at: previewAt, isLive: false } : { at: now, isLive: true };
}
