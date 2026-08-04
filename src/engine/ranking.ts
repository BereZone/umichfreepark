/**
 * Who can park where, what it costs them, and which option to show first.
 *
 * The default profile is the most restrictive one — a first-year with no
 * permit. That is deliberate: an app nobody has configured must never tell
 * someone they can park somewhere they cannot. Being wrong in the other
 * direction sends them to a lot they are not allowed to use.
 */

import type { ResolvedArea } from './data/areas';
import { isEnforced } from './enforcement';
import { statusAt, type ParkingStatus } from './rules';
import type { Rate } from './types';
import { walkSeconds } from './walk';

/**
 * Class year matters because U-M restricts commuter permits by it.
 *
 * Verified 2026-08-03 from LTP: "Student parking permits are available to
 * junior, senior and graduate students… All students, including freshmen and
 * sophomores, are eligible to purchase Student Storage parking permits."
 * Storage is a park-it-and-leave-it lot, not a way to get to class.
 */
export type ClassYear = 'first-year' | 'sophomore' | 'junior' | 'senior' | 'graduate';

/** U-M permit tiers a student might actually hold. */
export type HeldPermit = 'none' | 'orange' | 'yellow-after-hours' | 'after-hours' | 'blue';

export interface Profile {
  classYear: ClassYear;
  permit: HeldPermit;
}

/** The most restrictive case, and therefore the safe default. */
export const DEFAULT_PROFILE: Profile = { classYear: 'first-year', permit: 'none' };

const UNDERCLASS: ClassYear[] = ['first-year', 'sophomore'];

/** Can this profile legally hold the permit it claims? */
export function permitIsPlausible(profile: Profile): boolean {
  if (profile.permit === 'none') return true;
  return !UNDERCLASS.includes(profile.classYear);
}

export interface Eligibility {
  eligible: boolean;
  /** Plain language, shown directly to the user. Never a code. */
  reason: string;
}

/**
 * May this profile park in this area at this instant?
 *
 * Note the ordering: an area that is currently free is open to everyone,
 * regardless of permit. That is the whole point of LTP's "open to the public
 * outside enforcement hours" rule, and it is what makes U-M lots useful to a
 * first-year who cannot buy any permit at all.
 */
export function eligibilityFor(
  area: ResolvedArea,
  profile: Profile,
  status: ParkingStatus
): Eligibility {
  if (!status.paid) {
    return { eligible: true, reason: 'Open to anyone right now' };
  }

  if (area.authority !== 'umich') {
    // City structures, lots and meters sell to anyone who pays.
    return { eligible: true, reason: 'Pay at the meter or on the way out' };
  }

  if (area.rate.kind === 'free') {
    return { eligible: true, reason: 'Free park-and-ride, no permit needed' };
  }

  const tier = area.permitTier ?? 'permit';
  if (profile.permit === 'none') {
    if (UNDERCLASS.includes(profile.classYear)) {
      return {
        eligible: false,
        reason: `${tier} permit required, and first-years and sophomores cannot buy one`,
      };
    }
    return { eligible: false, reason: `${tier} permit required — you do not have one` };
  }

  // A held permit is only meaningful if the profile could legally hold it.
  if (!permitIsPlausible(profile)) {
    return {
      eligible: false,
      reason: 'U-M does not issue commuter permits to first-years or sophomores',
    };
  }

  // Blue covers Yellow and Orange; Orange covers only Orange.
  const covers: Record<HeldPermit, string[]> = {
    none: [],
    orange: ['Orange'],
    'yellow-after-hours': ['Orange', 'Yellow'],
    'after-hours': [],
    blue: ['Blue', 'Yellow', 'Orange'],
  };
  if (covers[profile.permit].includes(tier)) {
    return { eligible: true, reason: `Your ${profile.permit} permit is valid here` };
  }
  return { eligible: false, reason: `${tier} permit required` };
}

/**
 * What `durationHours` costs at this area, in whole cents, or null when we
 * cannot say.
 *
 * `arrivingAt` matters because a capped rate can depend on when you arrive —
 * Library Lane's $5 cap applies only from 3pm on weekdays and all day
 * Saturday. Applying it at every hour would quote $5.00 for a three-hour
 * midday stay that actually costs $5.40.
 *
 * Null covers two different situations that must not be shown as $0: a rate we
 * could not source, and a permit-only lot where there is nothing to buy.
 */
export function costCents(
  rate: Rate,
  durationHours: number,
  isFree: boolean,
  arrivingAt: Date
): number | null {
  if (isFree) return 0;
  switch (rate.kind) {
    case 'free':
      return 0;
    case 'hourly': {
      const full = Math.round(rate.centsPerHour * durationHours);
      if (!rate.cap) return full;
      const capApplies =
        rate.cap.windows.length === 0 ||
        rate.cap.windows.some((w) => isEnforced(w, arrivingAt));
      return capApplies ? Math.min(full, rate.cap.cents) : full;
    }
    case 'flat':
      return rate.cents;
    case 'permit-only':
    case 'unknown':
      return null;
  }
}

export type RankingMode = 'cheapest' | 'closest' | 'balanced';

export interface RankedOption {
  area: ResolvedArea;
  status: ParkingStatus;
  eligibility: Eligibility;
  /** null when the area has no polygon, so no walking time could be routed. */
  walkSeconds: number | null;
  /** null when there is no purchasable price — permit-only or unsourced. */
  costCents: number | null;
}

/**
 * Rank areas for a destination.
 *
 * Ineligible options are ranked last but never dropped. Hiding them would
 * leave a first-year wondering why the lot they can see out the window is not
 * on the list; showing them with a plain reason teaches the rule instead.
 */
export function rank(
  areas: readonly ResolvedArea[],
  {
    buildingId,
    durationHours,
    at,
    mode = 'balanced',
    profile = DEFAULT_PROFILE,
  }: {
    buildingId: string;
    durationHours: number;
    at: Date;
    mode?: RankingMode;
    profile?: Profile;
  }
): RankedOption[] {
  const options: RankedOption[] = areas.map((area) => {
    const status = statusAt(area.authority, area.schedule, at);
    const eligibility = eligibilityFor(area, profile, status);
    return {
      area,
      status,
      eligibility,
      walkSeconds: walkSeconds(buildingId, area.id),
      costCents: costCents(area.rate, durationHours, !status.paid, at),
    };
  });

  // A missing value must never sort as "best". Unknown cost and unknown walk
  // both sort to the end of their key rather than to the front.
  const cost = (o: RankedOption) => o.costCents ?? Number.POSITIVE_INFINITY;
  const walk = (o: RankedOption) => o.walkSeconds ?? Number.POSITIVE_INFINITY;

  const score = (o: RankedOption) => {
    switch (mode) {
      case 'cheapest':
        return [cost(o), walk(o)];
      case 'closest':
        return [walk(o), cost(o)];
      case 'balanced':
        // One minute of walking is treated as worth about 10 cents, which puts
        // a $1 saving on par with a ten-minute detour. It is a judgement call,
        // stated here rather than hidden in a magic constant.
        return [cost(o) + (walk(o) / 60) * 10, walk(o)];
    }
  };

  return options.sort((a, b) => {
    if (a.eligibility.eligible !== b.eligibility.eligible) {
      return a.eligibility.eligible ? -1 : 1;
    }
    const [a0, a1] = score(a);
    const [b0, b1] = score(b);
    return a0 - b0 || a1 - b1;
  });
}

/**
 * The trade-off between two options, as a sentence.
 *
 * This is engine output rather than UI copy on purpose: it is a factual
 * comparison of two numbers, and putting it here means the list view and the
 * map panel cannot word it differently.
 */
export function tradeOff(better: RankedOption, other: RankedOption): string | null {
  if (better.costCents === null || other.costCents === null) return null;
  if (better.walkSeconds === null || other.walkSeconds === null) return null;

  const centsSaved = other.costCents - better.costCents;
  const minutesExtra = Math.round((better.walkSeconds - other.walkSeconds) / 60);

  if (centsSaved > 0 && minutesExtra > 0) {
    return `$${(centsSaved / 100).toFixed(2)} cheaper, ${minutesExtra} min further`;
  }
  if (centsSaved > 0 && minutesExtra <= 0) {
    return `$${(centsSaved / 100).toFixed(2)} cheaper and closer`;
  }
  if (centsSaved <= 0 && minutesExtra < 0) {
    return `${Math.abs(minutesExtra)} min closer`;
  }
  return null;
}
