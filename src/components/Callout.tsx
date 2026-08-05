/**
 * A block that says something the surrounding text does not: you cannot park
 * here, we are not sure, this Saturday is different.
 *
 * The tone is a color token, and the block carries it as a wash across the
 * whole surface rather than as a thick stripe down one edge. A stripe puts the
 * signal at the far left of a line the eye reads left to right, so at large
 * text sizes — where a callout wraps to five lines — the color is doing its
 * work next to one of them. A tinted surface stays attached to every word in
 * the block, which is what the tone is actually about.
 *
 * Tone is never the only carrier. Each callout leads with a sentence that says
 * the same thing in words, because 8% of men would read this block as grey.
 */

import { StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { radius, space, type } from '../theme';
import { withAlpha, type ColorScheme } from '../theme/colors';

export type CalloutTone = 'caution' | 'blocked';

export function Callout({
  tone,
  title,
  children,
  colors,
}: {
  tone: CalloutTone;
  /** The headline claim. Omit only when the body is already one short sentence. */
  title?: string;
  children?: ReactNode;
  colors: ColorScheme;
}) {
  const accent = tone === 'blocked' ? colors.ineligible : colors.caution;

  return (
    <View
      style={[
        styles.root,
        {
          // Low enough that body text keeps its 4.5:1 against the surface it
          // sits on, high enough to read as a distinct block at a glance.
          backgroundColor: withAlpha(accent, 0.1),
          borderColor: withAlpha(accent, 0.45),
        },
      ]}
      accessibilityRole="alert"
    >
      {title ? <Text style={[type.bodyStrong, { color: accent }]}>{title}</Text> : null}
      {children}
    </View>
  );
}

/** Body copy inside a callout, at the right emphasis. Saves every caller a style array. */
export function CalloutText({
  children,
  colors,
}: {
  children: ReactNode;
  colors: ColorScheme;
}) {
  return <Text style={[type.body, { color: colors.text }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  root: {
    padding: space.base,
    gap: space.tight,
    borderRadius: radius.md,
    borderWidth: 1,
  },
});
