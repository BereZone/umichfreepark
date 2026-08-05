/**
 * The app's one selectable control.
 *
 * Sort order, stay length and your class year are the same interaction — pick
 * exactly one from a short set — so they are the same component. Three separate
 * implementations of a pill with a border is how the selected state ends up
 * meaning a filled background on one screen and a heavier border on another.
 *
 * Selection is carried by fill AND weight, not by fill alone: at the largest
 * Dynamic Type settings the chips wrap onto several lines, and a single
 * background color is a weak signal once the row is no longer a row.
 */

import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { MIN_TOUCH_TARGET, radius, space, tabularNumbers, type } from '../theme';
import type { ColorScheme } from '../theme/colors';

export function Chip({
  label,
  selected,
  onPress,
  colors,
  accessibilityLabel,
  numeric = false,
  disabled = false,
  style,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  colors: ColorScheme;
  /** Spoken form, when the visible label is an abbreviation like "8h". */
  accessibilityLabel?: string;
  /** Tabular figures, so a row of durations does not change width on selection. */
  numeric?: boolean;
  /**
   * Shown but not choosable — a permit this class year cannot buy.
   *
   * Disabled rather than absent, deliberately. Removing the option hides the
   * rule along with it, and the user is left wondering whether the app forgot
   * their permit or the university does not sell it.
   */
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.text : 'transparent',
          borderColor: selected ? colors.text : colors.border,
          // Pressed state on both platforms. Touch has no hover, and without
          // this a tap that lands during a re-render gives no feedback at all.
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
        style,
      ]}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Text
        style={[
          selected ? type.captionStrong : type.caption,
          numeric ? tabularNumbers : null,
          {
            // Dimmed by the token rather than by opacity alone: opacity on the
            // container fades the border too, and a 0.4 border on a 0.4 label
            // drops below the contrast the audit asserts.
            color: disabled ? colors.textMuted : selected ? colors.textInverse : colors.text,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: space.base,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
