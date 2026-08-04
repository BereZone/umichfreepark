/**
 * The map screen.
 *
 * Full-bleed map with a status bar on top and a detail panel on selection. The
 * screen owns state and layout; it owns no parking logic and no appearance
 * decisions — those live in the engine and encoding.ts respectively.
 */

import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MAP_AREAS, Map, mapAreaById } from '../components/Map';
import {
  DEFAULT_PROFILE,
  areaById,
  eligibilityFor,
  gameDayWarning,
  nextTransition,
  statusAt,
} from '../engine';
import * as Haptics from 'expo-haptics';

import { useReduceMotion } from '../hooks/use-accessibility';
import { formatCountdown, useNow } from '../hooks/use-now';
import { MIN_TOUCH_TARGET, radius, space, tabularNumbers, type } from '../theme';
import { colorsFor } from '../theme/colors';

export default function MapScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = colorsFor(scheme);
  const insets = useSafeAreaInsets();
  const now = useNow();
  const reduceMotion = useReduceMotion();

  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [tileError, setTileError] = useState<Error | null>(null);

  const selected = selectedAreaId ? areaById.get(selectedAreaId) : null;

  /**
   * Recomputed each tick, which is cheap: statusAt is a handful of comparisons
   * across 73 areas. The expensive thing on a tick is re-rendering markers,
   * which the renderers handle themselves.
   */
  const summary = useMemo(() => {
    let free = 0;
    for (const { area } of MAP_AREAS) {
      if (!statusAt(area.authority, area.schedule, now).paid) free += 1;
    }
    return { free, total: MAP_AREAS.length };
  }, [now]);

  const detail = useMemo(() => {
    if (!selected) return null;
    const status = statusAt(selected.authority, selected.schedule, now);
    const next = nextTransition(selected.authority, selected.schedule, now);
    return {
      status,
      eligibility: eligibilityFor(selected, DEFAULT_PROFILE, status),
      next,
      countdown: next ? formatCountdown((next.at.getTime() - now.getTime()) / 1000) : null,
      gameDay: gameDayWarning(selected, now),
      geometry: mapAreaById.get(selected.id) ?? null,
    };
  }, [selected, now]);

  const handleSelect = useCallback((id: string | null) => {
    setSelectedAreaId(id);
    // A light tap confirms the tap landed on a polygon, which matters on a
    // full-bleed map where the panel animating in is the only other feedback.
    // Selection only — firing on deselect would make dismissing feel like an error.
    if (id !== null) {
      Haptics.selectionAsync().catch(() => {
        // Haptics are unavailable on web and on some devices. Never a failure.
      });
    }
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Map
        areas={MAP_AREAS}
        at={now}
        selectedAreaId={selectedAreaId}
        onSelectArea={handleSelect}
        reduceMotion={reduceMotion}
        onError={setTileError}
      />

      <View
        style={[
          styles.statusBar,
          {
            top: insets.top + space.snug,
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
        accessibilityRole="header"
      >
        <Text style={[type.label, { color: colors.textMuted }]}>FREE RIGHT NOW</Text>
        <Text
          style={[type.title, tabularNumbers, { color: colors.text }]}
          // The count changes on its own, so a screen reader has to be told.
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${summary.free} of ${summary.total} parking areas are free right now`}
        >
          {summary.free}
          <Text style={[type.heading, { color: colors.textMuted }]}> / {summary.total}</Text>
        </Text>
      </View>

      {tileError ? (
        <View
          style={[
            styles.errorBanner,
            {
              top: insets.top + space.snug,
              backgroundColor: colors.surface,
              borderColor: colors.caution,
            },
          ]}
        >
          <Text style={[type.body, { color: colors.text }]}>
            The map couldn’t load. The list view has the same options and works offline.
          </Text>
        </View>
      ) : null}

      {detail && selected ? (
        <ScrollView
          style={[
            styles.panel,
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          ]}
          contentContainerStyle={[
            styles.panelContent,
            { paddingBottom: insets.bottom + space.comfortable },
          ]}
        >
          <View style={styles.panelHeader}>
            <Text style={[type.heading, { color: colors.text }]}>{selected.name}</Text>
            <Pressable
              onPress={() => handleSelect(null)}
              style={styles.close}
              accessibilityRole="button"
              accessibilityLabel="Close details"
              hitSlop={space.snug}
            >
              <Text style={[type.bodyStrong, { color: colors.textMuted }]}>Close</Text>
            </Pressable>
          </View>

          <Text
            style={[
              type.display,
              tabularNumbers,
              { color: detail.status.paid ? colors.paid : colors.free },
            ]}
            accessibilityLiveRegion="polite"
          >
            {detail.status.paid ? 'Paid' : 'Free'}
          </Text>

          {detail.countdown && detail.next ? (
            <Text style={[type.body, { color: colors.textMuted }]}>
              {detail.next.paid ? 'Paid in ' : 'Free in '}
              <Text style={[type.bodyStrong, tabularNumbers, { color: colors.text }]}>
                {detail.countdown}
              </Text>
            </Text>
          ) : (
            <Text style={[type.body, { color: colors.textMuted }]}>
              This one doesn’t change — it’s enforced around the clock.
            </Text>
          )}

          <Text style={[type.body, { color: colors.text }]}>{detail.status.reason}</Text>

          {!detail.eligibility.eligible ? (
            <View style={[styles.callout, { borderColor: colors.ineligible }]}>
              <Text style={[type.bodyStrong, { color: colors.ineligible }]}>
                You can’t park here right now
              </Text>
              <Text style={[type.body, { color: colors.text }]}>{detail.eligibility.reason}</Text>
            </View>
          ) : null}

          {!detail.status.certain ? (
            <View style={[styles.callout, { borderColor: colors.caution }]}>
              <Text style={[type.body, { color: colors.text }]}>
                We couldn’t confirm holiday closures for this one. Check the sign.
              </Text>
            </View>
          ) : null}

          {detail.gameDay ? (
            <View style={[styles.callout, { borderColor: colors.caution }]}>
              <Text style={[type.bodyStrong, { color: colors.text }]}>{detail.gameDay}</Text>
            </View>
          ) : null}

          {selected.note ? (
            <Text style={[type.caption, { color: colors.textMuted }]}>{selected.note}</Text>
          ) : null}

          <Text style={[type.caption, { color: colors.textMuted }]}>
            {selected.provenance.confidence === 'verified' ? 'Verified' : 'Community-reported'} ·
            checked {selected.provenance.lastVerified}
          </Text>
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  statusBar: {
    position: 'absolute',
    left: space.comfortable,
    paddingHorizontal: space.comfortable,
    paddingVertical: space.snug,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  errorBanner: {
    position: 'absolute',
    left: space.comfortable,
    right: space.comfortable,
    marginTop: space.section,
    padding: space.base,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '55%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  panelContent: {
    padding: space.comfortable,
    gap: space.snug,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  close: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  callout: {
    borderLeftWidth: 3,
    paddingLeft: space.base,
    paddingVertical: space.snug,
    gap: space.tight,
    borderRadius: radius.sm,
  },
});
