/**
 * "You are not looking at now."
 *
 * THIS IS A SAFETY CONTROL, NOT A STATUS CHIP.
 *
 * The time picker makes every number on screen answer for a moment the user
 * chose. Left unmarked, that is the most dangerous state this app can be in: a
 * map covered in solid green outlines and the word FREE, which is true of Sunday
 * and false of the Tuesday morning the phone is actually being held on. Someone
 * scrubs to Sunday, gets distracted, comes back, and parks on what the screen
 * still says is free. That is a $70 ticket caused entirely by presentation.
 *
 * So it is loud on purpose, it appears on every screen that shows a status, and
 * it carries its own way out rather than making the user find the picker again.
 * It is the one place in this app where being visually insistent is the correct
 * design.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { space, radius, type } from '../theme';
import { withAlpha, type ColorScheme } from '../theme/colors';
import { describeInstant } from './TimePicker';

export function PreviewBanner({
  previewAt,
  now,
  onBackToNow,
  colors,
}: {
  previewAt: Date;
  /** The live clock, for phrasing the moment relative to it. */
  now: Date;
  onBackToNow: () => void;
  colors: ColorScheme;
}) {
  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: withAlpha(colors.caution, 0.16),
          borderColor: colors.caution,
        },
      ]}
      // A live region: this appears without the user having touched this
      // particular screen, because the picker lives on the other one.
      accessibilityLiveRegion="polite"
    >
      <Text style={[type.bodyStrong, styles.message, { color: colors.text }]}>
        Showing {describeInstant(previewAt, now)} — not right now
      </Text>
      <Pressable
        onPress={onBackToNow}
        style={({ pressed }) => [
          styles.action,
          { borderColor: colors.caution, opacity: pressed ? 0.7 : 1 },
        ]}
        hitSlop={space.snug}
        accessibilityRole="button"
        // Names what happens, per the app's copy rule.
        accessibilityLabel="Back to now"
      >
        <Text style={[type.label, { color: colors.text }]}>BACK TO NOW</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.snug,
    paddingHorizontal: space.base,
    paddingVertical: space.snug,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  message: { flex: 1 },
  action: {
    // 44pt would make this banner taller than the map's status card; the
    // hitSlop above carries the touch target instead.
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: space.snug,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
