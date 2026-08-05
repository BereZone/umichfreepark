/**
 * "What can I park in at 6pm on Sunday?"
 *
 * The whole feature is a consequence of one architectural rule: no engine
 * function calls `new Date()`, so every status, price, countdown, holiday and
 * game-day warning already takes an explicit instant. Scrubbing is passing a
 * different one. Nothing in `src/engine/` changed to support this.
 *
 * WHY DAY AND HOUR, AND NOT A DATE PICKER
 *
 * Ann Arbor parking rules are weekly, not calendrical. Meters are free after
 * 6pm and all Sunday; structures are free Sunday 4am to Monday 4am; U-M lots
 * are enforced on posted weekday hours. Every question worth asking is "which
 * day, roughly what time" — so a platform date-and-time modal would be more
 * taps and more precision than the data supports. The exceptions are holidays
 * and home games, which are specific dates, and those are reachable because the
 * day menu runs a week ahead.
 *
 * Hours are whole hours because every published rule in this app changes on one:
 * 6pm, 8am, 4am. Offering minutes would imply a precision the sources do not
 * have.
 */

import { StyleSheet, Text, View, useColorScheme } from 'react-native';

import { atLocalTime, dayOfWeek, inZone } from '../engine';
import { useTrip } from '../state/trip';
import { space, type } from '../theme';
import { colorsFor } from '../theme/colors';
import { Chip } from './Chip';
import { Select } from './Select';

/** How far ahead you can look. A week reaches next Sunday from any day. */
const DAYS_AHEAD = 7;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "12am", "6am", "noon", "6pm" — a menu row has space for the readable form. */
export function spokenHour(hour: number): string {
  if (hour === 0) return 'Midnight';
  if (hour === 12) return 'Noon';
  const suffix = hour < 12 ? 'am' : 'pm';
  return `${hour % 12}${suffix}`;
}

/** How the app names the previewed moment in prose. "Sunday 6pm", "today 9pm". */
export function describeInstant(at: Date, reference: Date): string {
  const hour = inZone(at).getHours();
  const dayName = WEEKDAYS[dayOfWeek(at)];
  const time = spokenHour(hour).toLowerCase();

  // Same calendar day in Ann Arbor reads as "today" rather than by weekday,
  // because "Wednesday 9pm" on a Wednesday afternoon is needlessly indirect.
  const sameDay = dayOfWeek(at) === dayOfWeek(reference) && Math.abs(at.getTime() - reference.getTime()) < 86_400_000;
  return sameDay ? `today ${time}` : `${dayName} ${time}`;
}

export function TimePicker() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = colorsFor(scheme);
  const { previewAt, setPreviewAt } = useTrip();

  /*
   * "Now" is the reference for every offset, and it is read once per render
   * rather than held in state.
   *
   * Holding it would freeze the meaning of "Today" at mount, so a picker left
   * open across midnight would build tomorrow's instants under today's label.
   */
  const now = new Date();
  const selectedHour = previewAt ? inZone(previewAt).getHours() : inZone(now).getHours();
  const selectedOffset = previewAt ? dayOffsetOf(previewAt, now) : 0;

  const days = Array.from({ length: DAYS_AHEAD }, (_, offset) => ({
    offset,
    label: offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : WEEKDAYS[dayOfWeek(atLocalTime(now, offset, 12))],
  }));

  const choose = (offset: number, hour: number) => setPreviewAt(atLocalTime(now, offset, hour));

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={[type.label, { color: colors.textMuted }]}>CHECK ANOTHER TIME</Text>
        {/*
         * "Now" stays a chip rather than becoming a third menu row: it is not a
         * value among values, it is the way back to live. Selected whenever
         * nothing is being previewed, which makes live the visible resting
         * state of this control rather than something you have to restore.
         */}
        <Chip
          label="Now"
          selected={previewAt === null}
          onPress={() => setPreviewAt(null)}
          colors={colors}
          accessibilityLabel="Show parking as it is right now"
        />
      </View>

      <Select
        label="DAY"
        value={String(selectedOffset)}
        colors={colors}
        options={days.map((day) => ({ value: String(day.offset), label: day.label }))}
        onChange={(offset) => choose(Number(offset), selectedHour)}
      />

      <Select
        label="TIME"
        value={String(selectedHour)}
        colors={colors}
        options={Array.from({ length: 24 }, (_, hour) => ({
          value: String(hour),
          label: spokenHour(hour),
        }))}
        onChange={(hour) => choose(selectedOffset, Number(hour))}
      />

      {previewAt ? (
        <Text style={[type.caption, { color: colors.textMuted }]}>
          Showing {describeInstant(previewAt, now)}. Rates and enforcement are the published rules
          for that time, not a forecast of how full the lot will be.
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Whole days between two instants by Ann Arbor calendar day, not by elapsed
 * milliseconds.
 *
 * 6pm today to 1am tomorrow is seven hours and one day. Dividing the difference
 * by 86,400,000 calls that zero days, which would select the wrong menu row.
 */
function dayOffsetOf(at: Date, reference: Date): number {
  const a = inZone(at);
  const b = inZone(reference);
  const day = (d: typeof a) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((day(a) - day(b)) / 86_400_000);
}

const styles = StyleSheet.create({
  root: { gap: space.tight },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.snug,
  },
});
