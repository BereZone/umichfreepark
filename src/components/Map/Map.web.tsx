/**
 * Web renderer: maplibre-gl over OpenFreeMap tiles.
 *
 * Same job as Map.native.tsx — translate `encodeArea`'s result into this
 * library's primitives, and decide nothing about appearance itself.
 *
 * THE PERFORMANCE TRAP HERE IS DIFFERENT
 *
 * On iOS the cost is rasterizing markers. On web it is rebuilding sources.
 * Everything lives in ONE GeoJSON source styled by data-driven expressions,
 * not one layer per area — 73 layers would each get their own draw call and
 * their own style recalculation. On a clock tick we call `setData` with new
 * feature properties; we never recreate the source or the layers, because that
 * throws away the tile cache and flashes the map.
 */

import { useEffect, useRef, useState } from 'react';
// maplibre-gl v6 has no default export; import the namespace.
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { DEFAULT_PROFILE, eligibilityFor, statusAt } from '../../engine';
import { colorsFor } from '../../theme/colors';
import { encodeArea } from './encoding';
import { DEFAULT_CAMERA, MAX_VISIBLE_PILLS, PILL_MIN_ZOOM, type MapProps } from './types';

/** Free, keyless, and swappable for Protomaps behind this one constant. */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

const SOURCE_ID = 'curb-areas';
const FILL_LAYER = 'curb-areas-fill';
const LINE_LAYER = 'curb-areas-line';
const PILL_LAYER = 'curb-areas-pill';

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
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const destinationMarker = useRef<maplibregl.Marker | null>(null);
  const [loaded, setLoaded] = useState(false);

  const scheme =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';

  // --- create the map exactly once -----------------------------------------
  useEffect(() => {
    if (!container.current || map.current) return;

    const instance = new maplibregl.Map({
      container: container.current,
      style: STYLE_URL,
      center: [initialCamera.center.lon, initialCamera.center.lat],
      zoom: initialCamera.zoom,
      attributionControl: { compact: true },
    });
    map.current = instance;

    instance.on('error', (event: { error?: Error }) => {
      // A tile failure must not leave a blank rectangle with no explanation —
      // the caller surfaces a message pointing at the list view instead.
      onError?.(event.error ?? new Error('Map failed to load'));
    });

    instance.on('load', () => {
      instance.addSource(SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Fill and outline are separate layers over ONE source. Colours and
      // widths arrive as feature properties, set by encoding.ts.
      instance.addLayer({
        id: FILL_LAYER,
        type: 'fill',
        source: SOURCE_ID,
        paint: {
          'fill-color': ['get', 'fillColor'],
          'fill-opacity': ['get', 'fillOpacity'],
        },
      });

      instance.addLayer({
        id: LINE_LAYER,
        type: 'line',
        source: SOURCE_ID,
        paint: {
          'line-color': ['get', 'borderColor'],
          'line-width': ['get', 'borderWidth'],
        },
      });

      instance.addLayer({
        id: PILL_LAYER,
        type: 'symbol',
        source: SOURCE_ID,
        // Same threshold the native renderer uses, so both declutter together.
        minzoom: PILL_MIN_ZOOM,
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 12,
          'text-font': ['Noto Sans Bold'],
          'text-allow-overlap': false,
          'symbol-sort-key': ['get', 'sortKey'],
        },
        paint: {
          'text-color': ['get', 'labelColor'],
          'text-halo-color': ['get', 'labelBackground'],
          'text-halo-width': 1.5,
        },
      });

      instance.on('click', FILL_LAYER, (event: MapMouseEvent & { features?: { properties?: Record<string, unknown> }[] }) => {
        const id = event.features?.[0]?.properties?.areaId;
        if (typeof id === 'string') onSelectArea(id);
      });
      instance.on('click', (event: MapMouseEvent) => {
        const hits = instance.queryRenderedFeatures(event.point, { layers: [FILL_LAYER] });
        if (hits.length === 0) onSelectArea(null);
      });
      instance.on('mouseenter', FILL_LAYER, () => {
        instance.getCanvas().style.cursor = 'pointer';
      });
      instance.on('mouseleave', FILL_LAYER, () => {
        instance.getCanvas().style.cursor = '';
      });

      setLoaded(true);
      onReady?.();
    });

    return () => {
      instance.remove();
      map.current = null;
    };
    // Deliberately created once. Camera and callbacks are read from the first
    // render on purpose; re-creating the map would flash and drop tile cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- push new data on every tick, without touching the layers ------------
  useEffect(() => {
    const instance = map.current;
    if (!instance || !loaded) return;
    const source = instance.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;

    const features = areas.map((mapArea, index) => {
      const status = statusAt(mapArea.area.authority, mapArea.area.schedule, at);
      const eligibility = eligibilityFor(mapArea.area, DEFAULT_PROFILE, status);
      const encoding = encodeArea(mapArea.area, status, eligibility, scheme);
      const selected = mapArea.area.id === selectedAreaId;

      return {
        type: 'Feature' as const,
        id: index,
        geometry: { type: 'Polygon' as const, coordinates: mapArea.rings },
        properties: {
          areaId: mapArea.area.id,
          fillColor: encoding.fillColor,
          fillOpacity: encoding.fillOpacity,
          borderColor: encoding.borderColor,
          borderWidth: selected ? encoding.borderWidth + 2 : encoding.borderWidth,
          label: encoding.label,
          labelColor: encoding.labelColor,
          labelBackground: encoding.labelBackground,
          // Free areas win the label-collision fight, and the cap is applied by
          // MapLibre's own overlap avoidance plus this ordering.
          sortKey: encoding.borderStyle === 'solid' ? 0 : 1,
        },
      };
    });

    source.setData({ type: 'FeatureCollection', features });

    // Dash pattern is a layer property rather than a per-feature one in
    // MapLibre, so free/paid dashing is applied as a data-driven expression on
    // the line layer. The values still come from encoding.ts.
    const dashed = areas.length > 0;
    if (dashed) {
      instance.setPaintProperty(LINE_LAYER, 'line-dasharray', [
        'case',
        ['==', ['get', 'sortKey'], 0],
        ['literal', [1, 0]], // solid
        ['literal', [4, 3]], // dashed
      ] as never);
    }
  }, [areas, at, selectedAreaId, scheme, loaded]);

  // --- destination pin ------------------------------------------------------
  useEffect(() => {
    const instance = map.current;
    if (!instance || !loaded) return;
    destinationMarker.current?.remove();
    destinationMarker.current = null;
    if (!destination) return;
    destinationMarker.current = new maplibregl.Marker({ color: colorsFor(scheme).focus })
      .setLngLat([destination.lon, destination.lat])
      .addTo(instance);
  }, [destination, loaded, scheme]);

  // --- user location --------------------------------------------------------
  useEffect(() => {
    const instance = map.current;
    if (!instance || !loaded || !showsUserLocation) return;
    // GeolocateControl asks the browser for permission only when pressed, so
    // adding it never triggers a prompt as a side effect.
    const control = new maplibregl.GeolocateControl({ trackUserLocation: false });
    instance.addControl(control, 'bottom-right');
    return () => {
      instance.removeControl(control);
    };
  }, [showsUserLocation, loaded]);

  return (
    <div
      ref={container}
      style={{ position: 'absolute', inset: 0 }}
      role="img"
      aria-label="Map of Ann Arbor parking. The list view has the same options in a readable form."
    />
  );
}

/** Referenced so the shared cap is not silently web-only. */
export const WEB_MAX_VISIBLE_PILLS = MAX_VISIBLE_PILLS;
