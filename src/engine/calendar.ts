/**
 * Calendar rules: what day is it in Ann Arbor, and is today a holiday for a
 * given authority.
 *
 * Two rules govern this file.
 *
 * 1. NO FUNCTION HERE CALLS `new Date()`. Every entry point takes an explicit
 *    `at: Date`. That is what makes these tests deterministic and what gives
 *    the time-scrubber feature for free — scrubbing is just passing a
 *    different instant.
 *
 * 2. ALL DATE MATH IS IN `America/Detroit`, never the device time zone. A
 *    student home in California over break must still get Ann Arbor's answer,
 *    and a device with a wrong clock zone must not silently produce a wrong
 *    "FREE".
 */

import { TZDate } from '@date-fns/tz';

import type { Authority } from './types';

/** The only time zone this app reasons in. */
export const ZONE = 'America/Detroit';

/** Sunday = 0, matching `Date.prototype.getDay`. */
export const SUNDAY = 0;
export const MONDAY = 1;
export const THURSDAY = 4;

/** A calendar date in Ann Arbor, as `YYYY-MM-DD`. */
export type CalendarDate = string;

export interface Holiday {
  /** Human-readable, and user-facing — this string is shown in the app. */
  name: string;
  date: CalendarDate;
}

/**
 * View an instant in Ann Arbor's wall-clock time.
 *
 * Every read of a "what hour is it" or "what day is it" question must go
 * through this. `at.getHours()` on a raw Date answers for the device, which is
 * the wrong question.
 */
export function inZone(at: Date): TZDate {
  return new TZDate(at.getTime(), ZONE);
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The Ann Arbor calendar date of an instant.
 *
 * Holidays are compared as calendar dates rather than as instants on purpose.
 * A holiday is a property of a date on a wall calendar, not of a moment in
 * time, so matching on `YYYY-MM-DD` sidesteps DST and midnight-boundary
 * questions entirely instead of trying to be clever about them.
 */
export function calendarDate(at: Date): CalendarDate {
  const d = inZone(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Day of week in Ann Arbor. Sunday = 0. */
export function dayOfWeek(at: Date): number {
  return inZone(at).getDay();
}

/**
 * Minutes since local midnight in Ann Arbor.
 *
 * Used for enforcement-window comparisons. Note this is deliberately
 * wall-clock: an enforcement window that says "6am–5pm" means 6am by the sign
 * on the street, on both sides of a DST change, even though one of those days
 * is 23 hours long.
 */
export function minutesIntoDay(at: Date): number {
  const d = inZone(at);
  return d.getHours() * 60 + d.getMinutes();
}

// ---------------------------------------------------------------------------
// Floating holidays, computed rather than listed
// ---------------------------------------------------------------------------

/**
 * These are computed, never hardcoded as a list of dates.
 *
 * A hardcoded table expires silently: it keeps returning answers after it runs
 * out of years, and the answers are wrong in the direction that tells a student
 * parking is free when it is not. Computing them means the app is still correct
 * in 2041.
 */
const ymd = (y: number, m: number, d: number): CalendarDate => `${y}-${pad(m)}-${pad(d)}`;

/** `n`th `weekday` of a month, 1-indexed. `nthWeekday(2026, 1, MONDAY, 3)` = 3rd Monday of January. */
function nthWeekday(year: number, month: number, weekday: number, n: number): CalendarDate {
  const first = new TZDate(year, month - 1, 1, 12, 0, 0, ZONE);
  // Days to advance from the 1st to reach the first occurrence of `weekday`.
  const offset = (weekday - first.getDay() + 7) % 7;
  return ymd(year, month, 1 + offset + (n - 1) * 7);
}

/** Last `weekday` of a month — how Memorial Day is defined. */
function lastWeekday(year: number, month: number, weekday: number): CalendarDate {
  // Day 0 of the next month is the last day of this one.
  const last = new TZDate(year, month, 0, 12, 0, 0, ZONE);
  const back = (last.getDay() - weekday + 7) % 7;
  return ymd(year, month, last.getDate() - back);
}

/** The day after a given `YYYY-MM-DD`, correct across month and year ends. */
function dayAfter(date: CalendarDate): CalendarDate {
  const [y, m, d] = date.split('-').map(Number);
  const next = new TZDate(y, m - 1, d + 1, 12, 0, 0, ZONE);
  return ymd(next.getFullYear(), next.getMonth() + 1, next.getDate());
}

const thanksgiving = (year: number) => nthWeekday(year, 11, THURSDAY, 4);

// ---------------------------------------------------------------------------
// The three holiday lists
// ---------------------------------------------------------------------------

/**
 * City of Ann Arbor employee holidays, on which on-street meters are free.
 *
 * Verified verbatim 2026-08-03 from https://www.a2gov.org/services/parking/ :
 * "free on evenings, Sundays and all holidays observed by City of Ann Arbor
 * employees. City holidays are: New Year's Eve Day, New Year's Day, Martin
 * Luther King Jr. Day, Presidents Day, Memorial Day, Juneteenth, Independence
 * Day, Labor Day, Indigenous People's Day, Veterans Day, Thanksgiving Day and
 * the following Friday, Christmas Eve Day, and Christmas Day."
 *
 * Thirteen listed entries, fourteen dates — Thanksgiving and the Friday after
 * are a single entry.
 */
function cityMeterHolidays(year: number): Holiday[] {
  const turkey = thanksgiving(year);
  return [
    { name: "New Year's Eve Day", date: ymd(year, 12, 31) },
    { name: "New Year's Day", date: ymd(year, 1, 1) },
    { name: 'Martin Luther King Jr. Day', date: nthWeekday(year, 1, MONDAY, 3) },
    { name: 'Presidents Day', date: nthWeekday(year, 2, MONDAY, 3) },
    { name: 'Memorial Day', date: lastWeekday(year, 5, MONDAY) },
    { name: 'Juneteenth', date: ymd(year, 6, 19) },
    { name: 'Independence Day', date: ymd(year, 7, 4) },
    { name: 'Labor Day', date: nthWeekday(year, 9, MONDAY, 1) },
    { name: "Indigenous People's Day", date: nthWeekday(year, 10, MONDAY, 2) },
    { name: 'Veterans Day', date: ymd(year, 11, 11) },
    { name: 'Thanksgiving Day', date: turkey },
    { name: 'the day after Thanksgiving', date: dayAfter(turkey) },
    { name: 'Christmas Eve Day', date: ymd(year, 12, 24) },
    { name: 'Christmas Day', date: ymd(year, 12, 25) },
  ];
}

/**
 * Days U-M suspends parking enforcement entirely.
 *
 * Verified verbatim 2026-08-03 from the LTP Locations and Enforcement page:
 * "The regulations are in force throughout the calendar year except for:
 * Memorial Day, Independence Day, Labor Day, Thanksgiving Day and the following
 * day, Christmas through New Year's Day."
 *
 * This is NOT the city list. It omits MLK Day, Presidents Day, Juneteenth,
 * Veterans Day and Indigenous People's Day — so a student off class for MLK Day
 * still pays at U-M while city meters are free. Conflating the two lists would
 * produce a wrong "FREE" on five days a year.
 *
 * "Christmas through New Year's Day" is a multi-day RANGE, the only one in this
 * app. It spans a year boundary, so December 26 of `year` and January 1 of
 * `year` are both covered — by the range that opened the previous December.
 */
function umichHolidays(year: number): Holiday[] {
  const turkey = thanksgiving(year);
  const holidays: Holiday[] = [
    { name: 'Memorial Day', date: lastWeekday(year, 5, MONDAY) },
    { name: 'Independence Day', date: ymd(year, 7, 4) },
    { name: 'Labor Day', date: nthWeekday(year, 9, MONDAY, 1) },
    { name: 'Thanksgiving Day', date: turkey },
    { name: 'the day after Thanksgiving', date: dayAfter(turkey) },
  ];

  // The winter closure, expanded to explicit dates. Dec 25 -> Dec 31 of this
  // year, and Jan 1 of this year (the tail of last year's closure).
  holidays.push({ name: "the winter closure (Christmas through New Year's Day)", date: ymd(year, 1, 1) });
  for (let d = 25; d <= 31; d++) {
    holidays.push({
      name: "the winter closure (Christmas through New Year's Day)",
      date: ymd(year, 12, d),
    });
  }
  return holidays;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * A holiday answer that can say "I don't know" as a first-class result.
 *
 * `city-structure` needs this. The DDA says structures are free on "holidays
 * observed by PCI Municipal Services", and PCI does not publish that list
 * anywhere. Returning an empty array there would be a lie shaped like data —
 * it reads as "no holidays" and would render as paid on days that may be free,
 * or worse, invite someone to fill it in with the wrong list. (PCI publishes a
 * different holiday list governing permit-holder access hours; borrowing it
 * would produce exactly the wrong "FREE" this app exists to prevent.)
 */
export type HolidayLookup =
  | { known: true; holiday: Holiday | null }
  | { known: false; reason: string };

const UNKNOWN_STRUCTURE_HOLIDAYS =
  'The DDA states structures are free on holidays observed by PCI Municipal Services, ' +
  'but PCI does not publish that list. Unresolved — see docs/data-sources.md.';

/**
 * Every holiday an authority observes in a given calendar year.
 *
 * Returns `null` when the authority's list is not published, which is different
 * from an empty list and must be handled as such.
 */
export function holidaysFor(authority: Authority, year: number): Holiday[] | null {
  switch (authority) {
    case 'city-meter':
      return cityMeterHolidays(year);
    case 'umich':
      return umichHolidays(year);
    case 'city-structure':
      return null;
  }
}

/**
 * Is `at` a holiday for `authority`, in Ann Arbor's calendar?
 *
 * Note what this deliberately does NOT do: it does not shift a holiday that
 * falls on a weekend to an adjacent weekday. Neither authority publishes an
 * observed-shift rule, and inventing one is asymmetric in the dangerous
 * direction — guessing that a Saturday Independence Day is "observed" on Friday
 * July 3 would tell a student Friday is free when meters are being enforced.
 * If a shift rule turns out to exist, it needs a source before it ships.
 */
export function holidayAt(authority: Authority, at: Date): HolidayLookup {
  if (authority === 'city-structure') {
    return { known: false, reason: UNKNOWN_STRUCTURE_HOLIDAYS };
  }

  const today = calendarDate(at);
  const year = Number(today.slice(0, 4));
  const holidays = holidaysFor(authority, year) ?? [];
  return { known: true, holiday: holidays.find((h) => h.date === today) ?? null };
}

/** Convenience for the common "is it a holiday, and do we know" question. */
export function isHoliday(authority: Authority, at: Date): boolean {
  const result = holidayAt(authority, at);
  return result.known && result.holiday !== null;
}
