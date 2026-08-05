/**
 * The trip: where, how long, and what "best" means.
 *
 * One component for both screens. The map and the list rank the same areas with
 * the same three inputs, and a duration selector that offered 1/2/4 hours on
 * one screen and 1/2/3 on the other would produce two different prices for the
 * same lot — the sort of divergence that is invisible until a user notices it
 * and stops trusting the number.
 *
 * It reads `useTrip` itself rather than taking eight props. The state is
 * already global because the two screens must agree; threading it back through
 * props would only create a second place for them to disagree.
 */

import { StyleSheet, Text, View, useColorScheme } from 'react-native';

import type { RankingMode } from '../engine';
import { DURATION_OPTIONS, useTrip } from '../state/trip';
import { space, type } from '../theme';
import { colorsFor } from '../theme/colors';
import { BuildingSearch } from './BuildingSearch';
import { Chip } from './Chip';

const MODES: { key: RankingMode; label: string }[] = [
  { key: 'cheapest', label: 'Cheapest' },
  { key: 'closest', label: 'Closest' },
  { key: 'balanced', label: 'Best balance' },
];

export function TripControls({
  /** Hide the search field where the destination is already shown above it. */
  showSearch = true,
}: {
  showSearch?: boolean;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = colorsFor(scheme);
  const { destination, setDestination, durationHours, setDurationHours, mode, setMode } = useTrip();

  return (
    <View style={styles.root}>
      {showSearch ? (
        <View style={[styles.group, styles.searchGroup]}>
          {/*
           * Labelled, because the field shows the current destination as its
           * placeholder. Without a label "Mason Hall" in grey reads as a
           * suggestion of what you could type rather than as the answer every
           * price and walk time on screen is already computed against.
           */}
          <Text style={[type.label, { color: colors.textMuted }]}>
            {destination ? 'GOING TO' : 'GOING WHERE?'}
          </Text>
          <BuildingSearch value={destination} onSelect={setDestination} />
        </View>
      ) : null}

      <View style={styles.group}>
        <Text style={[type.label, { color: colors.textMuted }]}>STAYING FOR</Text>
        <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="How long">
          {DURATION_OPTIONS.map((hours) => (
            <Chip
              key={hours}
              label={`${hours}h`}
              numeric
              selected={hours === durationHours}
              onPress={() => setDurationHours(hours)}
              colors={colors}
              accessibilityLabel={`Park for ${hours} hour${hours === 1 ? '' : 's'}`}
            />
          ))}
        </View>
      </View>

      <View style={styles.group}>
        <Text style={[type.label, { color: colors.textMuted }]}>SORT BY</Text>
        <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Sort by">
          {MODES.map((option) => (
            <Chip
              key={option.key}
              label={option.label}
              selected={option.key === mode}
              onPress={() => setMode(option.key)}
              colors={colors}
              accessibilityLabel={`Sort by ${option.label}`}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Tight. This sheet shares a phone screen with the map it controls, and every
  // point it takes is a point of Ann Arbor the user cannot see.
  root: { gap: space.snug },
  // More space above a label than below it, so each label reads as belonging to
  // the row under it rather than floating between two.
  group: { gap: space.tight },
  /*
   * The search field's group has to out-stack its siblings.
   *
   * BuildingSearch drops its results in an absolutely positioned panel, and
   * that panel already carries a zIndex — but only within its own parent. Once
   * the field was wrapped in a group alongside two later sibling groups, the
   * duration and sort chips painted straight through the results, so picking a
   * building meant reading "Duderstadt Center" with "1h 2h 3h 4h 8h" written
   * across it. Raising the group, not the panel, is the fix: the panel's
   * ordering is correct, its container's was not.
   */
  searchGroup: { zIndex: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.snug },
});
