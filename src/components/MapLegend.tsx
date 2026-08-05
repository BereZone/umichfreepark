/**
 * The map's key.
 *
 * Two ideas, in the order they matter. The border style says whether you are
 * paying right now; the fill colour says whose rules apply. That split is the
 * whole design — free versus paid is the urgent bit and it rides on line style
 * and text so it survives red-green colour blindness, while hue carries the
 * authority, which nobody has to see instantly.
 *
 * Every swatch is drawn from the same constants `encoding.ts` hands the
 * renderers, so a key that disagrees with the map is not expressible here.
 *
 * The free/paid pair is always visible; the colour roll is behind a toggle.
 * Six permanently-open colour rows on a phone would cover the lots they
 * describe, and a user only needs them once.
 *
 * It stacks rather than sitting in a row. Laid out horizontally the two
 * always-on entries plus the toggle came to roughly 320pt, which on a 390pt
 * phone left the key overhanging its own screen edge with the free-count card
 * beside it. A narrow column costs a little height in a corner of the map and
 * fits every width the app runs at.
 */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  FREE_BORDER_WIDTH,
  LEGEND_TIERS,
  PAID_BORDER_WIDTH,
  tierHue,
} from './Map';
import { MAX_MAP_TEXT_SCALE, MIN_TOUCH_TARGET, radius, space, type, withAlpha } from '../theme';
import type { ColorScheme, ThemeName } from '../theme/colors';

export function MapLegend({
  colors,
  scheme,
}: {
  colors: ColorScheme;
  scheme: ThemeName;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View
      style={[styles.root, { backgroundColor: colors.surface, borderColor: colors.border }]}
      accessibilityRole="summary"
      accessibilityLabel="Map key"
    >
      <Swatch
        borderColor={colors.free}
        borderWidth={FREE_BORDER_WIDTH}
        borderStyle="solid"
        fill={withAlpha(colors.free, 0.28)}
        label="Free now"
        colors={colors}
        block
      />
      <Swatch
        borderColor={colors.cityNeutral}
        borderWidth={PAID_BORDER_WIDTH}
        borderStyle="dashed"
        fill={withAlpha(colors.cityNeutral, 0.16)}
        label="Paid now"
        colors={colors}
        block
      />

      <Pressable
        onPress={() => setExpanded((open) => !open)}
        style={styles.toggle}
        hitSlop={space.snug}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        // Names what happens, not what it is.
        accessibilityLabel={expanded ? 'Hide the permit colours' : 'Show what the colours mean'}
      >
        <Text
          style={[type.label, { color: colors.textMuted }]}
          maxFontSizeMultiplier={MAX_MAP_TEXT_SCALE}
        >
          {expanded ? 'LESS' : 'COLOURS'}
        </Text>
      </Pressable>

      {expanded ? (
        <View style={[styles.expanded, { borderColor: colors.border }]}>
          <Text
            style={[type.label, { color: colors.textMuted }]}
            maxFontSizeMultiplier={MAX_MAP_TEXT_SCALE}
          >
            FILL = WHOSE RULES
          </Text>
          <Swatch
            borderColor={colors.cityNeutral}
            borderWidth={PAID_BORDER_WIDTH}
            borderStyle="solid"
            fill={withAlpha(colors.cityNeutral, 0.4)}
            label="City of Ann Arbor"
            colors={colors}
            block
          />
          {LEGEND_TIERS.map((tier) => {
            const hue = tierHue(tier, scheme);
            return (
              <Swatch
                key={tier}
                borderColor={hue}
                borderWidth={PAID_BORDER_WIDTH}
                borderStyle="solid"
                fill={withAlpha(hue, 0.4)}
                label={tier === 'Park & Ride' ? 'Park & Ride — free' : `U-M ${tier}`}
                colors={colors}
                block
              />
            );
          })}
          <Swatch
            borderColor={colors.ineligible}
            borderWidth={PAID_BORDER_WIDTH}
            borderStyle="solid"
            fill={withAlpha(colors.ineligible, 0.2)}
            label="Closed to you"
            colors={colors}
            block
          />
        </View>
      ) : null}
    </View>
  );
}

function Swatch({
  borderColor,
  borderWidth,
  borderStyle,
  fill,
  label,
  colors,
  block = false,
}: {
  borderColor: string;
  borderWidth: number;
  borderStyle: 'solid' | 'dashed';
  fill: string;
  label: string;
  colors: ColorScheme;
  /** Full-width row in the expanded roll; inline pair in the always-on part. */
  block?: boolean;
}) {
  return (
    <View style={[styles.entry, block && styles.entryBlock]}>
      <View
        style={[
          styles.swatch,
          {
            backgroundColor: fill,
            borderColor,
            borderWidth,
            borderStyle,
          },
        ]}
      />
      <Text style={[type.caption, { color: colors.text }]} maxFontSizeMultiplier={MAX_MAP_TEXT_SCALE}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    // Never wider than a third of a phone. The key annotates the map; it must
    // not become the thing on screen.
    maxWidth: 220,
    gap: space.snug,
    paddingHorizontal: space.base,
    paddingVertical: space.snug,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  entry: { flexDirection: 'row', alignItems: 'center', gap: space.snug },
  entryBlock: { width: '100%' },
  swatch: {
    width: 24,
    height: 14,
    borderRadius: radius.sm,
  },
  toggle: {
    // A 44pt target on a 13pt label leaves dead space either way; centring it
    // splits that space above and below rather than stacking all of it above,
    // where it read as a gap between two unrelated things.
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
  expanded: {
    gap: space.snug,
    paddingTop: space.snug,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
