/**
 * Destination search.
 *
 * Shared by the map and the list so the two cannot drift into behaving
 * differently. The matching itself lives in the engine and is unit-tested;
 * this file is input handling and presentation only.
 */

import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';

import { searchBuildings, type Building } from '../engine';
import { useTrip } from '../state/trip';
import { MIN_TOUCH_TARGET, radius, space, type } from '../theme';
import { colorsFor } from '../theme/colors';

export function BuildingSearch({
  value,
  onSelect,
  placeholder = 'Where are you going?',
}: {
  value: Building | null;
  onSelect: (building: Building) => void;
  placeholder?: string;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = colorsFor(scheme);
  const { recentDestinations } = useTrip();

  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  const trimmed = query.trim();
  const results = useMemo(() => searchBuildings(query), [query]);

  /**
   * An empty field offers where you have been before rather than nothing.
   *
   * This is the whole reason recents are persisted: a student goes to the same
   * few buildings all term, and the fastest possible path to "parking near
   * Mason" should not require typing "Mason". Suppressed once the field has
   * text, because at that point the user has told us what they want and a
   * history list underneath their query is just noise.
   */
  const showing: 'results' | 'recents' | null = !focused
    ? null
    : trimmed.length > 0
      ? 'results'
      : recentDestinations.length > 0
        ? 'recents'
        : null;

  const choose = (building: Building) => {
    onSelect(building);
    setQuery('');
    setFocused(false);
  };

  return (
    <View style={styles.wrapper}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        onFocus={() => setFocused(true)}
        // Delayed so a tap on a result registers before the list unmounts.
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={value ? value.name : placeholder}
        placeholderTextColor={colors.textMuted}
        style={[
          styles.input,
          type.body,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: focused ? colors.focus : colors.border,
            // A focus ring the keyboard can see. On web the browser default is
            // suppressed by react-native-web's reset, so without this a
            // keyboard user has no idea where they are.
            borderWidth: focused ? 2 : 1,
          },
        ]}
        accessibilityRole="search"
        accessibilityLabel="Search for a building"
        accessibilityHint="Type a building name or nickname, like the dude or ugli"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />

      {showing ? (
        <ScrollView
          style={[
            styles.results,
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {showing === 'recents' ? (
            <>
              <Text style={[type.label, styles.groupLabel, { color: colors.textMuted }]}>
                RECENT
              </Text>
              {recentDestinations.map((building) => (
                <Pressable
                  key={building.id}
                  onPress={() => choose(building)}
                  style={[styles.result, { borderColor: colors.border }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Go to ${building.name}, recently used`}
                >
                  <Text style={[type.bodyStrong, { color: colors.text }]}>{building.name}</Text>
                </Pressable>
              ))}
            </>
          ) : results.length === 0 ? (
            <Text style={[type.body, styles.empty, { color: colors.textMuted }]}>
              No building by that name. Try a nickname — “the dude”, “ugli”, “the big house”.
            </Text>
          ) : (
            results.map((match) => (
              <Pressable
                key={match.building.id}
                onPress={() => choose(match.building)}
                style={[styles.result, { borderColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel={`Go to ${match.building.name}`}
              >
                <Text style={[type.bodyStrong, { color: colors.text }]}>
                  {match.building.name}
                </Text>
                {/* Say why a result is here when it matched a nickname rather
                    than the official name — otherwise "the dude" returning
                    "Duderstadt Center" looks like a bug. */}
                {match.matchedOn !== match.building.name ? (
                  <Text style={[type.caption, { color: colors.textMuted }]}>
                    matched “{match.matchedOn}”
                  </Text>
                ) : null}
              </Pressable>
            ))
          )}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative', zIndex: 10 },
  input: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: space.base,
    borderRadius: radius.md,
  },
  results: {
    position: 'absolute',
    top: MIN_TOUCH_TARGET + space.tight,
    left: 0,
    right: 0,
    maxHeight: 260,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  groupLabel: {
    paddingHorizontal: space.base,
    paddingTop: space.snug,
    paddingBottom: space.tight,
  },
  result: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: space.base,
    paddingVertical: space.snug,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  empty: { padding: space.base },
});
