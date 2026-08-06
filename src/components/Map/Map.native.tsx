/**
 * iOS renderer: react-native-maps over Apple Maps.
 *
 * Its only job is to translate the result of `encodeArea` into Apple Maps
 * primitives. It decides no colors, no widths and no dash patterns — if you
 * find yourself reaching for a hex value in this file, the decision belongs in
 * encoding.ts.
 *
 * THE PERFORMANCE TRAP
 *
 * A `Marker` with a custom child is rasterized by react-native-maps on every
 * re-render unless told otherwise. This screen re-renders on a clock tick, and
 * forty rasterizing markers turn that into a slideshow. Three mitigations,
 * all deliberate: `tracksViewChanges={false}` once painted, a zoom threshold
 * and a hard cap on visible pills (both shared with web via types.ts), and
 * memoizing each pill on its *status*, not on the current second.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import MapView, { Marker, Polygon, PROVIDER_DEFAULT, type Region } from 'react-native-maps';

import { DEFAULT_PROFILE, eligibilityFor, statusOf } from '../../engine';
import { colorsFor } from '../../theme/colors';
import { MAX_MAP_TEXT_SCALE, radius, space, tabularNumbers, type } from '../../theme';
import { focusFor, focusOn } from './camera';
import { encodeArea } from './encoding';
import { selectPills, type Viewport } from './pills';
import { DEFAULT_CAMERA, type MapProps } from './types';

/**
 * Apple Maps takes a latitude delta rather than a zoom level. This is the
 * standard conversion at the equator; it is approximate away from it, which is
 * fine because it is only used to decide when to declutter.
 */
const zoomToDelta = (zoom: number) => 360 / 2 ** zoom;
const deltaToZoom = (delta: number) => Math.log2(360 / delta);

export default function Map({
  areas,
  at,
  selectedAreaId,
  onSelectArea,
  destination,
  profile = DEFAULT_PROFILE,
  initialCamera = DEFAULT_CAMERA,
  showsUserLocation = false,
  reduceMotion = false,
  onReady,
  onError,
}: MapProps) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = colorsFor(scheme);

  /**
   * The camera, as the pill selector needs it. Bounds start null because Apple
   * Maps only reports a region after the first camera event; `selectPills`
   * reads null as "do not cull", so the first paint shows labels rather than
   * none.
   */
  const [viewport, setViewport] = useState<Viewport>({
    zoom: initialCamera.zoom,
    bounds: null,
  });
  // Markers must rasterize once to appear, then stop. Flipping this off after
  // the first paint is what keeps the clock tick cheap.
  const [tracksChanges, setTracksChanges] = useState(true);
  const readyFired = useRef(false);
  const mapRef = useRef<MapView | null>(null);
  /** False until the first destination has been seen and deliberately ignored. */
  const followedDestination = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setTracksChanges(false), 500);
    return () => clearTimeout(timer);
  }, []);

  /**
   * Move to a selection the user cannot see.
   *
   * The predicate lives in camera.ts so this and the web renderer agree on when
   * to move; only the animation call below is Apple-specific. `viewport` is
   * read but not depended on — including it would re-fire this every time the
   * user's own pan settled, which is a map that will not stay where it is put.
   */
  useEffect(() => {
    if (!selectedAreaId) return;
    const target = areas.find((mapArea) => mapArea.area.id === selectedAreaId);
    if (!target) return;
    const focus = focusFor(target.labelPoint, viewport);
    if (!focus) return;

    const delta = zoomToDelta(focus.zoom);
    mapRef.current?.animateToRegion(
      {
        latitude: focus.center.lat,
        longitude: focus.center.lon,
        latitudeDelta: delta,
        longitudeDelta: delta,
      },
      reduceMotion ? 0 : 500
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAreaId, reduceMotion]);

  /**
   * Follow a newly chosen destination.
   *
   * The destination the app started with does not move the camera: it is
   * restored from storage before the first paint, so treating it as a change
   * would drag the map off its opening frame every launch for something the
   * user did not ask for. Only a destination picked during the session counts.
   */
  useEffect(() => {
    if (!destination) return;
    if (!followedDestination.current) {
      followedDestination.current = true;
      return;
    }
    const focus = focusOn(destination, viewport.zoom);
    const delta = zoomToDelta(focus.zoom);
    mapRef.current?.animateToRegion(
      {
        latitude: focus.center.lat,
        longitude: focus.center.lon,
        latitudeDelta: delta,
        longitudeDelta: delta,
      },
      reduceMotion ? 0 : 500
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, reduceMotion]);

  const initialRegion: Region = useMemo(
    () => ({
      latitude: initialCamera.center.lat,
      longitude: initialCamera.center.lon,
      latitudeDelta: zoomToDelta(initialCamera.zoom),
      longitudeDelta: zoomToDelta(initialCamera.zoom),
    }),
    [initialCamera]
  );

  /**
   * Encoding is keyed on `at`, but only the derived STATUS actually changes
   * appearance. Recomputing once per tick for all areas is cheap; re-rendering
   * markers is not, which is what the pill cap addresses.
   */
  const encoded = useMemo(
    () =>
      areas.map((mapArea) => {
        const status = statusOf(mapArea.area, at);
        const eligibility = eligibilityFor(mapArea.area, profile, status);
        return { mapArea, status, encoding: encodeArea(mapArea.area, status, eligibility, scheme) };
      }),
    [areas, at, scheme, profile]
  );

  // Which areas get a pill is decided in pills.ts, shared with the web
  // renderer. This file only supplies the camera and draws the result.
  const visiblePills = useMemo(
    () =>
      selectPills(
        encoded.map((item) => ({
          ...item,
          labelPoint: item.mapArea.labelPoint,
          free: !item.status.paid,
          showsPill: item.encoding.showsPill,
        })),
        viewport
      ),
    [encoded, viewport]
  );

  const handleRegionChange = useCallback((region: Region) => {
    // Apple reports the region as a centre plus a span; the selector wants
    // edges, so convert here rather than teaching pills.ts about Apple's shape.
    setViewport({
      zoom: deltaToZoom(region.latitudeDelta),
      bounds: {
        south: region.latitude - region.latitudeDelta / 2,
        north: region.latitude + region.latitudeDelta / 2,
        west: region.longitude - region.longitudeDelta / 2,
        east: region.longitude + region.longitudeDelta / 2,
      },
    });
  }, []);

  const handleReady = useCallback(() => {
    if (readyFired.current) return;
    readyFired.current = true;
    onReady?.();
  }, [onReady]);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      provider={PROVIDER_DEFAULT}
      initialRegion={initialRegion}
      onRegionChangeComplete={handleRegionChange}
      onMapReady={handleReady}
      onMapLoaded={handleReady}
      showsUserLocation={showsUserLocation}
      showsMyLocationButton={false}
      showsPointsOfInterests={false}
      toolbarEnabled={false}
      // Tapping bare map is how you deselect; without this the panel can only
      // be dismissed by its own control, which is a dead end on a full-bleed map.
      onPress={() => onSelectArea(null)}
      accessibilityRole="image"
      accessibilityLabel="Map of Ann Arbor parking. The list view has the same options in a readable form."
    >
      {encoded.map(({ mapArea, encoding }) => {
        const selected = mapArea.area.id === selectedAreaId;
        const [exterior, ...holes] = mapArea.rings;
        return (
          <Polygon
            key={mapArea.area.id}
            coordinates={exterior.map(([lon, lat]) => ({ latitude: lat, longitude: lon }))}
            holes={holes.map((hole) =>
              hole.map(([lon, lat]) => ({ latitude: lat, longitude: lon }))
            )}
            fillColor={withOpacity(encoding.fillColor, encoding.fillOpacity)}
            strokeColor={encoding.borderColor}
            strokeWidth={selected ? encoding.borderWidth + 2 : encoding.borderWidth}
            // Apple takes the dash pattern directly; MapLibre takes the same
            // array as a dasharray. Both come from encoding.ts.
            lineDashPattern={encoding.dashPattern ?? undefined}
            tappable
            onPress={() => onSelectArea(mapArea.area.id)}
          />
        );
      })}

      {visiblePills.map(({ mapArea, encoding }) => (
        <Marker
          key={`pill-${mapArea.area.id}`}
          coordinate={{ latitude: mapArea.labelPoint.lat, longitude: mapArea.labelPoint.lon }}
          // The single most important perf flag on this screen.
          tracksViewChanges={tracksChanges}
          onPress={() => onSelectArea(mapArea.area.id)}
          accessibilityLabel={encoding.accessibilityLabel}
        >
          <View
            style={[
              styles.pill,
              {
                backgroundColor: encoding.labelBackground,
                borderColor: encoding.borderColor,
                opacity: encoding.muted ? 0.6 : 1,
              },
            ]}
          >
            <Text
              style={[styles.pillText, tabularNumbers, { color: encoding.labelColor }]}
              // Bounded, not clamped. A pill is anchored to a point and cannot
              // reflow, so unbounded growth buries the map under its own labels.
              maxFontSizeMultiplier={MAX_MAP_TEXT_SCALE}
            >
              {encoding.label}
            </Text>
          </View>
        </Marker>
      ))}

      {destination ? (
        <Marker
          coordinate={{ latitude: destination.lat, longitude: destination.lon }}
          tracksViewChanges={false}
          accessibilityLabel="Your destination"
          pinColor={colors.focus}
        />
      ) : null}
    </MapView>
  );
}

/**
 * Apple Maps wants the alpha baked into the fill color rather than a separate
 * opacity prop, so encoding.ts's (color, opacity) pair is combined here. This
 * is translation, not a design decision.
 */
function withOpacity(hex: string, opacity: number): string {
  const alpha = Math.round(Math.min(Math.max(opacity, 0), 1) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${alpha}`;
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: space.snug,
    paddingVertical: space.tight,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  pillText: {
    ...type.label,
  },
});
