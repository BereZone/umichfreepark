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
 * day row runs a week ahead.
 *
 * Hours are whole hours because every published rule in this app changes on one:
 * 6pm, 8am, 4am. Offering minutes would imply a precision the sources do not
 * have.
 */

import { ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { atLocalTime, dayOfWeek, inZone } from '../engine';
import { useTrip } from '../state/trip';
import { space, type } from '../theme';
import { colorsFor } from '../theme/colors';
import { Chip } from './Chip';

/** How far ahead you can look. A week reaches next Sunday from any day. */
const DAYS_AHEAD = 7;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "12a", "6a", "12p", "6p" — short enough for a chip, unambiguous at a glance. */
export function hourLabel(hour: number): string {
  const suffix = hour < 12 ? 'a' : 'p';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${suffix}`;
}

/** How the app names the previewed moment in prose. "Sunday 6pm", "today 9pm". */
export function describeInstant(at: Date, reference: Date): string {
  const hour = inZone(at).getHours();
  const dayName = WEEKDAYS[dayOfWeek(at)];
  const time = hourLabel(hour).replace('a', 'am').replace('p', 'pm');

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
         * Returning to live is a chip in the same row as the days, so it reads
         * as the same kind of choice rather than as a cancel button. It is
         * selected whenever nothing is being previewed, which is what makes
         * "Now" the visible resting state of this control.
         */}
        <Chip
          label="Now"
          selected={previewAt === null}
          onPress={() => setPreviewAt(null)}
          colors={colors}
          accessibilityLabel="Show parking as it is right now"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        accessibilityRole="radiogroup"
        accessibilityLabel="Which day"
      >
        {days.map((day) => (
          <Chip
            key={day.offset}
            label={day.label}
            selected={previewAt !== null && selectedOffset === day.offset}
            onPress={() => choose(day.offset, selectedHour)}
            colors={colors}
          />
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        accessibilityRole="radiogroup"
        accessibilityLabel="What time"
      >
        {Array.from({ length: 24 }, (_, hour) => (
          <Chip
            key={hour}
            label={hourLabel(hour)}
            numeric
            selected={previewAt !== null && selectedHour === hour}
            onPress={() => choose(selectedOffset, hour)}
            colors={colors}
            accessibilityLabel={`${hourLabel(hour).replace('a', ' am').replace('p', ' pm')}`}
          />
        ))}
      </ScrollView>

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
 * by 86,400,000 calls that zero days, which would light up the wrong chip.
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
  // Horizontal scrollers need their padding on the content, not the container,
  // or the last chip sits flush against the screen edge.
  row: { flexDirection: 'row', gap: space.snug, paddingRight: space.comfortable },
});
