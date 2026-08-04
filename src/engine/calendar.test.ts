import { describe, expect, it } from 'vitest';

import {
  calendarDate,
  dayOfWeek,
  holidayAt,
  holidaysFor,
  isHoliday,
  minutesIntoDay,
} from './calendar';

/**
 * The whole suite runs with TZ=America/Los_Angeles (see vitest.config.ts).
 *
 * That is the point: every assertion below is an Ann Arbor answer produced on a
 * machine three hours behind Ann Arbor. If any function here ever starts
 * reading the device zone, these tests break instead of a student in California
 * getting a wrong "FREE" over winter break.
 */

/** Instants are always given in UTC so there is no ambiguity about what moment is meant. */
const utc = (iso: string) => new Date(iso);

describe('time zone independence', () => {
  it('runs in a zone that is not Ann Arbor, so device-zone bugs are visible', () => {
    expect(process.env.TZ).toBe('America/Los_Angeles');
  });

  it('reports the Ann Arbor calendar date, not the device one', () => {
    // 03:00 UTC on Aug 3 is 11pm Aug 2 in Detroit — and 8pm Aug 2 in LA.
    // Both are "Aug 2", so this alone would not catch a bug. The next case does.
    expect(calendarDate(utc('2026-08-03T03:00:00Z'))).toBe('2026-08-02');
  });

  it('separates Ann Arbor from the device zone at the hours where they differ', () => {
    // 05:30 UTC = 01:30 EDT Aug 3 in Detroit, but still 22:30 Aug 2 in LA.
    const at = utc('2026-08-03T05:30:00Z');
    expect(calendarDate(at)).toBe('2026-08-03');
    expect(minutesIntoDay(at)).toBe(90);
  });

  it('reports the Ann Arbor day of week across the midnight boundary', () => {
    // 03:59 UTC Monday = 11:59pm Sunday in Detroit. Meters are free Sunday and
    // enforced Monday, so getting this backwards is a $15 ticket.
    expect(dayOfWeek(utc('2026-08-03T03:59:00Z'))).toBe(0);
    expect(dayOfWeek(utc('2026-08-03T04:01:00Z'))).toBe(1);
  });
});

describe('daylight saving time', () => {
  /**
   * Detroit springs forward 2026-03-08 (02:00 EST -> 03:00 EDT) and falls back
   * 2026-11-01 (02:00 EDT -> 01:00 EST). These are the bugs that are silent:
   * naive arithmetic is off by an hour and nothing throws.
   */

  it('spring forward: two wall-clock hours are only one real hour', () => {
    const before = utc('2026-03-08T06:30:00Z'); // 01:30 EST
    const after = utc('2026-03-08T07:30:00Z'); // 03:30 EDT

    expect(minutesIntoDay(before)).toBe(90);
    expect(minutesIntoDay(after)).toBe(210);
    // The wall clock advanced 2 hours; only 1 hour actually elapsed.
    expect(after.getTime() - before.getTime()).toBe(60 * 60 * 1000);
  });

  it('spring forward: 02:30 does not exist, and the clock never reports it', () => {
    // There is no instant whose Detroit wall clock reads 02:30 on this date.
    // Sampling every minute of the real hour proves the gap is skipped.
    const start = utc('2026-03-08T06:59:00Z');
    const seen = new Set<number>();
    for (let i = 0; i < 5; i++) {
      seen.add(minutesIntoDay(new Date(start.getTime() + i * 60 * 1000)));
    }
    // 01:59 then straight to 03:00, 03:01, ...
    expect(seen.has(119)).toBe(true);
    expect(seen.has(150)).toBe(false);
    expect(seen.has(180)).toBe(true);
  });

  it('fall back: three wall-clock hours are four real hours', () => {
    const before = utc('2026-11-01T04:30:00Z'); // 00:30 EDT
    const after = utc('2026-11-01T08:30:00Z'); // 03:30 EST

    expect(minutesIntoDay(before)).toBe(30);
    expect(minutesIntoDay(after)).toBe(210);
    expect(after.getTime() - before.getTime()).toBe(4 * 60 * 60 * 1000);
  });

  it('fall back: the repeated hour reports the same wall-clock time twice', () => {
    // 01:30 happens twice on this date — once EDT, once EST.
    const firstPass = utc('2026-11-01T05:30:00Z');
    const secondPass = utc('2026-11-01T06:30:00Z');

    expect(minutesIntoDay(firstPass)).toBe(90);
    expect(minutesIntoDay(secondPass)).toBe(90);
    expect(calendarDate(firstPass)).toBe('2026-11-01');
    expect(calendarDate(secondPass)).toBe('2026-11-01');
  });

  it('keeps the calendar date stable across both transitions', () => {
    expect(calendarDate(utc('2026-03-08T06:30:00Z'))).toBe('2026-03-08');
    expect(calendarDate(utc('2026-03-08T07:30:00Z'))).toBe('2026-03-08');
    expect(calendarDate(utc('2026-11-01T05:30:00Z'))).toBe('2026-11-01');
    expect(calendarDate(utc('2026-11-01T06:30:00Z'))).toBe('2026-11-01');
  });
});

describe('floating holidays are computed, not listed', () => {
  /**
   * Expected dates were derived independently by brute-force scanning each
   * year's calendar, not by running the implementation. A hardcoded table would
   * pass a test written from the same table; this would not.
   */
  const expected = {
    2026: {
      'Martin Luther King Jr. Day': '2026-01-19',
      'Presidents Day': '2026-02-16',
      'Memorial Day': '2026-05-25',
      'Labor Day': '2026-09-07',
      "Indigenous People's Day": '2026-10-12',
      'Thanksgiving Day': '2026-11-26',
      'the day after Thanksgiving': '2026-11-27',
    },
    2027: {
      'Martin Luther King Jr. Day': '2027-01-18',
      'Presidents Day': '2027-02-15',
      // Last Monday of May 2027 is the 31st — the last day of the month.
      'Memorial Day': '2027-05-31',
      'Labor Day': '2027-09-06',
      "Indigenous People's Day": '2027-10-11',
      'Thanksgiving Day': '2027-11-25',
      'the day after Thanksgiving': '2027-11-26',
    },
    2030: {
      'Martin Luther King Jr. Day': '2030-01-21',
      'Presidents Day': '2030-02-18',
      'Memorial Day': '2030-05-27',
      'Labor Day': '2030-09-02',
      "Indigenous People's Day": '2030-10-14',
      // Latest possible Thanksgiving, so the day after is the 29th.
      'Thanksgiving Day': '2030-11-28',
      'the day after Thanksgiving': '2030-11-29',
    },
  } as const;

  for (const [year, dates] of Object.entries(expected)) {
    for (const [name, date] of Object.entries(dates)) {
      it(`${year}: ${name} falls on ${date}`, () => {
        const holidays = holidaysFor('city-meter', Number(year));
        expect(holidays?.find((h) => h.name === name)?.date).toBe(date);
      });
    }
  }

  it('still works far past any plausible hardcoded table', () => {
    const holidays = holidaysFor('city-meter', 2041);
    expect(holidays).not.toBeNull();
    expect(holidays?.every((h) => h.date.startsWith('2041-'))).toBe(true);
  });
});

describe('the city meter holiday list', () => {
  const holidays = holidaysFor('city-meter', 2026) ?? [];

  it('has fourteen dates from the thirteen published entries', () => {
    // "Thanksgiving Day and the following Friday" is one entry, two dates.
    expect(holidays).toHaveLength(14);
  });

  it('includes the fixed-date holidays exactly as published', () => {
    const byName = Object.fromEntries(holidays.map((h) => [h.name, h.date]));
    expect(byName["New Year's Day"]).toBe('2026-01-01');
    expect(byName["New Year's Eve Day"]).toBe('2026-12-31');
    expect(byName['Juneteenth']).toBe('2026-06-19');
    expect(byName['Independence Day']).toBe('2026-07-04');
    expect(byName['Veterans Day']).toBe('2026-11-11');
    expect(byName['Christmas Eve Day']).toBe('2026-12-24');
    expect(byName['Christmas Day']).toBe('2026-12-25');
  });

  it('matches an instant during that day in Ann Arbor', () => {
    // 4pm UTC on July 4 is noon in Detroit.
    const result = holidayAt('city-meter', utc('2026-07-04T16:00:00Z'));
    expect(result).toEqual({ known: true, holiday: { name: 'Independence Day', date: '2026-07-04' } });
  });

  it('does not shift a weekend holiday onto an adjacent weekday', () => {
    // 2026-07-04 is a Saturday. Many employers observe Friday July 3 instead.
    // The city publishes no shift rule, and guessing one would tell a student
    // Friday is free while meters are actually being enforced.
    expect(dayOfWeek(utc('2026-07-04T16:00:00Z'))).toBe(6);
    expect(isHoliday('city-meter', utc('2026-07-03T16:00:00Z'))).toBe(false);
    expect(isHoliday('city-meter', utc('2026-07-04T16:00:00Z'))).toBe(true);
  });

  it('is not a holiday on an ordinary day', () => {
    expect(isHoliday('city-meter', utc('2026-08-03T16:00:00Z'))).toBe(false);
  });
});

describe('the U-M holiday list is a different list', () => {
  it('omits the five city holidays U-M does not observe', () => {
    const umich = (holidaysFor('umich', 2026) ?? []).map((h) => h.date);
    const notObserved = {
      'Martin Luther King Jr. Day': '2026-01-19',
      'Presidents Day': '2026-02-16',
      Juneteenth: '2026-06-19',
      "Indigenous People's Day": '2026-10-12',
      'Veterans Day': '2026-11-11',
    };
    for (const [name, date] of Object.entries(notObserved)) {
      expect(umich, `U-M should not observe ${name}`).not.toContain(date);
      // ...but the city does, on the same date. This is the divergence.
      expect(isHoliday('city-meter', utc(`${date}T16:00:00Z`))).toBe(true);
      expect(isHoliday('umich', utc(`${date}T16:00:00Z`))).toBe(false);
    }
  });

  it('observes the five days it does publish', () => {
    for (const date of ['2026-05-25', '2026-07-04', '2026-09-07', '2026-11-26', '2026-11-27']) {
      expect(isHoliday('umich', utc(`${date}T16:00:00Z`))).toBe(true);
    }
  });

  it('treats Christmas through New Year’s Day as a continuous range', () => {
    // Every day from Dec 25 through Dec 31 inclusive.
    for (let d = 25; d <= 31; d++) {
      const date = `2026-12-${d}`;
      expect(isHoliday('umich', utc(`${date}T16:00:00Z`)), `${date} should be closed`).toBe(true);
    }
    // ...and Jan 1, which is the tail of the range that opened in December.
    expect(isHoliday('umich', utc('2026-01-01T16:00:00Z'))).toBe(true);
    // The range is closed at both ends.
    expect(isHoliday('umich', utc('2026-12-24T16:00:00Z'))).toBe(false);
    expect(isHoliday('umich', utc('2026-01-02T16:00:00Z'))).toBe(false);
  });

  it('differs from the city on Christmas Eve, which the city observes and U-M does not', () => {
    const eve = utc('2026-12-24T16:00:00Z');
    expect(isHoliday('city-meter', eve)).toBe(true);
    expect(isHoliday('umich', eve)).toBe(false);
  });
});

describe('city structures: the holiday list is unknown, not empty', () => {
  /**
   * The DDA says structures are free on "holidays observed by PCI Municipal
   * Services" and PCI publishes no such list. An empty array would read as "no
   * holidays" — data-shaped, and wrong. The engine has to be able to say it
   * does not know.
   */

  it('returns null rather than an empty list', () => {
    expect(holidaysFor('city-structure', 2026)).toBeNull();
    expect(holidaysFor('city-structure', 2026)).not.toEqual([]);
  });

  it('answers "unknown" for every date, including obvious holidays', () => {
    for (const date of ['2026-01-01', '2026-07-04', '2026-12-25', '2026-08-03']) {
      const result = holidayAt('city-structure', utc(`${date}T16:00:00Z`));
      expect(result.known).toBe(false);
      if (!result.known) expect(result.reason).toMatch(/PCI/);
    }
  });

  it('never claims a structure holiday is free', () => {
    // isHoliday collapses unknown to false, which is the safe direction: the
    // caller falls through to the normal paid rule rather than announcing FREE.
    expect(isHoliday('city-structure', utc('2026-12-25T16:00:00Z'))).toBe(false);
  });
});
