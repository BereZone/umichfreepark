/**
 * The map screen.
 *
 * Full-bleed map with a status strip and key above it, and one sheet below it
 * that is either the trip controls or the selected area's detail. The screen
 * owns state and layout; it owns no parking logic and no appearance decisions —
 * those live in the engine and encoding.ts respectively.
 *
 * WHY ONE SHEET WITH TWO FACES
 *
 * Controls and detail both want the bottom of the screen, because that is where
 * a thumb reaches on a phone the user is holding in one hand outside a
 * structure. Stacking them would push the controls out of reach exactly when a
 * lot is selected, which is when the duration selector matters most — you tap a
 * lot to find out what two hours costs. So they take turns in the same place,
 * and selecting an area is what swaps them.
 *
 * The sheet is not draggable, deliberately. A drag handle on top of a pannable
 * map is a gesture conflict, and two snap points are not worth the ambiguity —
 * the collapsed/expanded toggle is a button that says which it is.
 *
 * It opens collapsed. At full height it took 54% of a phone, leaving the map a
 * strip above a control panel, on the screen whose whole job is the map.
 *
 * WHY THE SHEET IS A SIBLING AND NOT AN OVERLAY
 *
 * It floated over the map first, which looked better and was wrong. Tile
 * attribution is a licence condition, not decoration — OpenFreeMap and
 * OpenStreetMap both require it — and MapLibre draws it at the bottom edge of
 * its own container, which is precisely the strip a bottom sheet covers. There
 * is no anchor for a full-width sheet that leaves it visible.
 *
 * Laying them out as a column instead means the map ends where the sheet
 * begins: attribution is always on screen, no z-index has to win a fight with a
 * map control, and the panel cannot hide the lot the user just tapped. The map
 * is still edge to edge, which is what "full-bleed" was buying.
 */

import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { MAP_AREAS, Map } from '../components/Map';
import { AREAS, areaById, rank, statusOf } from '../engine';
import { AreaDetail } from '../components/AreaDetail';
import { AreaRow } from '../components/AreaRow';
import { Fade } from '../components/Fade';
import { MapLegend } from '../components/MapLegend';
import { PreviewBanner } from '../components/PreviewBanner';
import { TripControls } from '../components/TripControls';
import { useIsWideLayout } from '../hooks/use-layout';
import { useReduceMotion } from '../hooks/use-accessibility';
import { useAt } from '../hooks/use-at';
import { useTrip } from '../state/trip';
import {
  MAX_MAP_TEXT_SCALE,
  MIN_TOUCH_TARGET,
  SIDEBAR_WIDTH,
  radius,
  space,
  tabularNumbers,
  type,
} from '../theme';
import { colorsFor } from '../theme/colors';

export default function MapScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = colorsFor(scheme);
  const insets = useSafeAreaInsets();
  const { at: now, isLive } = useAt();
  const reduceMotion = useReduceMotion();
  const wide = useIsWideLayout();

  // Selection is shared with the list so a row tap and a polygon tap do the
  // same thing. See src/state/trip.tsx.
  const {
    selectedAreaId,
    setSelectedAreaId,
    destination,
    durationHours,
    mode,
    profile,
    previewAt,
    setPreviewAt,
  } = useTrip();
  const [tileError, setTileError] = useState<Error | null>(null);
  /*
   * The blue dot appears only after the user has asked for it.
   *
   * `showsUserLocation` is a rendering flag, not a request — neither renderer
   * ever prompts, so this has to be raised by the control that did. Keeping the
   * two in one place is what makes "the app never asks on its own" checkable by
   * reading one screen rather than trusting two renderers.
   */
  const [showsUserLocation, setShowsUserLocation] = useState(false);
  /*
   * The sheet opens small.
   *
   * At full height it took 54% of a phone, so the map — the entire point of
   * this screen — was a strip above a control panel. Collapsed it shows where
   * you are going and the single best option, which is the answer most of the
   * time; the controls are one tap away for the times it is not.
   */
  const [sheetExpanded, setSheetExpanded] = useState(false);

  const selected = selectedAreaId ? (areaById.get(selectedAreaId) ?? null) : null;

  /**
   * The count is over EVERY area UMichFreePark knows, not the ones it can draw.
   *
   * It used to read `MAP_AREAS`, and so reported "0 / 101" while the app held
   * rules for 262 areas. Nothing labelled that 101 as a subset, so the
   * denominator read as the size of the inventory — and the numerator was a
   * count of free parking that quietly excluded every lot without a polygon.
   * Two different wrong numbers from one substitution.
   *
   * Which set is right follows from what the number is for: it answers "how
   * much free parking is there right now", a question about Ann Arbor, not
   * about our geometry coverage. The list view already answers it over all
   * areas, and the two must not disagree.
   *
   * Recomputed each tick, which is cheap — statusOf is a handful of comparisons
   * — and the expensive part of a tick is re-rendering markers, which the
   * renderers handle themselves.
   */
  const summary = useMemo(() => {
    let free = 0;
    for (const area of AREAS) {
      if (!statusOf(area, now).paid) free += 1;
    }
    return { free, total: AREAS.length };
  }, [now]);

  /**
   * The ranking, for the sidebar and for the best-option teaser.
   *
   * Ranked on the minute rather than the second: this drives a sorted list, and
   * re-sorting 262 rows under the user's thumb every second would reorder the
   * thing they are reaching for. The countdown still ticks per second; only the
   * ordering is held still.
   */
  const minute = useMemo(() => new Date(Math.floor(now.getTime() / 60_000) * 60_000), [now]);
  const ranked = useMemo(() => {
    if (!destination) return [];
    return rank(AREAS, {
      buildingId: destination.id,
      durationHours,
      at: minute,
      mode,
      profile,
    });
  }, [destination, durationHours, minute, mode, profile]);

  const best = useMemo(
    () => ranked.find((option) => option.eligibility.eligible) ?? null,
    [ranked]
  );

  // A new object each render would make the renderers' destination effect
  // re-run — and on web that removes and re-adds the marker — on every tick.
  const destinationPoint = useMemo(
    () => (destination ? { lat: destination.lat, lon: destination.lon } : null),
    [destination]
  );

  const handleSelect = useCallback(
    (id: string | null) => {
      setSelectedAreaId(id);
      // A light tap confirms the tap landed on a polygon, which matters on a
      // full-bleed map where the panel animating in is the only other feedback.
      // Selection only — firing on deselect would make dismissing feel like an
      // error.
      if (id !== null) {
        Haptics.selectionAsync().catch(() => {
          // Haptics are unavailable on web and on some devices. Never a failure.
        });
      }
    },
    [setSelectedAreaId]
  );

  const detailHeader = selected ? (
    <View style={styles.panelHeader}>
      <Text style={[type.heading, styles.panelTitle, { color: colors.text }]}>{selected.name}</Text>
      {/*
       * A filled circle, not a text link.
       *
       * "Close" in muted grey read as a caption rather than a control, which is
       * a bad thing to be unsure about on the one panel covering the map. It
       * now carries the same filled treatment as a selected chip — the app's
       * existing signal for "this is a control, and it is active".
       */}
      <Pressable
        onPress={() => handleSelect(null)}
        style={({ pressed }) => [
          styles.close,
          { backgroundColor: colors.text, opacity: pressed ? 0.7 : 1 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Close details"
        hitSlop={space.snug}
      >
        <Text
          style={[type.heading, { color: colors.textInverse }]}
          // The label above already says what this does; the glyph would only
          // add "multiplication sign" to it.
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          ✕
        </Text>
      </Pressable>
    </View>
  ) : null;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.mapColumn}>
        <View style={styles.mapArea}>
          <Map
            areas={MAP_AREAS}
            at={now}
            selectedAreaId={selectedAreaId}
            onSelectArea={handleSelect}
            destination={destinationPoint}
            profile={profile}
            showsUserLocation={showsUserLocation}
            reduceMotion={reduceMotion}
            onError={setTileError}
          />

          <View
            style={[
              styles.overlay,
              {
                top: insets.top + space.snug,
                left: space.comfortable,
                right: space.comfortable,
              },
            ]}
            pointerEvents="box-none"
          >
            <View
              style={[
                styles.statusBar,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
              accessibilityRole="header"
            >
              <Text
                style={[type.label, { color: colors.textMuted }]}
                maxFontSizeMultiplier={MAX_MAP_TEXT_SCALE}
              >
                {isLive ? 'FREE RIGHT NOW' : 'FREE THEN'}
              </Text>
              <Text
                style={[type.title, tabularNumbers, { color: colors.text }]}
                // The count changes on its own, so a screen reader has to be told.
                accessibilityLiveRegion="polite"
                accessibilityLabel={
                isLive
                  ? `${summary.free} of ${summary.total} parking areas are free right now`
                  : `${summary.free} of ${summary.total} parking areas are free at the time you selected`
              }
                // Bounded so the card stays a card over the map. The sentence
                // above is what a screen reader gets, at any size it likes.
                maxFontSizeMultiplier={MAX_MAP_TEXT_SCALE}
              >
                {summary.free}
                <Text style={[type.heading, { color: colors.textMuted }]}> / {summary.total}</Text>
              </Text>
            </View>

            <View style={styles.legendSlot}>
              <MapLegend colors={colors} scheme={scheme} />
            </View>
          </View>

          {tileError ? (
            <View
              style={[
                styles.errorBanner,
                {
                  bottom: space.comfortable,
                  backgroundColor: colors.surface,
                  borderColor: colors.caution,
                },
              ]}
            >
              <Text style={[type.bodyStrong, { color: colors.text }]}>The map didn’t load</Text>
              <Text style={[type.body, { color: colors.text }]}>
                Tiles come from the network and the rest of UMichFreePark doesn’t. The list has every one of
                these {summary.total} areas and works offline.
              </Text>
            </View>
          ) : null}
        </View>

        {previewAt ? (
          <View style={styles.previewSlot}>
            <PreviewBanner
              previewAt={previewAt}
              now={new Date()}
              onBackToNow={() => setPreviewAt(null)}
              colors={colors}
            />
          </View>
        ) : null}

        {/*
         * The sheet only exists in the compact layout. In the wide one its
         * contents live in the sidebar, where they never cover the map.
         */}
        {!wide ? (
          <Fade
            // Remounting on the swap is what replays the entrance. Without the
            // key the sheet's contents would change under a view that has
            // already finished animating, and the swap would be a hard cut.
            key={selected ? 'detail' : 'browse'}
            reduceMotion={reduceMotion}
            slide
            style={styles.sheetWrap}
          >
            <View
              style={[
                styles.sheet,
                {
                  backgroundColor: colors.surfaceRaised,
                  borderColor: colors.border,
                },
              ]}
            >
              <ScrollView
                contentContainerStyle={[
                  styles.sheetContent,
                  { paddingBottom: insets.bottom + space.base },
                ]}
                keyboardShouldPersistTaps="handled"
              >
                {selected ? (
                  <>
                    {detailHeader}
                    <AreaDetail area={selected} now={now} colors={colors} />
                  </>
                ) : (
                  <>
                    {/*
                     * The trip is a dropdown, closed by default.
                     *
                     * Collapsed it is one row: where you are going and for how
                     * long, which is what the ranking below it was computed
                     * from. The search field and the chips only exist once you
                     * open it, so the sheet stays small and the map — the whole
                     * point of this screen — stays visible.
                     *
                     * A button rather than a drag handle: a draggable sheet over
                     * a pannable map is a gesture conflict, and two states are
                     * not worth the ambiguity. It is drawn as a control with a
                     * border and a caret rather than as a line of text with a
                     * word beside it, because the previous version read as a
                     * label and nothing suggested it opened.
                     */}
                    <Pressable
                      onPress={() => setSheetExpanded((open) => !open)}
                      style={({ pressed }) => [
                        styles.sheetToggle,
                        {
                          backgroundColor: colors.surface,
                          borderColor: sheetExpanded ? colors.borderStrong : colors.border,
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: sheetExpanded }}
                      accessibilityLabel={
                        sheetExpanded
                          ? 'Hide the trip options'
                          : `Going to ${destination?.name ?? 'nowhere selected'} for ${durationHours} hours. Open to change it or search a building.`
                      }
                    >
                      {/*
                       * The summary is the closed state's whole content, and it
                       * steps aside when open: TripControls puts the same
                       * destination under its own GOING TO label, and showing
                       * both printed that heading twice within four lines.
                       */}
                      {sheetExpanded ? (
                        <Text style={[type.label, styles.sheetSummary, { color: colors.textMuted }]}>
                          TRIP OPTIONS
                        </Text>
                      ) : (
                        <View style={styles.sheetSummary}>
                          <Text style={[type.label, { color: colors.textMuted }]}>GOING TO</Text>
                          <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
                            {destination?.name ?? 'Nowhere selected'}
                            <Text style={[type.body, tabularNumbers, { color: colors.textMuted }]}>
                              {'  ·  '}
                              {durationHours}h
                            </Text>
                          </Text>
                        </View>
                      )}
                      <Caret open={sheetExpanded} color={colors.text} />
                    </Pressable>

                    {sheetExpanded ? <TripControls onLocated={setShowsUserLocation} /> : null}

                    <BestOption
                      best={best}
                      ranked={ranked}
                      colors={colors}
                      hasDestination={destination !== null}
                      isLive={isLive}
                      onSelect={handleSelect}
                      selectedAreaId={selectedAreaId}
                    />
                  </>
                )}
              </ScrollView>
            </View>
          </Fade>
        ) : null}
      </View>

      {wide ? (
        <View
          style={[
            styles.sidebar,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              paddingTop: insets.top + space.base,
            },
          ]}
        >
          <View style={styles.sidebarControls}>
            <TripControls onLocated={setShowsUserLocation} />
          </View>

          {selected ? (
            <ScrollView
              contentContainerStyle={[
                styles.sidebarDetail,
                { paddingBottom: insets.bottom + space.roomy },
              ]}
            >
              {detailHeader}
              <AreaDetail area={selected} now={now} colors={colors} />
            </ScrollView>
          ) : (
            <ScrollView
              contentContainerStyle={{
                paddingBottom: insets.bottom + space.roomy,
              }}
            >
              {ranked.length === 0 ? (
                <EmptyRanking hasDestination={destination !== null} colors={colors} />
              ) : (
                ranked
                  .slice(0, SIDEBAR_RESULTS)
                  .map((option) => (
                    <AreaRow
                      key={option.area.id}
                      option={option}
                      best={best}
                      colors={colors}
                      selected={option.area.id === selectedAreaId}
                      onSelect={handleSelect}
                    />
                  ))
              )}
            </ScrollView>
          )}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The open/closed caret on a disclosure control.
 *
 * A glyph rather than an icon font: nothing to download, nothing to fail, and
 * it scales with Dynamic Type like the label beside it. Hidden from assistive
 * tech because the control's own accessibilityState already says `expanded`,
 * and "black down-pointing triangle" is not an improvement on that.
 */
function Caret({ open, color }: { open: boolean; color: string }) {
  return (
    <Text
      // Deliberately larger than the label beside it. At body size the caret
      // was technically present and practically invisible, which is the same
      // as not having a disclosure affordance at all.
      style={[type.title, { color }]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {open ? '\u25B4' : '\u25BE'}
    </Text>
  );
}

/**
 * How many options the sidebar shows before deferring to the list tab.
 *
 * Twelve is past the point where anyone keeps reading, and the list screen
 * exists to show all of them. Rendering 262 rows next to a live map would spend
 * the frame budget on rows nobody scrolls to.
 */
const SIDEBAR_RESULTS = 12;

/**
 * The single best option, in the compact sheet.
 *
 * Not the whole list: the list tab is one tap away and is the accessible
 * equivalent of this screen. What the map cannot answer on its own is "of
 * everything I can see, which one should I actually drive to", and that is one
 * row.
 */
function BestOption({
  best,
  ranked,
  colors,
  hasDestination,
  isLive,
  onSelect,
  selectedAreaId,
}: {
  best: ReturnType<typeof rank>[number] | null;
  ranked: ReturnType<typeof rank>;
  colors: ReturnType<typeof colorsFor>;
  hasDestination: boolean;
  /** False while previewing another time, so the heading stops saying "now". */
  isLive: boolean;
  onSelect: (id: string | null) => void;
  selectedAreaId: string | null;
}) {
  if (!hasDestination || ranked.length === 0 || !best) {
    return <EmptyRanking hasDestination={hasDestination} colors={colors} />;
  }

  return (
    <View style={[styles.bestBlock, { borderColor: colors.border }]}>
      <Text style={[type.label, { color: colors.textMuted }]}>
        {isLive ? 'BEST RIGHT NOW' : 'BEST AT THAT TIME'}
      </Text>
      <AreaRow
        option={best}
        best={null}
        colors={colors}
        selected={best.area.id === selectedAreaId}
        onSelect={onSelect}
      />
      <Text style={[type.caption, { color: colors.textMuted }]}>
        {ranked.length - 1} more on the List tab.
      </Text>
    </View>
  );
}

/**
 * What to say when the ranking has nothing in it.
 *
 * Two different situations, and they need different sentences because the
 * user's next action is different: one is "tell me where you're going", the
 * other is "there is genuinely nothing open to you". An app that says "No
 * results" to both leaves the second user thinking they broke it.
 */
function EmptyRanking({
  hasDestination,
  colors,
}: {
  hasDestination: boolean;
  colors: ReturnType<typeof colorsFor>;
}) {
  return (
    <View style={styles.empty}>
      <Text style={[type.bodyStrong, { color: colors.text }]}>
        {hasDestination ? 'Nothing open to you nearby' : 'Pick where you’re going'}
      </Text>
      <Text style={[type.body, { color: colors.textMuted }]}>
        {hasDestination
          ? 'Every area near here is either enforced right now or needs a permit you can’t buy. The Learn tab has what to do instead — the buses are free.'
          : 'Search a building and UMichFreePark will rank every area by what it costs you to park there and how far you’d walk.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  /** Map above, sheet below. The sidebar, when there is one, sits beside both. */
  mapColumn: { flex: 1 },
  mapArea: { flex: 1 },
  /*
   * The count yields space to the key, never the other way round.
   *
   * At the largest Dynamic Type settings the free-count card grew until the key
   * beside it was a sliver with every label clipped — the map's legend rendered
   * unreadable for exactly the users most likely to need it. Letting the row
   * wrap instead pushed the key onto a second line and under the sheet, which
   * was worse: gone rather than cramped.
   *
   * So the row never wraps and the shrinking is one-directional. The key keeps
   * its intrinsic width; the card takes what is left and wraps its own text
   * inside it. The card can afford that — its full sentence is on its
   * accessibility label either way — and the key cannot, because a clipped key
   * teaches nothing.
   */
  overlay: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.snug,
  },
  statusBar: {
    flexShrink: 1,
    paddingHorizontal: space.comfortable,
    paddingVertical: space.snug,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  // flexShrink 0 is the load-bearing part: it is what makes the count give way
  // rather than the key.
  legendSlot: { flexShrink: 0, marginLeft: 'auto', alignItems: 'flex-end' },
  errorBanner: {
    position: 'absolute',
    left: space.comfortable,
    right: space.comfortable,
    padding: space.base,
    gap: space.tight,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  /*
   * The sheet takes the height it needs, up to a cap.
   *
   * The cap is a percentage of the screen rather than a fixed number of points
   * because the content that has to fit inside it scales with Dynamic Type:
   * at the largest accessibility size the trip controls alone are taller than
   * any constant worth choosing, and the ScrollView inside handles the rest.
   * 54% keeps at least the top of the map, so the sheet never becomes the whole
   * screen with a strip of map above it.
   */
  /*
   * Collapsed, the sheet takes only the height its content needs. The cap
   * applies to the expanded state, where the controls scale with Dynamic Type
   * and would otherwise grow without limit — a percentage rather than a
   * constant for exactly that reason, with the ScrollView handling the rest.
   */
  previewSlot: { paddingHorizontal: space.comfortable, paddingTop: space.snug },
  sheetWrap: { maxHeight: '54%' },
  sheet: {
    flexShrink: 1,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sheetContent: {
    padding: space.comfortable,
    gap: space.base,
  },
  sheetToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.base,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: space.base,
    paddingVertical: space.snug,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  sheetSummary: { flex: 1, gap: space.hair },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.snug,
  },
  panelTitle: { flex: 1 },
  close: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebar: {
    width: SIDEBAR_WIDTH,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  sidebarControls: {
    paddingHorizontal: space.comfortable,
    paddingBottom: space.base,
    zIndex: 10,
  },
  sidebarDetail: { padding: space.comfortable, gap: space.base },
  bestBlock: {
    gap: space.tight,
    paddingTop: space.base,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  empty: {
    paddingVertical: space.roomy,
    paddingHorizontal: space.comfortable,
    gap: space.snug,
  },
});
