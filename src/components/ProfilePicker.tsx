/**
 * Who the app should assume you are: your year, and the permit you hold.
 *
 * This silently rewrites every other screen. The default is a first-year with
 * no permit — the most restrictive case, so an unconfigured app never tells
 * someone they can park where they cannot — which means a senior with a Blue
 * permit who never finds this control sees half of campus greyed out for no
 * reason they can see.
 *
 * WHY IT LIVES IN A SHARED COMPONENT AND APPEARS TWICE
 *
 * It started life on the Learn screen only, and was asked for twice as a
 * missing feature. The problem was never that it did not exist — it was the
 * placement. "Learn" reads as documentation, and nobody hunts for a setting
 * under a tab that sounds like a help page. So it also sits in the trip
 * controls now, beside the destination and duration, because functionally it is
 * the same kind of thing: an input that changes which results you get.
 *
 * One component in two places rather than two implementations, for the same
 * reason `TripControls` is shared — the alternative is two pickers writing one
 * piece of state and disagreeing about what it means.
 *
 * Both are menus rather than rows of buttons. Ten chips for two settings you
 * change once a year crowded out the destination field that people actually
 * open this for; see Select.tsx.
 *
 * The permit list always includes the options first-years and sophomores cannot
 * buy, shown disabled. Hiding them was the first attempt and it was worse: the
 * app ships defaulted to a first-year, so the setting was simply absent, with
 * nothing to suggest that choosing a later year would reveal it.
 */

import { StyleSheet, Text, View, useColorScheme } from 'react-native';

import { permitIsPlausible, type ClassYear, type HeldPermit } from '../engine';
import { useTrip } from '../state/trip';
import { space, type } from '../theme';
import { colorsFor } from '../theme/colors';
import { Callout, CalloutText } from './Callout';
import { Select, type SelectOption } from './Select';

const CLASS_YEARS: SelectOption<ClassYear>[] = [
  { value: 'first-year', label: 'First-year' },
  { value: 'sophomore', label: 'Sophomore' },
  { value: 'junior', label: 'Junior' },
  { value: 'senior', label: 'Senior' },
  { value: 'graduate', label: 'Graduate' },
];

const PERMITS: SelectOption<HeldPermit>[] = [
  { value: 'none', label: 'No permit' },
  { value: 'orange', label: 'Orange' },
  { value: 'yellow-after-hours', label: 'Yellow' },
  { value: 'after-hours', label: 'After Hours' },
  { value: 'blue', label: 'Blue' },
];

export function ProfilePicker({
  /** Omit the explanatory prose, for the trip controls where space is tight. */
  compact = false,
}: {
  compact?: boolean;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = colorsFor(scheme);
  const { profile, setProfile } = useTrip();
  const canHoldPermit = permitIsPlausible({ ...profile, permit: 'blue' });

  return (
    <View style={styles.root}>
      {!compact ? (
        <Text style={[type.body, { color: colors.textMuted }]}>
          Everything else is answered for this. Change it and the map and the list change with it.
        </Text>
      ) : null}

      <Select
        label="YOUR YEAR"
        value={profile.classYear}
        options={CLASS_YEARS}
        colors={colors}
        onChange={(classYear) =>
          setProfile({
            classYear,
            // Moving back to a year that cannot hold a permit drops the one you
            // had, rather than leaving state the engine would reject on every
            // call.
            permit: permitIsPlausible({ classYear, permit: profile.permit })
              ? profile.permit
              : 'none',
          })
        }
      />

      <Select
        label="YOUR PERMIT"
        value={profile.permit}
        colors={colors}
        options={PERMITS.map((permit) => {
          // Whether this profile could legally hold it. The engine owns the
          // rule; this only reflects it.
          const holdable =
            permit.value === 'none' ||
            permitIsPlausible({ classYear: profile.classYear, permit: permit.value });
          return {
            ...permit,
            disabled: !holdable,
            accessibilityLabel: holdable
              ? permit.label
              : `${permit.label} — U-M does not sell this to first-years or sophomores`,
          };
        })}
        onChange={(permit) => setProfile({ ...profile, permit })}
      />

      {!canHoldPermit ? (
        <Callout tone="caution" colors={colors}>
          <CalloutText colors={colors}>
            U-M does not sell commuter permits to first-years or sophomores, so those options are
            greyed out. City parking and U-M lots outside their enforcement hours are still open to
            you.
          </CalloutText>
        </Callout>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.snug },
});
