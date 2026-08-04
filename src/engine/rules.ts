/**
 * When does each authority charge, and when does that next change.
 *
 * The unifying insight of this engine: U-M permit lots have enforcement windows
 * exactly like city meters do. Once U-M's published prose is parsed into an
 * `EnforcementSchedule` (see enforcement.ts), all three authorities reduce to
 * the same question — is this schedule active at this instant — and the only
 * thing that differs is which holiday list applies. One engine, three
 * authorities.
 */

import { holidayAt, type Holiday } from './calendar';
import {
  isEnforced,
  MINUTES_PER_DAY,
  type EnforcementSchedule,
} from './enforcement';
import type { Authority } from './types';

/**
 * On-street meters: Monday through Saturday, 8am to 6pm.
 *
 * Verified 2026-08-03 from https://www.a2gov.org/services/parking/ :
 * "Public parking meters are enforced Monday through Saturday, 8 a.m.-6 p.m.
 * unless otherwise stated on the meter or central pay station. Cost is
 * $2.60/hour; free on evenings, Sundays and all holidays observed by City of
 * Ann Arbor employees."
 *
 * Saturday IS enforced. Sunday is not. Getting that pair backwards is the most
 * common wrong assumption about Ann Arbor parking.
 */
export const CITY_METER_SCHEDULE: EnforcementSchedule = {
  kind: 'daily',
  days: [1, 2, 3, 4, 5, 6],
  start: 8 * 60,
  end: 18 * 60,
};

/**
 * DDA structures and gated lots: free from Sunday 4am to Monday 4am.
 *
 * Verified 2026-08-03 from https://www.a2dda.org/parking-rates/ : "Parking
 * rates apply Monday-Saturday, while parking is free on Sunday
 * (Sunday 4am - Monday 4am)."
 *
 * Expressed as its inverse — enforced continuously from Monday 4am through
 * Sunday 4am — which is exactly the `continuous` shape U-M's multi-day spans
 * needed. That is not a coincidence worth hiding: both are "one unbroken
 * stretch across days", and modelling them the same way means the Sunday
 * boundary gets the same tested code path as everything else.
 *
 * The window is 4am to 4am, NOT midnight to midnight. A car parked at 2am
 * Sunday is still inside Saturday's paid period; a car still there at 5am
 * Monday is back in the paid period. A day-of-week check gets both ends wrong.
 */
export const CITY_STRUCTURE_SCHEDULE: EnforcementSchedule = {
  kind: 'continuous',
  startDay: 1,
  start: 4 * 60,
  endDay: 0,
  end: 4 * 60,
};

/** Why an area is free or paid right now, in language the UI can show directly. */
export interface ParkingStatus {
  /** True when money is owed at this instant. */
  paid: boolean;
  /**
   * False when the answer depends on data we do not have — currently only
   * structures on a possible holiday. The UI must caveat these, never present
   * them as certain, and must not render an uncertain answer as "FREE".
   */
  certain: boolean;
  /** Short, plain-language explanation. "Free on Sunday", not "outside enforcement window". */
  reason: string;
  /** Set when a holiday is what makes it free. */
  holiday?: Holiday;
}

/**
 * Is this area charging at `at`?
 *
 * Holidays are checked first because they override the weekly schedule
 * entirely — a city holiday makes meters free even at noon on a Tuesday.
 */
export function statusAt(
  authority: Authority,
  schedule: EnforcementSchedule | null,
  at: Date
): ParkingStatus {
  const holiday = holidayAt(authority, at);

  if (holiday.known && holiday.holiday) {
    return {
      paid: false,
      certain: true,
      reason: `Free — ${holiday.holiday.name}`,
      holiday: holiday.holiday,
    };
  }

  const enforced = isEnforced(schedule, at);

  // Structures on a day that MIGHT be a PCI holiday. We know the weekly rule
  // says paid, but we cannot rule out a holiday exemption because PCI does not
  // publish the list. Report paid — the safe direction — but flag it as
  // uncertain so the UI can say so rather than implying we checked.
  if (!holiday.known && enforced) {
    return {
      paid: true,
      certain: false,
      reason: 'Paid — but holiday closures for structures are not published',
    };
  }

  if (enforced) {
    return { paid: true, certain: true, reason: 'Paid right now' };
  }

  return {
    paid: false,
    certain: true,
    reason: freeReason(authority, at),
  };
}

function freeReason(authority: Authority, at: Date): string {
  switch (authority) {
    case 'city-meter':
      return 'Free — outside metered hours';
    case 'city-structure':
      return 'Free — Sunday';
    case 'umich':
      return 'Free — outside posted enforcement hours';
  }
}

/**
 * When does the paid/free state next flip, and to what?
 *
 * This is what drives the countdown, which is the app's headline feature —
 * "Free in 2h 18m" is the whole reason someone opens it.
 *
 * Implemented by scanning forward rather than by solving for boundaries
 * algebraically. That is deliberate: the state depends on a weekly schedule,
 * two DST transitions a year, and a holiday list, and a closed-form solution
 * would have to re-derive all three and stay in sync with them forever. A scan
 * asks the same `statusAt` the UI asks, so the countdown can never disagree
 * with the badge next to it.
 *
 * Coarse-then-fine keeps it cheap: 30-minute steps to bracket the change, then
 * minute steps to land on it. Roughly 400 evaluations for a typical lookahead
 * instead of 11,520.
 */
export function nextTransition(
  authority: Authority,
  schedule: EnforcementSchedule | null,
  at: Date,
  { horizonDays = 8 }: { horizonDays?: number } = {}
): { at: Date; paid: boolean } | null {
  const current = statusAt(authority, schedule, at).paid;
  const horizonMs = horizonDays * MINUTES_PER_DAY * 60_000;
  const coarseStep = 30 * 60_000;
  const fineStep = 60_000;

  let previous = at.getTime();
  for (let t = previous + coarseStep; t <= at.getTime() + horizonMs; t += coarseStep) {
    const candidate = new Date(t);
    if (statusAt(authority, schedule, candidate).paid !== current) {
      // The flip is somewhere in (previous, t]. Walk minutes to find it exactly.
      for (let f = previous + fineStep; f <= t; f += fineStep) {
        const fine = new Date(f);
        const paid = statusAt(authority, schedule, fine).paid;
        if (paid !== current) return { at: fine, paid };
      }
      // Unreachable unless the coarse and fine scans disagree, which would mean
      // a state change shorter than a minute. Report the coarse hit rather than
      // silently returning null.
      return { at: candidate, paid: !current };
    }
    previous = t;
  }

  // A 24/7 enforced lot never changes state, and neither does a permanently
  // free one. Null means "no change within the horizon", not "error".
  return null;
}
