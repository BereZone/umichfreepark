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

  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  const results = useMemo(() => searchBuildings(query), [query]);
  // Results only while typing. Showing them under a chosen destination would
  // cover the map for no reason.
  const showResults = focused && query.trim().length > 0;

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
          },
        ]}
        accessibilityRole="search"
        accessibilityLabel="Search for a building"
        accessibilityHint="Type a building name or nickname, like the dude or ugli"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />

      {showResults ? (
        <ScrollView
          style={[
            styles.results,
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {results.length === 0 ? (
            <Text style={[type.body, styles.empty, { color: colors.textMuted }]}>
              No building by that name. Try a nickname — “the dude”, “ugli”, “the big house”.
            </Text>
          ) : (
            results.map((match) => (
              <Pressable
                key={match.building.id}
                onPress={() => {
                  onSelect(match.building);
                  setQuery('');
                  setFocused(false);
                }}
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
    borderWidth: 1,
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
  result: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: space.base,
    paddingVertical: space.snug,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  empty: { padding: space.base },
});
