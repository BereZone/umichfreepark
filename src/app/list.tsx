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
import { FlatList, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AREAS, rank } from '../engine';
import { AreaRow } from '../components/AreaRow';
import { PreviewBanner } from '../components/PreviewBanner';
import { TripControls } from '../components/TripControls';
import { useAt } from '../hooks/use-at';
import { useTrip } from '../state/trip';
import { WIDE_LAYOUT_MIN_WIDTH, space, type } from '../theme';
import { colorsFor } from '../theme/colors';

export default function ListScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = colorsFor(scheme);
  const insets = useSafeAreaInsets();
  // A minute is enough here: the list shows costs and walk times, and a
  // per-second tick would re-sort 262 rows under the user's thumb for nothing.
  const { at: now, isLive } = useAt(60_000);
  const {
    destination,
    durationHours,
    mode,
    profile,
    previewAt,
    setPreviewAt,
    selectedAreaId,
    setSelectedAreaId,
  } = useTrip();

  const ranked = useMemo(() => {
    if (!destination) return [];
    return rank(AREAS, {
      buildingId: destination.id,
      durationHours,
      at: now,
      mode,
      profile,
    });
  }, [destination, durationHours, mode, now, profile]);

  const best = ranked.find((option) => option.eligibility.eligible) ?? null;
  const freeCount = ranked.filter((option) => !option.status.paid).length;

  /*
   * The controls scroll WITH the results rather than sitting above them.
   *
   * As a fixed header this screen failed completely at accessibility text
   * sizes: the title, the destination, the search field and two rows of chips
   * grew until they filled the viewport, and the FlatList underneath was
   * squeezed to nothing. A user at the largest Dynamic Type setting saw zero
   * parking options on the view that is supposed to be the accessible
   * equivalent of the map — the worst possible place for that to happen.
   *
   * Passing them as ListHeaderComponent means everything shares one scroll
   * container, so large type makes the page longer instead of making the
   * content unreachable.
   */
  const header = (
    <View style={styles.header}>
      {/*
       * Just "Parking". The destination used to be repeated here as a heading
       * directly above the field that already shows it, so the screen opened
       * with the same building name twice in three lines.
       */}
      <Text style={[type.title, { color: colors.text }]} accessibilityRole="header">
        Parking
      </Text>
      {previewAt ? (
        <View style={styles.banner}>
          <PreviewBanner
            previewAt={previewAt}
            now={new Date()}
            onBackToNow={() => setPreviewAt(null)}
            colors={colors}
          />
        </View>
      ) : null}
      <TripControls />
      {ranked.length > 0 ? (
        <Text style={[type.caption, { color: colors.textMuted }]} accessibilityLiveRegion="polite">
          {freeCount} of {ranked.length} free {isLive ? 'right now' : 'at that time'}.
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/*
       * On a wide screen the rows stop growing and centre instead.
       *
       * A parking row is a name, a price and a walk time. Stretched to 1440pt
       * the price ends up a foot from the name it belongs to, and the eye has
       * to travel the whole width to pair them up. Capping the measure is the
       * same reason body copy is capped.
       */}
      <View style={styles.measure}>
        <FlatList
          data={ranked}
          keyExtractor={(option) => option.area.id}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingBottom: insets.bottom + space.roomy }}
          // The search field drops a result list over the rows below it; without
          // this, tapping a result scrolls the list instead of choosing it.
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[type.bodyStrong, { color: colors.text }]}>
                {destination ? 'Nothing open to you nearby' : 'Pick where you’re going'}
              </Text>
              <Text style={[type.body, { color: colors.textMuted }]}>
                {destination
                  ? 'Every area near here is either enforced right now or needs a permit you can’t buy. The Learn tab has what to do instead — the buses are free.'
                  : 'Search a building above. Nicknames work: “the dude”, “ugli”, “the big house”.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <AreaRow
              option={item}
              best={best}
              colors={colors}
              selected={item.area.id === selectedAreaId}
              onSelect={setSelectedAreaId}
            />
          )}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  measure: { flex: 1, width: '100%', maxWidth: WIDE_LAYOUT_MIN_WIDTH, alignSelf: 'center' },
  header: {
    paddingHorizontal: space.comfortable,
    paddingTop: space.base,
    paddingBottom: space.base,
    gap: space.tight,
  },
  banner: { paddingVertical: space.snug },
  empty: { paddingVertical: space.roomy, paddingHorizontal: space.comfortable, gap: space.snug },
});
