/**
 * iOS renderer: react-native-maps over Apple Maps.
 *
 * Its only job is to translate the result of `encodeArea` into Apple Maps
 * primitives. It decides no colours, no widths and no dash patterns — if you
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

import { DEFAULT_PROFILE, eligibilityFor, statusAt } from '../../engine';
import { colorsFor } from '../../theme/colors';
import { radius, space, tabularNumbers, type } from '../../theme';
import { encodeArea } from './encoding';
import { DEFAULT_CAMERA, MAX_VISIBLE_PILLS, PILL_MIN_ZOOM, type MapProps } from './types';

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
  initialCamera = DEFAULT_CAMERA,
  showsUserLocation = false,
  reduceMotion = false,
  onReady,
  onError,
}: MapProps) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = colorsFor(scheme);

  const [zoom, setZoom] = useState(initialCamera.zoom);
  // Markers must rasterize once to appear, then stop. Flipping this off after
  // the first paint is what keeps the clock tick cheap.
  const [tracksChanges, setTracksChanges] = useState(true);
  const readyFired = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setTracksChanges(false), 500);
    return () => clearTimeout(timer);
  }, []);

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
        const status = statusAt(mapArea.area.authority, mapArea.area.schedule, at);
        const eligibility = eligibilityFor(mapArea.area, DEFAULT_PROFILE, status);
        return { mapArea, encoding: encodeArea(mapArea.area, status, eligibility, scheme) };
      }),
    [areas, at, scheme]
  );

  const visiblePills = useMemo(() => {
    if (zoom < PILL_MIN_ZOOM) return [];
    // Free areas first: at city scale the useful signal is where you can stop
    // paying, so that is what survives the cap.
    return [...encoded]
      .sort((a, b) => Number(b.encoding.borderStyle === 'solid') - Number(a.encoding.borderStyle === 'solid'))
      .slice(0, MAX_VISIBLE_PILLS);
  }, [encoded, zoom]);

  const handleRegionChange = useCallback((region: Region) => {
    setZoom(deltaToZoom(region.latitudeDelta));
  }, []);

  const handleReady = useCallback(() => {
    if (readyFired.current) return;
    readyFired.current = true;
    onReady?.();
  }, [onReady]);

  return (
    <MapView
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
            <Text style={[styles.pillText, tabularNumbers, { color: encoding.labelColor }]}>
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
 * Apple Maps wants the alpha baked into the fill colour rather than a separate
 * opacity prop, so encoding.ts's (colour, opacity) pair is combined here. This
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
