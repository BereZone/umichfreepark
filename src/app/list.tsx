/**
 * The list view.
 *
 * This is the accessible equivalent of the map, not a secondary feature. Every
 * area the map can select is reachable here, it works when tiles fail, and it
 * is the only view that works with a screen reader. Both renderers' accessibility
 * labels point at it by name, so it has to hold up.
 *
 * It also states trade-offs in words. A single opaque "best" score would hide
 * the one thing the user is actually deciding between: money and walking.
 */

import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AREAS,
  rank,
  tradeOff,
  type RankedOption,
  type RankingMode,
} from '../engine';
import { BuildingSearch } from '../components/BuildingSearch';
import { useNow } from '../hooks/use-now';
import { DURATION_OPTIONS, useTrip } from '../state/trip';
import { MIN_TOUCH_TARGET, radius, space, tabularNumbers, type } from '../theme';
import { colorsFor } from '../theme/colors';

const MODES: { key: RankingMode; label: string }[] = [
  { key: 'cheapest', label: 'Cheapest' },
  { key: 'closest', label: 'Closest' },
  { key: 'balanced', label: 'Best balance' },
];

const money = (cents: number) =>
  cents === 0 ? 'Free' : `$${(cents / 100).toFixed(2)}`;

export default function ListScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = colorsFor(scheme);
  const insets = useSafeAreaInsets();
  // A minute is enough here: the list shows costs and walk times, and a
  // per-second tick would re-sort 75 rows under the user's thumb for nothing.
  const now = useNow(60_000);
  const { destination, setDestination, durationHours, setDurationHours, mode, setMode } =
    useTrip();

  const ranked = useMemo(() => {
    if (!destination) return [];
    return rank(AREAS, {
      buildingId: destination.id,
      durationHours,
      at: now,
      mode,
    });
  }, [destination, durationHours, mode, now]);

  const best = ranked.find((option) => option.eligibility.eligible) ?? null;

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={[type.title, { color: colors.text }]}>Parking near</Text>
        <Text style={[type.heading, { color: colors.textMuted }]}>
          {destination?.name ?? 'nowhere selected'}
        </Text>
        <BuildingSearch value={destination} onSelect={setDestination} />
      </View>

      <View style={styles.controls} accessibilityRole="radiogroup" accessibilityLabel="Sort by">
        {MODES.map((option) => {
          const active = option.key === mode;
          return (
            <Pressable
              key={option.key}
              onPress={() => setMode(option.key)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.text : 'transparent',
                  borderColor: active ? colors.text : colors.border,
                },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Sort by ${option.label}`}
            >
              <Text style={[type.caption, { color: active ? colors.textInverse : colors.text }]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.controls} accessibilityRole="radiogroup" accessibilityLabel="How long">
        {DURATION_OPTIONS.map((hours) => {
          const active = hours === durationHours;
          return (
            <Pressable
              key={hours}
              onPress={() => setDurationHours(hours)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.text : 'transparent',
                  borderColor: active ? colors.text : colors.border,
                },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Park for ${hours} hour${hours === 1 ? '' : 's'}`}
            >
              <Text
                style={[
                  type.caption,
                  tabularNumbers,
                  { color: active ? colors.textInverse : colors.text },
                ]}
              >
                {hours}h
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={ranked}
        keyExtractor={(option) => option.area.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.roomy }}
        ListEmptyComponent={
          <Text style={[type.body, styles.empty, { color: colors.textMuted }]}>
            Pick a destination to see what’s nearby.
          </Text>
        }
        renderItem={({ item }) => (
          <Row option={item} best={best} colors={colors} />
        )}
      />
    </View>
  );
}

function Row({
  option,
  best,
  colors,
}: {
  option: RankedOption;
  best: RankedOption | null;
  colors: ReturnType<typeof colorsFor>;
}) {
  const { area, status, eligibility, costCents, walkSeconds } = option;
  const free = !status.paid;

  const price =
    costCents === null
      ? area.rate.kind === 'permit-only'
        ? 'Permit only'
        : 'See sign'
      : money(costCents);

  const walk = walkSeconds === null ? null : `${Math.ceil(walkSeconds / 60)} min walk`;

  // Stated in words, because the trade-off is the actual decision.
  const comparison = best && best.area.id !== area.id ? tradeOff(option, best) : null;

  return (
    <Pressable
      style={[
        styles.row,
        {
          borderColor: colors.border,
          opacity: eligibility.eligible ? 1 : 0.72,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={[
        area.name,
        free ? 'free right now' : price,
        walk,
        eligibility.eligible ? null : `unavailable: ${eligibility.reason}`,
      ]
        .filter(Boolean)
        .join(', ')}
    >
      <View style={styles.rowMain}>
        <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
          {area.name}
        </Text>
        <Text style={[type.caption, { color: colors.textMuted }]}>
          {status.reason}
        </Text>
        {comparison ? (
          <Text style={[type.caption, { color: colors.textMuted }]}>{comparison}</Text>
        ) : null}
        {!eligibility.eligible ? (
          <Text style={[type.caption, { color: colors.ineligible }]}>{eligibility.reason}</Text>
        ) : null}
        {!status.certain ? (
          <Text style={[type.caption, { color: colors.caution }]}>
            Holiday closures unconfirmed — check the sign.
          </Text>
        ) : null}
      </View>

      <View style={styles.rowMeta}>
        <Text
          style={[
            type.bodyStrong,
            tabularNumbers,
            { color: free ? colors.free : colors.text },
          ]}
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
  root: { flex: 1 },
  header: {
    paddingHorizontal: space.comfortable,
    paddingTop: space.base,
    gap: space.tight,
  },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.snug,
    paddingHorizontal: space.comfortable,
    paddingTop: space.base,
  },
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: space.base,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.base,
    minHeight: MIN_TOUCH_TARGET + space.base,
    paddingHorizontal: space.comfortable,
    paddingVertical: space.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowMain: { flex: 1, gap: space.hair },
  rowMeta: { alignItems: 'flex-end', gap: space.hair },
  empty: { padding: space.roomy, textAlign: 'center' },
});
