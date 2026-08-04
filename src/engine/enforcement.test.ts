import { describe, expect, it } from 'vitest';

import {
  MINUTES_PER_DAY,
  isEnforced,
  parseClockTime,
  parseEnforcementHours,
} from './enforcement';
import umichLots from './data/umich-lots.json';

const utc = (iso: string) => new Date(iso);

/** Every distinct enforcement string actually present in the shipped dataset. */
const publishedStrings = [
  ...new Set(
    umichLots.campuses.flatMap((c) => c.lots.map((l) => l.enforcementHours as string))
  ),
];

describe('parseClockTime', () => {
  it('parses the spellings LTP actually uses', () => {
    expect(parseClockTime('6am')).toBe(6 * 60);
    expect(parseClockTime('5pm')).toBe(17 * 60);
    expect(parseClockTime('10 pm')).toBe(22 * 60);
    expect(parseClockTime('6:30am')).toBe(6 * 60 + 30);
    expect(parseClockTime('6:30pm')).toBe(18 * 60 + 30);
    expect(parseClockTime('1 am')).toBe(60);
  });

  it('gets the two irregular hours of the 12-hour clock right', () => {
    // This is where an off-by-720 bug hides: 12am is midnight, 12pm is noon.
    expect(parseClockTime('12am')).toBe(0);
    expect(parseClockTime('12pm')).toBe(720);
    expect(parseClockTime('12:30am')).toBe(30);
    expect(parseClockTime('12:30pm')).toBe(750);
  });

  it('rejects nonsense rather than guessing', () => {
    for (const bad of ['', '25am', '0am', '6', 'noon', '6:99am', 'am']) {
      expect(parseClockTime(bad), bad).toBeNull();
    }
  });
});

describe('parsing the real published strings', () => {
  it('found the dataset', () => {
    expect(publishedStrings.length).toBeGreaterThan(10);
  });

  it('understands every published string that states a schedule at all', () => {
    const unparsed = publishedStrings.filter((s) => parseEnforcementHours(s) === null);

    // Exactly two shapes are allowed to fail, and neither is a parser gap.
    //
    // "NA" is LTP declining to state hours for a service dock. There is nothing
    // to parse, and inventing a window would be the dangerous direction.
    const notStated = unparsed.filter((s) => /^n\s*\/?\s*a$/i.test(s.trim()));
    // The one row that packs two different schedules into a single cell:
    // "Permit areas 6am – 10 pm, Mon – Sat Visitor area 6am Mon – 10pm Sat, continuously"
    // Applying half of it would be worse than applying none.
    const compound = unparsed.filter((s) => /permit areas/i.test(s));

    expect(notStated).toHaveLength(1);
    expect(compound).toHaveLength(1);
    // Anything else appearing here is a real parser gap, not a source gap.
    expect(unparsed).toHaveLength(notStated.length + compound.length);
  });

  it('normalizes the en-dash and the ASCII hyphen to the same result', () => {
    // "5am – 5pm, Mon-Fri" mixes both in one string.
    expect(parseEnforcementHours('6am – 5pm, Mon – Fri')).toEqual(
      parseEnforcementHours('6am - 5pm, Mon-Fri')
    );
  });

  it('treats "7 Days" and "Sun-Sat" as the same week', () => {
    const a = parseEnforcementHours('6am – 5pm, 7 Days');
    const b = parseEnforcementHours('6am – 5pm Sun-Sat');
    expect(a).toEqual(b);
    expect(a).toEqual({ kind: 'daily', days: [0, 1, 2, 3, 4, 5, 6], start: 360, end: 1020 });
  });

  it('parses the common weekday window', () => {
    expect(parseEnforcementHours('6am – 5pm, Mon – Fri')).toEqual({
      kind: 'daily',
      days: [1, 2, 3, 4, 5],
      start: 360,
      end: 1020,
    });
  });

  it('parses 24/7 as a full-day window on every day', () => {
    expect(parseEnforcementHours('24 hrs, 7 days')).toEqual({
      kind: 'daily',
      days: [0, 1, 2, 3, 4, 5, 6],
      start: 0,
      end: MINUTES_PER_DAY,
    });
  });

  it('parses "24 hrs, Mon – Sat", which is NOT 24/7', () => {
    expect(parseEnforcementHours('24 hrs, Mon – Sat')).toEqual({
      kind: 'daily',
      days: [1, 2, 3, 4, 5, 6],
      start: 0,
      end: MINUTES_PER_DAY,
    });
  });

  it('parses a continuous multi-day span as a span, not a daily window', () => {
    // "6 am Mon – 1 am Sat" is one unbroken stretch, NOT 6am-1am each day.
    expect(parseEnforcementHours('6 am Mon – 1 am Sat')).toEqual({
      kind: 'continuous',
      startDay: 1,
      start: 360,
      endDay: 6,
      end: 60,
    });
  });

  it('parses the half-hour window', () => {
    expect(parseEnforcementHours('6:30am – 6:30pm, Mon – Fri')).toEqual({
      kind: 'daily',
      days: [1, 2, 3, 4, 5],
      start: 390,
      end: 1110,
    });
  });
});

describe('isEnforced', () => {
  const weekday = parseEnforcementHours('6am – 5pm, Mon – Fri');

  // 2026-08-03 is a Monday. 16:00 UTC = 12:00 EDT.
  it('is enforced inside the window on a listed day', () => {
    expect(isEnforced(weekday, utc('2026-08-03T16:00:00Z'))).toBe(true);
  });

  it('is not enforced before it opens or after it closes', () => {
    expect(isEnforced(weekday, utc('2026-08-03T09:59:00Z'))).toBe(false); // 05:59 EDT
    expect(isEnforced(weekday, utc('2026-08-03T21:01:00Z'))).toBe(false); // 17:01 EDT
  });

  it('is exact at both boundaries', () => {
    // Start is inclusive, end is exclusive: at 5:00pm sharp you are free.
    expect(isEnforced(weekday, utc('2026-08-03T10:00:00Z'))).toBe(true); // 06:00 EDT
    expect(isEnforced(weekday, utc('2026-08-03T09:59:00Z'))).toBe(false);
    expect(isEnforced(weekday, utc('2026-08-03T21:00:00Z'))).toBe(false); // 17:00 EDT
    expect(isEnforced(weekday, utc('2026-08-03T20:59:00Z'))).toBe(true);
  });

  it('is not enforced on an unlisted day', () => {
    // 2026-08-08 is a Saturday, 2026-08-09 a Sunday.
    expect(isEnforced(weekday, utc('2026-08-08T16:00:00Z'))).toBe(false);
    expect(isEnforced(weekday, utc('2026-08-09T16:00:00Z'))).toBe(false);
  });

  it('answers in Ann Arbor time, not the device time zone', () => {
    // 2026-08-04T02:00Z is 22:00 Monday in Detroit (outside the window) but
    // 19:00 Monday in Los Angeles. A device-zone bug would also say false here,
    // so pair it with an instant where the two disagree about the DAY.
    // 2026-08-04T05:30Z = 01:30 Tue Detroit, still 22:30 Mon in LA.
    expect(isEnforced(weekday, utc('2026-08-04T05:30:00Z'))).toBe(false);
    // 2026-08-04T11:00Z = 07:00 Tue Detroit (enforced) and 04:00 Tue LA (not).
    expect(isEnforced(weekday, utc('2026-08-04T11:00:00Z'))).toBe(true);
  });

  describe('24/7 lots are never open to the public', () => {
    const always = parseEnforcementHours('24 hrs, 7 days');
    it('is enforced at every hour sampled across a week', () => {
      for (let h = 0; h < 24 * 7; h += 7) {
        const at = new Date(Date.UTC(2026, 7, 3, 4) + h * 3600 * 1000);
        expect(isEnforced(always, at), at.toISOString()).toBe(true);
      }
    });
  });

  describe('"24 hrs, Mon – Sat" frees up exactly one day', () => {
    const monSat = parseEnforcementHours('24 hrs, Mon – Sat');
    it('is enforced all Saturday and free all Sunday', () => {
      // Detroit Saturday 2026-08-08 23:00 = Sunday 03:00 UTC.
      expect(isEnforced(monSat, utc('2026-08-09T03:00:00Z'))).toBe(true);
      // Detroit Sunday 2026-08-09 00:30 = 04:30 UTC.
      expect(isEnforced(monSat, utc('2026-08-09T04:30:00Z'))).toBe(false);
      // ...and back on Monday at 00:30 Detroit = 04:30 UTC Monday.
      expect(isEnforced(monSat, utc('2026-08-10T04:30:00Z'))).toBe(true);
    });
  });

  describe('a continuous span is not a daily window', () => {
    const span = parseEnforcementHours('6 am Mon – 1 am Sat');

    it('stays enforced overnight midweek', () => {
      // Wednesday 02:00 Detroit — a DAILY 6am-1am reading would call this
      // free; the published span says it is enforced.
      expect(isEnforced(span, utc('2026-08-05T06:00:00Z'))).toBe(true);
    });

    it('starts on Monday morning, not before', () => {
      expect(isEnforced(span, utc('2026-08-03T09:59:00Z'))).toBe(false); // Mon 05:59
      expect(isEnforced(span, utc('2026-08-03T10:00:00Z'))).toBe(true); // Mon 06:00
    });

    it('ends Saturday at 1am and stays free through the weekend', () => {
      expect(isEnforced(span, utc('2026-08-08T04:59:00Z'))).toBe(true); // Sat 00:59
      expect(isEnforced(span, utc('2026-08-08T05:00:00Z'))).toBe(false); // Sat 01:00
      expect(isEnforced(span, utc('2026-08-09T16:00:00Z'))).toBe(false); // Sun noon
    });
  });

  describe('the safety rule', () => {
    it('assumes ENFORCED when the published string could not be parsed', () => {
      // Wrongly saying "pay here" costs a walk. Wrongly saying "free" costs a
      // ticket. Unknown must never render as free.
      expect(isEnforced(null, utc('2026-08-09T16:00:00Z'))).toBe(true);
      expect(isEnforced(parseEnforcementHours('who knows'), utc('2026-08-09T16:00:00Z'))).toBe(
        true
      );
    });

    it('refuses the compound cell rather than applying half of it', () => {
      const compound =
        'Permit areas 6am – 10 pm, Mon – Sat Visitor area 6am Mon – 10pm Sat, continuously';
      expect(parseEnforcementHours(compound)).toBeNull();
      expect(isEnforced(parseEnforcementHours(compound), utc('2026-08-09T16:00:00Z'))).toBe(true);
    });

    it('refuses a compound cell even when it opens with a parseable window', () => {
      // The real row starts with "Permit areas", so the anchored regexes reject
      // it on shape. This covers the reordered case, where the leading window
      // WOULD match and the trailing second schedule could be silently dropped
      // — applying permit hours to visitor spaces.
      //
      // Three independent things reject this today: the keyword guard, the
      // anchored shape check, and `parseDays` refusing a day group containing
      // digits. That redundancy is deliberate but it does mean removing any one
      // of them alone will not fail this test. Keep all three.
      const reordered = '6am – 10 pm, Mon – Sat Visitor area 6am Mon – 10pm Sat, continuously';
      expect(parseEnforcementHours(reordered)).toBeNull();
      expect(isEnforced(parseEnforcementHours(reordered), utc('2026-08-09T16:00:00Z'))).toBe(true);
    });
  });
});
