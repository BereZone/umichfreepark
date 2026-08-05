/**
 * One ranked parking option, as a row.
 *
 * Used by the list screen and by the map's sidebar in the wide layout. Those
 * are the same rows over the same ranking; building them twice would let the
 * two drift into showing different prices for the same lot at the same moment.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { tradeOff, type RankedOption } from '../engine';
import { MIN_TOUCH_TARGET, space, tabularNumbers, type } from '../theme';
import type { ColorScheme } from '../theme/colors';
import { priceFor, reasonDetail, walkLabel } from './format';

export function AreaRow({
  option,
  /** The top eligible option, for the trade-off sentence. Null on the row that IS best. */
  best,
  colors,
  selected,
  onSelect,
}: {
  option: RankedOption;
  best: RankedOption | null;
  colors: ColorScheme;
  selected: boolean;
  onSelect: (id: string | null) => void;
}) {
  const { area, status, eligibility, costCents, walkSeconds } = option;
  const free = !status.paid;

  const price = priceFor(costCents, area.rate.kind);
  const walk = walkLabel(walkSeconds);

  // Stated in words, because the trade-off is the actual decision. The sentence
  // is engine output so the map and the list cannot word it differently.
  const comparison = best && best.area.id !== area.id ? tradeOff(option, best) : null;

  return (
    <Pressable
      // Tapping a row selects the same area a polygon tap would. Before this
      // the row was a Pressable with no handler, so a screen reader announced
      // "button" on something that did nothing when activated.
      onPress={() => onSelect(selected ? null : area.id)}
      style={({ pressed }) => [
        styles.row,
        {
          borderColor: colors.border,
          backgroundColor: selected ? colors.surface : 'transparent',
          opacity: (eligibility.eligible ? 1 : 0.72) * (pressed ? 0.7 : 1),
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityHint={selected ? 'Deselects this area' : 'Selects this area on the map'}
      accessibilityLabel={[
        area.name,
        free ? 'free right now' : price,
        walk,
        eligibility.eligible ? null : `unavailable: ${eligibility.reason}`,
      ]
        .filter(Boolean)
        .join(', ')}
    >
      <View style={styles.main}>
        {/* Two lines, not one. "Thayer Street Parking Structure" truncated to
            "Thayer Street Parking Structur…" on a 390pt phone, which is the
            width most of this app is read at. */}
        <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={2}>
          {area.name}
        </Text>
        <Text style={[type.caption, { color: colors.textMuted }]}>
          {reasonDetail(status.reason)}
        </Text>
        {comparison ? (
          <Text style={[type.caption, { color: colors.textMuted }]}>{comparison}</Text>
        ) : null}
        {!eligibility.eligible ? (
          <Text style={[type.caption, { color: colors.ineligible }]}>{eligibility.reason}</Text>
        ) : null}
        {/*
         * Said here as well as in the detail panel, because this row is where
         * the misleading number appears. A park-and-ride can win the ranking on
         * price and then show a 79-minute walk as the best option going, which
         * reads as a broken app rather than as "take the bus".
         */}
        {area.permitTier === 'Park & Ride' ? (
          <Text style={[type.caption, { color: colors.free }]}>Free bus from here to campus</Text>
        ) : null}
        {!status.certain ? (
          <Text style={[type.caption, { color: colors.caution }]}>
            Holiday closures unconfirmed — check the sign.
          </Text>
        ) : null}
      </View>

      <View style={styles.meta}>
        <Text
          style={[type.bodyStrong, tabularNumbers, { color: free ? colors.free : colors.text }]}
        >
          {price}
        </Text>
        {walk ? (
          <Text style={[type.caption, tabularNumbers, { color: colors.textMuted }]}>{walk}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.base,
    minHeight: MIN_TOUCH_TARGET + space.base,
    paddingHorizontal: space.comfortable,
    paddingVertical: space.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  main: { flex: 1, gap: space.hair },
  meta: { alignItems: 'flex-end', gap: space.hair },
});
