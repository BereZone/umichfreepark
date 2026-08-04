import { describe, expect, it } from 'vitest';

import { calendarDate, minutesIntoDay } from './calendar';
import { parseEnforcementHours } from './enforcement';
import {
  CITY_METER_SCHEDULE,
  CITY_STRUCTURE_SCHEDULE,
  nextTransition,
  nextTransitionOf,
  statusAt,
  statusOf,
} from './rules';
import { AREAS } from './data/areas';

const utc = (iso: string) => new Date(iso);

/** Ann Arbor wall-clock summary of an instant, for readable failures. */
const stamp = (d: Date) => {
  const m = minutesIntoDay(d);
  return `${calendarDate(d)} ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

describe('city meters', () => {
  const meter = (iso: string) => statusAt('city-meter', CITY_METER_SCHEDULE, utc(iso));

  it('charges midday on a weekday', () => {
    // 2026-08-04 is a Tuesday. 16:00Z = 12:00 EDT.
    expect(meter('2026-08-04T16:00:00Z').paid).toBe(true);
  });

  it('is free before 8am and after 6pm', () => {
    expect(meter('2026-08-04T11:59:00Z').paid).toBe(false); // 07:59 EDT
    expect(meter('2026-08-04T12:00:00Z').paid).toBe(true); // 08:00 EDT
    expect(meter('2026-08-04T21:59:00Z').paid).toBe(true); // 17:59 EDT
    expect(meter('2026-08-04T22:00:00Z').paid).toBe(false); // 18:00 EDT
  });

  it('charges on Saturday but not Sunday', () => {
    // This pair is the most common wrong assumption about Ann Arbor parking.
    expect(meter('2026-08-08T16:00:00Z').paid).toBe(true); // Sat noon
    expect(meter('2026-08-09T16:00:00Z').paid).toBe(false); // Sun noon
  });

  it('is free all day on a city holiday, even midday on a weekday', () => {
    // 2026-11-11 is a Wednesday and Veterans Day.
    const status = meter('2026-11-11T17:00:00Z'); // 12:00 EST
    expect(status.paid).toBe(false);
    expect(status.certain).toBe(true);
    expect(status.holiday?.name).toBe('Veterans Day');
    expect(status.reason).toContain('Veterans Day');
  });
});

describe('city structures: the Sunday 4am window', () => {
  const structure = (iso: string) =>
    statusAt('city-structure', CITY_STRUCTURE_SCHEDULE, utc(iso));

  it('still charges at 2am Sunday — that is Saturday’s paid period', () => {
    // 2026-08-09 is a Sunday. 06:00Z = 02:00 EDT Sunday.
    expect(structure('2026-08-09T06:00:00Z').paid).toBe(true);
  });

  it('goes free exactly at 4am Sunday', () => {
    expect(structure('2026-08-09T07:59:00Z').paid).toBe(true); // 03:59 EDT
    expect(structure('2026-08-09T08:00:00Z').paid).toBe(false); // 04:00 EDT
  });

  it('is still free at 3:59am Monday and charging again at 4:01am', () => {
    // 2026-08-10 is a Monday. 07:59Z = 03:59 EDT.
    expect(structure('2026-08-10T07:59:00Z').paid).toBe(false);
    expect(structure('2026-08-10T08:01:00Z').paid).toBe(true);
  });

  it('is free all day Sunday between those boundaries', () => {
    for (const hour of ['12:00', '16:00', '23:00']) {
      const at = utc(`2026-08-09T${hour}:00Z`);
      expect(structure(at.toISOString()).paid, stamp(at)).toBe(false);
    }
  });

  it('a naive day-of-week check would get both ends wrong', () => {
    // Sunday 02:00 is Sunday by the calendar but paid by the rule...
    expect(structure('2026-08-09T06:00:00Z').paid).toBe(true);
    // ...and Monday 02:00 is Monday by the calendar but free by the rule.
    expect(structure('2026-08-10T06:00:00Z').paid).toBe(false);
  });

  it('reports paid-but-uncertain on a possible holiday, never free', () => {
    // Christmas Day 2026 is a Friday. The DDA says structures are free on
    // holidays PCI observes; PCI publishes no list. We must not claim free.
    const status = structure('2026-12-25T17:00:00Z');
    expect(status.paid).toBe(true);
    expect(status.certain).toBe(false);
    expect(status.reason).toMatch(/not published/i);
  });

  it('is certain when the weekly rule already makes it free', () => {
    // Sunday needs no holiday list to be free, so no caveat is warranted.
    const status = structure('2026-08-09T16:00:00Z');
    expect(status.paid).toBe(false);
    expect(status.certain).toBe(true);
  });
});

describe('U-M lots use the same engine', () => {
  const blue = parseEnforcementHours('6am – 5pm, Mon – Fri');

  it('charges inside the posted window', () => {
    expect(statusAt('umich', blue, utc('2026-08-04T16:00:00Z')).paid).toBe(true);
  });

  it('is free outside it, which is what LTP means by open to the public', () => {
    expect(statusAt('umich', blue, utc('2026-08-04T23:00:00Z')).paid).toBe(false); // 19:00
    expect(statusAt('umich', blue, utc('2026-08-09T16:00:00Z')).paid).toBe(false); // Sunday
  });

  it('is free on a U-M holiday', () => {
    // Labor Day 2026 is Monday Sept 7.
    const status = statusAt('umich', blue, utc('2026-09-07T16:00:00Z'));
    expect(status.paid).toBe(false);
    expect(status.holiday?.name).toBe('Labor Day');
  });

  it('still charges on MLK Day, which U-M does not observe but the city does', () => {
    // 2026-01-19, a Monday. The divergence that would cost a ticket.
    const at = utc('2026-01-19T17:00:00Z'); // 12:00 EST
    expect(statusAt('umich', blue, at).paid).toBe(true);
    expect(statusAt('city-meter', CITY_METER_SCHEDULE, at).paid).toBe(false);
  });

  it('never reports free for a 24/7 lot', () => {
    const always = parseEnforcementHours('24 hrs, 7 days');
    for (const iso of ['2026-08-09T16:00:00Z', '2026-08-04T07:00:00Z']) {
      expect(statusAt('umich', always, utc(iso)).paid, iso).toBe(true);
    }
  });

  it('assumes paid when the published hours could not be parsed', () => {
    expect(statusAt('umich', null, utc('2026-08-09T16:00:00Z')).paid).toBe(true);
  });
});

describe('nextTransition drives the countdown', () => {
  it('finds 6pm from a weekday afternoon at meters', () => {
    const at = utc('2026-08-04T20:00:00Z'); // 16:00 EDT Tuesday
    const next = nextTransition('city-meter', CITY_METER_SCHEDULE, at);
    expect(next).not.toBeNull();
    expect(next!.paid).toBe(false);
    expect(stamp(next!.at)).toBe('2026-08-04 18:00');
  });

  it('finds 8am the next morning from a weekday evening', () => {
    const at = utc('2026-08-04T23:00:00Z'); // 19:00 EDT Tuesday
    const next = nextTransition('city-meter', CITY_METER_SCHEDULE, at);
    expect(next!.paid).toBe(true);
    expect(stamp(next!.at)).toBe('2026-08-05 08:00');
  });

  it('skips Sunday entirely, landing on Monday 8am', () => {
    const at = utc('2026-08-09T16:00:00Z'); // Sunday noon
    const next = nextTransition('city-meter', CITY_METER_SCHEDULE, at);
    expect(next!.paid).toBe(true);
    expect(stamp(next!.at)).toBe('2026-08-10 08:00');
  });

  it('finds Sunday 4am for a structure', () => {
    const at = utc('2026-08-07T16:00:00Z'); // Friday noon
    const next = nextTransition('city-structure', CITY_STRUCTURE_SCHEDULE, at);
    expect(next!.paid).toBe(false);
    expect(stamp(next!.at)).toBe('2026-08-09 04:00');
  });

  it('finds Monday 4am from inside the free Sunday window', () => {
    const at = utc('2026-08-09T16:00:00Z');
    const next = nextTransition('city-structure', CITY_STRUCTURE_SCHEDULE, at);
    expect(next!.paid).toBe(true);
    expect(stamp(next!.at)).toBe('2026-08-10 04:00');
  });

  it('returns null for a lot whose state never changes', () => {
    const always = parseEnforcementHours('24 hrs, 7 days');
    expect(nextTransition('umich', always, utc('2026-08-04T16:00:00Z'))).toBeNull();
  });

  it('agrees with statusAt on both sides of the boundary it reports', () => {
    // The countdown must never disagree with the badge next to it.
    const at = utc('2026-08-04T20:00:00Z');
    const next = nextTransition('city-meter', CITY_METER_SCHEDULE, at)!;
    const justBefore = new Date(next.at.getTime() - 60_000);
    expect(statusAt('city-meter', CITY_METER_SCHEDULE, justBefore).paid).toBe(!next.paid);
    expect(statusAt('city-meter', CITY_METER_SCHEDULE, next.at).paid).toBe(next.paid);
  });

  describe('across daylight saving time', () => {
    /**
     * Both US transitions happen at 2am local, which is BEFORE the structures'
     * 4am boundary. So the free Sunday window never contains a transition and
     * is always exactly 24 real hours — the 4am choice sidesteps the ambiguity
     * rather than living with it.
     *
     * The transition instead lands inside the PAID period, which is precisely
     * what a Saturday-evening countdown to "free at 4am Sunday" has to cross.
     * That is where wall-clock arithmetic goes wrong by an hour.
     */

    it('spring forward: a countdown across it is an hour SHORTER than the clock suggests', () => {
      // Saturday 2026-03-07 20:00 EST. Free begins Sunday 04:00 EDT.
      // The wall clock advances 8 hours; only 7 actually elapse.
      const saturdayEvening = utc('2026-03-08T01:00:00Z');
      expect(stamp(saturdayEvening)).toBe('2026-03-07 20:00');

      const next = nextTransition('city-structure', CITY_STRUCTURE_SCHEDULE, saturdayEvening)!;
      expect(next.paid).toBe(false);
      expect(stamp(next.at)).toBe('2026-03-08 04:00');
      expect((next.at.getTime() - saturdayEvening.getTime()) / 3_600_000).toBe(7);
    });

    it('fall back: the same countdown is an hour LONGER', () => {
      // Saturday 2026-10-31 20:00 EDT. Free begins Sunday 04:00 EST.
      // The wall clock advances 8 hours; 9 actually elapse.
      const saturdayEvening = utc('2026-11-01T00:00:00Z');
      expect(stamp(saturdayEvening)).toBe('2026-10-31 20:00');

      const next = nextTransition('city-structure', CITY_STRUCTURE_SCHEDULE, saturdayEvening)!;
      expect(next.paid).toBe(false);
      expect(stamp(next.at)).toBe('2026-11-01 04:00');
      expect((next.at.getTime() - saturdayEvening.getTime()) / 3_600_000).toBe(9);
    });

    it('naive wall-clock arithmetic would be an hour wrong in both directions', () => {
      const spring = utc('2026-03-08T01:00:00Z');
      const fall = utc('2026-11-01T00:00:00Z');
      const elapsed = (from: Date) =>
        (nextTransition('city-structure', CITY_STRUCTURE_SCHEDULE, from)!.at.getTime() -
          from.getTime()) /
        3_600_000;

      // Both start at 20:00 on a Saturday and end at 04:00 on the Sunday, so a
      // wall-clock reading calls both 8 hours. They differ by two.
      expect(elapsed(spring)).toBe(7);
      expect(elapsed(fall)).toBe(9);
      expect(elapsed(fall) - elapsed(spring)).toBe(2);
    });

    it('the free Sunday window itself is exactly 24 hours in both directions', () => {
      // Because 4am clears the 2am transition at both ends of the year.
      for (const [label, freeFrom] of [
        ['spring', utc('2026-03-08T08:00:00Z')],
        ['fall', utc('2026-11-01T09:00:00Z')],
      ] as const) {
        expect(stamp(freeFrom).endsWith('04:00'), label).toBe(true);
        expect(statusAt('city-structure', CITY_STRUCTURE_SCHEDULE, freeFrom).paid).toBe(false);
        const next = nextTransition('city-structure', CITY_STRUCTURE_SCHEDULE, freeFrom)!;
        expect(next.paid, label).toBe(true);
        expect((next.at.getTime() - freeFrom.getTime()) / 3_600_000, label).toBe(24);
      }
    });
  });

  it('finds the end of a holiday as a transition', () => {
    // Veterans Day 2026 is Wednesday Nov 11; meters resume Thursday 8am.
    const at = utc('2026-11-11T17:00:00Z');
    const next = nextTransition('city-meter', CITY_METER_SCHEDULE, at)!;
    expect(next.paid).toBe(true);
    expect(stamp(next.at)).toBe('2026-11-12 08:00');
  });
});

describe('statusOf — the rate has the first word', () => {
  const parkRide = {
    authority: 'umich' as const,
    rate: { kind: 'free' as const },
    // The posted window a park-and-ride really does carry. It says who the lot
    // is for, not what it costs, which is the whole point of this test.
    schedule: parseEnforcementHours('7am – 7pm, Mon – Fri'),
  };

  const permitLot = {
    authority: 'umich' as const,
    rate: { kind: 'permit-only' as const },
    schedule: parseEnforcementHours('7am – 7pm, Mon – Fri'),
  };

  /** Tuesday 2026-08-04, 12:00 EDT — squarely inside that window. */
  const insideWindow = utc('2026-08-04T16:00:00Z');
  /** Tuesday 2026-08-04, 22:00 EDT — outside it. */
  const outsideWindow = utc('2026-08-05T02:00:00Z');

  it('reports a free lot as free inside its posted hours', () => {
    // The bug this replaced: statusAt saw an active schedule and said "paid"
    // about a lot LTP publishes as free with no permit required.
    expect(statusOf(parkRide, insideWindow).paid).toBe(false);
  });

  it('reports a free lot as free outside them too', () => {
    expect(statusOf(parkRide, outsideWindow).paid).toBe(false);
  });

  it('says so with certainty, since nothing about it is inferred', () => {
    const status = statusOf(parkRide, insideWindow);
    expect(status.certain).toBe(true);
    expect(status.reason).toMatch(/free/i);
  });

  it('never offers a countdown for a lot that does not change', () => {
    // A free lot with a schedule would otherwise produce a countdown to 7pm,
    // implying something happens then. Nothing does.
    expect(nextTransitionOf(parkRide, insideWindow)).toBeNull();
  });

  it('still defers to the schedule for everything that is not free', () => {
    expect(statusOf(permitLot, insideWindow).paid).toBe(true);
    expect(statusOf(permitLot, outsideWindow).paid).toBe(false);
    expect(nextTransitionOf(permitLot, insideWindow)).not.toBeNull();
  });

  it('agrees with statusAt wherever the rate is not free', () => {
    for (const at of [insideWindow, outsideWindow]) {
      expect(statusOf(permitLot, at)).toEqual(
        statusAt(permitLot.authority, permitLot.schedule, at)
      );
    }
  });
});

describe('every park-and-ride in the shipped data', () => {
  const parkRides = AREAS.filter((a) => a.rate.kind === 'free');

  it('exists — otherwise this suite is asserting nothing', () => {
    expect(parkRides.length).toBeGreaterThan(0);
  });

  it('is free at every hour of the week', () => {
    // Steps of 5 hours to cover every weekday and every part of the day
    // without walking 168 instants.
    for (const area of parkRides) {
      for (let hour = 0; hour < 168; hour += 5) {
        const at = new Date(utc('2026-08-03T04:00:00Z').getTime() + hour * 3_600_000);
        expect(statusOf(area, at).paid, `${area.id} at ${stamp(at)}`).toBe(false);
      }
    }
  });
});
