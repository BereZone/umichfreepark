import { describe, expect, it } from 'vitest';

import { AREAS, areaById } from './data/areas';
import {
  DEFAULT_PROFILE,
  costCents,
  eligibilityFor,
  permitIsPlausible,
  rank,
  tradeOff,
  type Profile,
} from './ranking';
import { statusAt } from './rules';

const utc = (iso: string) => new Date(iso);

/** Tuesday 2026-08-04, noon in Detroit — everything is enforced. */
const WEEKDAY_NOON = utc('2026-08-04T16:00:00Z');
/** Sunday 2026-08-09, noon in Detroit — structures free, most U-M lots open. */
const SUNDAY_NOON = utc('2026-08-09T16:00:00Z');

describe('the default profile is the most restrictive one', () => {
  it('assumes a first-year with no permit', () => {
    expect(DEFAULT_PROFILE).toEqual({ classYear: 'first-year', permit: 'none' });
  });

  it('rejects a permit an underclass student could not hold', () => {
    expect(permitIsPlausible({ classYear: 'first-year', permit: 'orange' })).toBe(false);
    expect(permitIsPlausible({ classYear: 'sophomore', permit: 'blue' })).toBe(false);
    expect(permitIsPlausible({ classYear: 'junior', permit: 'orange' })).toBe(true);
    expect(permitIsPlausible({ classYear: 'graduate', permit: 'blue' })).toBe(true);
  });
});

describe('eligibility', () => {
  const orangeLot = AREAS.find((a) => a.permitTier === 'Orange')!;

  it('tells a first-year they cannot buy the permit, not merely that they lack it', () => {
    const status = statusAt(orangeLot.authority, orangeLot.schedule, WEEKDAY_NOON);
    const result = eligibilityFor(orangeLot, DEFAULT_PROFILE, status);
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/cannot buy one/i);
  });

  it('lets a junior with the right permit in', () => {
    const status = statusAt(orangeLot.authority, orangeLot.schedule, WEEKDAY_NOON);
    const junior: Profile = { classYear: 'junior', permit: 'orange' };
    expect(eligibilityFor(orangeLot, junior, status).eligible).toBe(true);
  });

  it('opens the same lot to the first-year once enforcement ends', () => {
    // This is the rule that makes the app useful to someone with no permit at
    // all, and it is why eligibility is evaluated against status, not in
    // isolation.
    const status = statusAt(orangeLot.authority, orangeLot.schedule, SUNDAY_NOON);
    expect(status.paid).toBe(false);
    expect(eligibilityFor(orangeLot, DEFAULT_PROFILE, status).eligible).toBe(true);
  });

  it('keeps a 24/7 lot closed to a first-year even on Sunday', () => {
    const always = AREAS.find(
      (a) => a.authority === 'umich' && a.note?.includes('24 hrs, 7 days')
    )!;
    const status = statusAt(always.authority, always.schedule, SUNDAY_NOON);
    expect(status.paid).toBe(true);
    expect(eligibilityFor(always, DEFAULT_PROFILE, status).eligible).toBe(false);
  });

  it('lets anyone pay at a city structure', () => {
    const maynard = areaById.get('maynard')!;
    const status = statusAt(maynard.authority, maynard.schedule, WEEKDAY_NOON);
    expect(eligibilityFor(maynard, DEFAULT_PROFILE, status).eligible).toBe(true);
  });

  it('lets anyone use the park-and-ride', () => {
    const parkRide = AREAS.find((a) => a.permitTier === 'Park & Ride')!;
    const status = statusAt(parkRide.authority, parkRide.schedule, WEEKDAY_NOON);
    expect(eligibilityFor(parkRide, DEFAULT_PROFILE, status).eligible).toBe(true);
  });

  it('ignores a permit the profile could not legally hold', () => {
    const status = statusAt(orangeLot.authority, orangeLot.schedule, WEEKDAY_NOON);
    const impossible: Profile = { classYear: 'first-year', permit: 'orange' };
    expect(eligibilityFor(orangeLot, impossible, status).eligible).toBe(false);
  });
});

describe('cost', () => {
  /** Tuesday 2026-08-04: 16:00Z = 12:00 noon, 20:00Z = 16:00 (after 3pm). */
  const TUE_NOON = utc('2026-08-04T16:00:00Z');
  const TUE_AFTER_3PM = utc('2026-08-04T20:00:00Z');
  /** Saturday 2026-08-08, 10am — the cap applies all day Saturday. */
  const SAT_MORNING = utc('2026-08-08T14:00:00Z');

  it('charges by the hour in exact cents', () => {
    expect(costCents({ kind: 'hourly', centsPerHour: 180 }, 3, false, TUE_NOON)).toBe(540);
    expect(costCents({ kind: 'hourly', centsPerHour: 260 }, 2.5, false, TUE_NOON)).toBe(650);
  });

  describe('a capped rate depends on when you arrive', () => {
    const laneRate = areaById.get('library-lane')!.rate;

    it('does NOT cap a midday arrival', () => {
      // Library Lane's cap is "after 3PM M-F, all day Saturday". Applying it at
      // noon quotes $5.00 for a stay that really costs $5.40 — under-quoting,
      // which is the wrong direction to be wrong.
      expect(costCents(laneRate, 3, false, TUE_NOON)).toBe(540);
      expect(costCents(laneRate, 8, false, TUE_NOON)).toBe(1440);
    });

    it('caps an arrival after 3pm on a weekday', () => {
      expect(costCents(laneRate, 8, false, TUE_AFTER_3PM)).toBe(500);
    });

    it('caps any arrival on a Saturday', () => {
      expect(costCents(laneRate, 8, false, SAT_MORNING)).toBe(500);
    });

    it('still charges hourly below the cap inside the window', () => {
      // The cap is a ceiling, not a flat fee: two hours after 3pm is $3.60.
      expect(costCents(laneRate, 2, false, TUE_AFTER_3PM)).toBe(360);
    });

    it('lands exactly on the 3pm boundary', () => {
      const justBefore = utc('2026-08-04T18:59:00Z'); // 14:59
      const justAfter = utc('2026-08-04T19:00:00Z'); // 15:00
      expect(costCents(laneRate, 8, false, justBefore)).toBe(1440);
      expect(costCents(laneRate, 8, false, justAfter)).toBe(500);
    });
  });

  it('is zero when the area is currently free, whatever the rate says', () => {
    expect(costCents({ kind: 'hourly', centsPerHour: 260 }, 5, true, TUE_NOON)).toBe(0);
  });

  it('returns null rather than zero when there is no price to show', () => {
    // Free and "nothing to buy" are different facts and must not collapse.
    expect(costCents({ kind: 'permit-only' }, 2, false, TUE_NOON)).toBeNull();
    expect(costCents({ kind: 'unknown' }, 2, false, TUE_NOON)).toBeNull();
  });
});

describe('ranking', () => {
  const args = { buildingId: 'mason-hall', durationHours: 3, at: WEEKDAY_NOON };

  it('puts eligible options ahead of ineligible ones', () => {
    const ranked = rank(AREAS, args);
    const firstIneligible = ranked.findIndex((o) => !o.eligibility.eligible);
    const lastEligible = ranked.map((o) => o.eligibility.eligible).lastIndexOf(true);
    expect(lastEligible).toBeLessThan(firstIneligible);
  });

  it('never drops ineligible options', () => {
    expect(rank(AREAS, args)).toHaveLength(AREAS.length);
  });

  it('cheapest mode leads with the lowest price', () => {
    const ranked = rank(AREAS, { ...args, mode: 'cheapest' }).filter(
      (o) => o.eligibility.eligible && o.costCents !== null
    );
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].costCents!).toBeGreaterThanOrEqual(ranked[i - 1].costCents!);
    }
  });

  it('closest mode leads with the shortest walk', () => {
    const ranked = rank(AREAS, { ...args, mode: 'closest' }).filter(
      (o) => o.eligibility.eligible && o.walkSeconds !== null
    );
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i].walkSeconds!).toBeGreaterThanOrEqual(ranked[i - 1].walkSeconds!);
    }
  });

  it('never sorts an unknown cost or walk to the top', () => {
    const ranked = rank(AREAS, { ...args, mode: 'cheapest' }).filter(
      (o) => o.eligibility.eligible
    );
    const firstUnknown = ranked.findIndex((o) => o.costCents === null);
    if (firstUnknown !== -1) {
      // Everything before it must have a real price.
      expect(ranked.slice(0, firstUnknown).every((o) => o.costCents !== null)).toBe(true);
    }
  });

  it('reranks when the clock crosses a transition', () => {
    const weekday = rank(AREAS, { ...args, mode: 'cheapest' })[0];
    const sunday = rank(AREAS, { ...args, at: SUNDAY_NOON, mode: 'cheapest' })[0];
    // On Sunday the structures are free, so the cheapest option costs nothing.
    expect(sunday.costCents).toBe(0);
    expect(weekday.area.id === sunday.area.id && weekday.costCents === 0).toBe(false);
  });

  it('gives a first-year a usable answer near central campus', () => {
    const ranked = rank(AREAS, args).filter((o) => o.eligibility.eligible);
    expect(ranked.length).toBeGreaterThan(0);
    const best = ranked[0];
    expect(best.walkSeconds).not.toBeNull();
    expect(best.eligibility.eligible).toBe(true);
  });
});

describe('trade-off sentences', () => {
  it('states the money and the walk together', () => {
    const cheaperFurther = {
      costCents: 300,
      walkSeconds: 900,
    } as Parameters<typeof tradeOff>[0];
    const dearerCloser = {
      costCents: 800,
      walkSeconds: 300,
    } as Parameters<typeof tradeOff>[1];
    expect(tradeOff(cheaperFurther, dearerCloser)).toBe('$5.00 cheaper, 10 min further');
  });

  it('says so when an option simply wins on both', () => {
    const better = { costCents: 300, walkSeconds: 300 } as Parameters<typeof tradeOff>[0];
    const worse = { costCents: 800, walkSeconds: 900 } as Parameters<typeof tradeOff>[1];
    expect(tradeOff(better, worse)).toBe('$5.00 cheaper and closer');
  });

  it('stays silent rather than inventing a comparison', () => {
    const noPrice = { costCents: null, walkSeconds: 300 } as Parameters<typeof tradeOff>[0];
    const other = { costCents: 800, walkSeconds: 900 } as Parameters<typeof tradeOff>[1];
    expect(tradeOff(noPrice, other)).toBeNull();
  });
});
