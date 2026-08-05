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
 * The permit row is always visible, including for the first-years and
 * sophomores who cannot buy one. Hiding it was the first attempt and it was
 * worse: the app ships defaulted to a first-year, so the setting was simply
 * absent, with nothing to suggest that choosing a later year would reveal it.
 * The options are shown and disabled instead, which makes the setting findable
 * and states the rule where someone is looking for it.
 */

import { StyleSheet, Text, View, useColorScheme } from 'react-native';

import { permitIsPlausible, type ClassYear, type HeldPermit } from '../engine';
import { useTrip } from '../state/trip';
import { space, type } from '../theme';
import { colorsFor } from '../theme/colors';
import { Callout, CalloutText } from './Callout';
import { Chip } from './Chip';

const CLASS_YEARS: { key: ClassYear; label: string }[] = [
  { key: 'first-year', label: 'First-year' },
  { key: 'sophomore', label: 'Sophomore' },
  { key: 'junior', label: 'Junior' },
  { key: 'senior', label: 'Senior' },
  { key: 'graduate', label: 'Grad' },
];

const PERMITS: { key: HeldPermit; label: string }[] = [
  { key: 'none', label: 'No permit' },
  { key: 'orange', label: 'Orange' },
  { key: 'yellow-after-hours', label: 'Yellow' },
  { key: 'after-hours', label: 'After Hours' },
  { key: 'blue', label: 'Blue' },
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

      <View style={styles.group}>
        <Text style={[type.label, { color: colors.textMuted }]}>YOUR YEAR</Text>
        <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Your year">
          {CLASS_YEARS.map((year) => (
            <Chip
              key={year.key}
              label={year.label}
              selected={profile.classYear === year.key}
              colors={colors}
              onPress={() =>
                setProfile({
                  classYear: year.key,
                  // Moving back to a year that cannot hold a permit drops the
                  // one you had, rather than leaving state the engine would
                  // reject on every call.
                  permit: permitIsPlausible({ classYear: year.key, permit: profile.permit })
                    ? profile.permit
                    : 'none',
                })
              }
            />
          ))}
        </View>
      </View>

      <View style={styles.group}>
        <Text style={[type.label, { color: colors.textMuted }]}>YOUR PERMIT</Text>
        <View
          style={styles.row}
          accessibilityRole="radiogroup"
          accessibilityLabel="Permit you hold"
        >
          {PERMITS.map((permit) => {
            // Whether this profile could legally hold it. The engine owns the
            // rule; this only reflects it.
            const holdable =
              permit.key === 'none' ||
              permitIsPlausible({ classYear: profile.classYear, permit: permit.key });
            return (
              <Chip
                key={permit.key}
                label={permit.label}
                selected={profile.permit === permit.key}
                disabled={!holdable}
                colors={colors}
                accessibilityLabel={
                  holdable
                    ? permit.label
                    : `${permit.label} — U-M does not sell this to first-years or sophomores`
                }
                onPress={() => setProfile({ ...profile, permit: permit.key })}
              />
            );
          })}
        </View>
      </View>

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
  group: { gap: space.tight },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.snug },
});
