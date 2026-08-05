/**
 * Pick one from a list, as a menu rather than as a row of buttons.
 *
 * WHY NOT CHIPS
 *
 * Chips are right for a short set you change often and want to compare at a
 * glance — five stay lengths, three sort orders. They are wrong for a set you
 * set once and rarely revisit, and they scale badly: year, permit, day and hour
 * together came to forty-one buttons, which turned the trip controls into a wall
 * and buried the destination field that most people actually came for. A menu
 * costs one line per setting whatever the option count.
 *
 * WHY IT EXPANDS IN PLACE RATHER THAN OPENING A MODAL
 *
 * Choosing a permit needs neither interruption nor protected focus, so a modal
 * would be ceremony. Expanding inline also sidesteps a stacking bug this app has
 * already had once: an absolutely positioned panel inside a sheet painted
 * *underneath* the controls below it. Pushing content down is predictable and
 * has no z-index to get wrong.
 *
 * WHY NOT THE PLATFORM PICKER
 *
 * `@react-native-picker/picker` is a native module, so it would mean a rebuild
 * and a second look-and-feel that no theme token reaches. This is a Pressable
 * and a list, so it inherits the app's colors, spacing and Dynamic Type on both
 * platforms.
 */

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MIN_TOUCH_TARGET, radius, space, type } from '../theme';
import type { ColorScheme } from '../theme/colors';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** Shown but not choosable — see Chip's `disabled` for the reasoning. */
  disabled?: boolean;
  /** Said instead of `label` by a screen reader, e.g. to explain a disabled one. */
  accessibilityLabel?: string;
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  colors,
}: {
  /** The small caps heading above the field. */
  label: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  colors: ColorScheme;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <View style={styles.root}>
      <Text style={[type.label, { color: colors.textMuted }]}>{label}</Text>

      <Pressable
        onPress={() => setOpen((wasOpen) => !wasOpen)}
        style={({ pressed }) => [
          styles.field,
          {
            backgroundColor: colors.surface,
            borderColor: open ? colors.borderStrong : colors.border,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        // The heading is a separate Text and screen readers do not associate the
        // two, so the field says both: what it sets and what it is set to.
        accessibilityLabel={`${label}: ${selected?.label ?? 'not set'}`}
        accessibilityHint="Opens the list of choices"
      >
        <Text style={[type.bodyStrong, styles.value, { color: colors.text }]} numberOfLines={1}>
          {selected?.label ?? '—'}
        </Text>
        <Text
          style={[type.title, { color: colors.text }]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {open ? '▴' : '▾'}
        </Text>
      </Pressable>

      {open ? (
        <ScrollView
          // Long lists — twenty-four hours — scroll rather than running off the
          // sheet. Short ones size to their content and never scroll.
          style={[styles.menu, { backgroundColor: colors.surface, borderColor: colors.border }]}
          contentContainerStyle={styles.menuContent}
          nestedScrollEnabled
          accessibilityRole="radiogroup"
          accessibilityLabel={label}
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <Pressable
                key={option.value}
                disabled={option.disabled}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                style={({ pressed }) => [
                  styles.option,
                  {
                    borderColor: colors.border,
                    backgroundColor: isSelected ? colors.surfaceRaised : 'transparent',
                    opacity: option.disabled ? 0.4 : pressed ? 0.7 : 1,
                  },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected, disabled: option.disabled }}
                accessibilityLabel={option.accessibilityLabel ?? option.label}
              >
                <Text
                  style={[
                    isSelected ? type.bodyStrong : type.body,
                    { color: option.disabled ? colors.textMuted : colors.text },
                  ]}
                >
                  {option.label}
                </Text>
                {/*
                 * A tick as well as the weight and fill, so the selected row is
                 * not carried by background alone — that is a very low-contrast
                 * signal, and it disappears entirely against a pressed row.
                 */}
                {isSelected ? (
                  <Text
                    style={[type.body, { color: colors.text }]}
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                  >
                    ✓
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.tight },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.snug,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: space.base,
    paddingVertical: space.snug,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  value: { flex: 1 },
  menu: {
    maxHeight: 260,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  menuContent: { paddingVertical: space.hair },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.snug,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: space.base,
    paddingVertical: space.snug,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
