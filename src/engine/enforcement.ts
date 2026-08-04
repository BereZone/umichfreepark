/**
 * Turning U-M's published enforcement-hours strings into something evaluable.
 *
 * LTP publishes a lot-by-lot table with hours as prose: "6am – 5pm, Mon – Fri".
 * 150 lots produce 17 distinct spellings of four underlying shapes, with an
 * en-dash in most rows and an ASCII hyphen in others, "7 days" and "Sun-Sat"
 * meaning the same thing, and one row that packs two different schedules into
 * a single cell.
 *
 * WHY PARSE AT ALL, RATHER THAN HAND-ENCODE 150 ROWS
 *
 * Because the table is regenerated every August by `npm run data:umich-lots`,
 * and hand-encoded overrides would silently drift from the source the moment a
 * lot's hours change. Parsing keeps one source of truth. The cost is that a
 * string we cannot parse must be loud rather than guessed at — see below.
 *
 * THE SAFETY RULE
 *
 * An unparseable string returns `null`, and `isEnforced` treats `null` as
 * ENFORCED. That is the asymmetric-cost direction: wrongly saying "you must
 * pay here" costs a student nothing but a walk to another lot, while wrongly
 * saying "this is free" costs them a ticket. Never invert this.
 */

import { dayOfWeek, minutesIntoDay } from './calendar';

/** Minutes since local midnight. 6am = 360, 5pm = 1020, end-of-day = 1440. */
export type MinuteOfDay = number;

export const MINUTES_PER_DAY = 1440;

/**
 * A parsed enforcement schedule.
 *
 * `daily` covers the overwhelming majority: the same clock window repeated on
 * each listed day. `continuous` covers the handful of lots published as one
 * unbroken span across days ("6 am Mon – 1 am Sat"), which is NOT the same as
 * a daily 6am–1am window and must not be flattened into one.
 */
export type EnforcementSchedule =
  | { kind: 'daily'; days: number[]; start: MinuteOfDay; end: MinuteOfDay }
  | {
      kind: 'continuous';
      startDay: number;
      start: MinuteOfDay;
      endDay: number;
      end: MinuteOfDay;
    };

const DAY_NAMES: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  tues: 2,
  wed: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  fri: 5,
  sat: 6,
};

/** Normalize the punctuation LTP mixes: en-dash, em-dash, and ASCII hyphen all mean "to". */
function normalize(raw: string): string {
  return raw
    .replace(/[‒–—―]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * "6am", "5pm", "10 pm", "6:30am", "1 am", "12pm" -> minutes since midnight.
 *
 * 12am is midnight (0) and 12pm is noon (720) — the one place where the
 * 12-hour clock is genuinely irregular and an off-by-720 bug hides easily.
 */
export function parseClockTime(text: string): MinuteOfDay | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/.exec(text.trim());
  if (!m) return null;
  const hour12 = Number(m[1]);
  const minutes = m[2] ? Number(m[2]) : 0;
  if (hour12 < 1 || hour12 > 12 || minutes > 59) return null;
  const meridiem = m[3];
  const hour24 = meridiem === 'am' ? hour12 % 12 : (hour12 % 12) + 12;
  return hour24 * 60 + minutes;
}

/** "mon - fri", "7 days", "sun-sat", "mon" -> [1,2,3,4,5] etc. */
function parseDays(text: string): number[] | null {
  const t = text.trim().replace(/\.$/, '');
  if (/^7\s*days$/.test(t) || /^daily$/.test(t)) return [0, 1, 2, 3, 4, 5, 6];

  const range = /^([a-z]+)\s*-\s*([a-z]+)$/.exec(t);
  if (range) {
    const from = DAY_NAMES[range[1]];
    const to = DAY_NAMES[range[2]];
    if (from === undefined || to === undefined) return null;
    // Ranges wrap: "sat - sun" is a two-day weekend, not five days backwards.
    const days: number[] = [];
    for (let d = from; ; d = (d + 1) % 7) {
      days.push(d);
      if (d === to) break;
      if (days.length > 7) return null;
    }
    return days;
  }

  const single = DAY_NAMES[t];
  return single === undefined ? null : [single];
}

/**
 * Parse one published enforcement-hours string.
 *
 * Returns `null` for anything not confidently understood — including the one
 * real compound row ("Permit areas … Visitor area …"), which describes two
 * different schedules for two parts of the same lot and cannot be reduced to
 * one without choosing which users to be wrong about.
 */
export function parseEnforcementHours(raw: string): EnforcementSchedule | null {
  const text = normalize(raw);
  if (!text) return null;

  // A compound cell describing more than one area's schedule. Refuse it rather
  // than silently applying one half to the whole lot.
  if (/permit area|visitor area|continuously/.test(text)) return null;

  // "24 hrs, 7 days" / "24 hrs, mon - sat" -> full-day window on those days.
  const allDay = /^24\s*hrs?,?\s*(.+)$/.exec(text);
  if (allDay) {
    const days = parseDays(allDay[1]);
    return days ? { kind: 'daily', days, start: 0, end: MINUTES_PER_DAY } : null;
  }

  // "6 am mon - 1 am sat" -> one unbroken span from Monday 6am to Saturday 1am.
  const continuous = /^(\d{1,2}(?::\d{2})?\s*[ap]m)\s*([a-z]+)\s*-\s*(\d{1,2}(?::\d{2})?\s*[ap]m)\s*([a-z]+)$/.exec(
    text
  );
  if (continuous) {
    const start = parseClockTime(continuous[1]);
    const end = parseClockTime(continuous[3]);
    const startDay = DAY_NAMES[continuous[2]];
    const endDay = DAY_NAMES[continuous[4]];
    if (start === null || end === null || startDay === undefined || endDay === undefined) {
      return null;
    }
    return { kind: 'continuous', startDay, start, endDay, end };
  }

  // "6am - 5pm, mon - fri" / "6am - 5pm sun-sat" — the comma is optional.
  const daily = /^(\d{1,2}(?::\d{2})?\s*[ap]m)\s*-\s*(\d{1,2}(?::\d{2})?\s*[ap]m),?\s+(.+)$/.exec(
    text
  );
  if (daily) {
    const start = parseClockTime(daily[1]);
    const end = parseClockTime(daily[2]);
    const days = parseDays(daily[3]);
    if (start === null || end === null || days === null) return null;
    return { kind: 'daily', days, start, end };
  }

  return null;
}

/**
 * Is this lot being enforced at `at`?
 *
 * `schedule === null` means the published string could not be parsed, and the
 * answer is TRUE — assume enforced. See the safety rule at the top of this file.
 */
export function isEnforced(schedule: EnforcementSchedule | null, at: Date): boolean {
  if (schedule === null) return true;

  const day = dayOfWeek(at);
  const minute = minutesIntoDay(at);

  if (schedule.kind === 'daily') {
    if (!schedule.days.includes(day)) return false;
    // A window whose end is at or before its start crosses midnight
    // ("6pm - 2am"): enforced from start to end-of-day, then again from
    // midnight to end. LTP does not currently publish one, but the shape is
    // cheap to support and expensive to get wrong later.
    if (schedule.end <= schedule.start) {
      return minute >= schedule.start || minute < schedule.end;
    }
    return minute >= schedule.start && minute < schedule.end;
  }

  // Continuous span. Walk the week from the start day forward so that a span
  // wrapping past Sunday is handled by the same comparison as one that doesn't.
  const spanDays = (schedule.endDay - schedule.startDay + 7) % 7;
  const offset = (day - schedule.startDay + 7) % 7;
  if (offset > spanDays) return false;
  if (offset === 0 && spanDays === 0) {
    return minute >= schedule.start && minute < schedule.end;
  }
  if (offset === 0) return minute >= schedule.start;
  if (offset === spanDays) return minute < schedule.end;
  return true;
}

/** Every distinct published string in the dataset, with whether we understand it. */
export interface ParseReport {
  raw: string;
  schedule: EnforcementSchedule | null;
}

export function parseAll(rawStrings: readonly string[]): ParseReport[] {
  return rawStrings.map((raw) => ({ raw, schedule: parseEnforcementHours(raw) }));
}
