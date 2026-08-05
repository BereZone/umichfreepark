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

import { DEFAULT_PROFILE, eligibilityFor, statusOf } from '../../engine';
import { colorsFor } from '../../theme/colors';
import { focusFor, focusOn } from './camera';
import { encodeArea } from './encoding';
import { selectPills } from './pills';
import { DEFAULT_CAMERA, PILL_MIN_ZOOM, type MapProps } from './types';

/** Free, keyless, and swappable for Protomaps behind this one constant. */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

/**
 * Where scripts/sync-maplibre-worker.mjs puts the worker. Absolute, because a
 * relative URL would resolve against the current route and break on /list.
 */
const WORKER_PUBLIC_PATH = '/maplibre/maplibre-gl-worker.mjs';

/**
 * Tell MapLibre where its worker is, because it cannot work that out here.
 *
 * MapLibre derives the worker URL from `import.meta.url`, expecting to be
 * served as a module next to its own worker file. Metro bundles it into one
 * script, so that check fails and MapLibre falls back to `new Worker('')` —
 * which the browser resolves against the document and loads the HTML page as a
 * module script. The worker dies immediately and nothing surfaces the error.
 *
 * The symptom is a map that looks alive and draws nothing: style, sprite and
 * TileJSON are fetched on the main thread, so the network log is clean, while
 * tiles, glyphs and every one of our polygons are parsed in the worker that
 * never started. A blank rectangle in the style's background colour.
 *
 * Module scope, so it is set before any Map is constructed. The worker pool is
 * created lazily on the first map, but only once — setting this from an effect
 * would be a race with our own first render.
 */
maplibregl.setWorkerUrl(WORKER_PUBLIC_PATH);

const SOURCE_ID = 'umichfreepark-areas';
const FILL_LAYER = 'umichfreepark-areas-fill';
const LINE_LAYER = 'umichfreepark-areas-line';
const PILL_LAYER = 'umichfreepark-areas-pill';

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
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const destinationMarker = useRef<maplibregl.Marker | null>(null);
  /** False until the first destination has been seen and deliberately ignored. */
  const followedDestination = useRef(false);
  const [loaded, setLoaded] = useState(false);
  /**
   * Bumped on every camera settle, purely to re-run the data effect.
   *
   * Pill selection now depends on the viewport, so panning has to recompute it.
   * A counter rather than the camera itself: the effect reads the live bounds
   * off the map, and storing a camera object here would mean two copies of the
   * same truth that can disagree. `moveend` rather than `move`, so a drag costs
   * one recompute instead of one per frame.
   */
  const [cameraSettled, setCameraSettled] = useState(0);

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
        // Set by the shared selector in pills.ts. Filtering the layer rather
        // than emptying `text-field` keeps every polygon's outline intact.
        filter: ['==', ['get', 'pill'], true],
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
      instance.on('moveend', () => setCameraSettled((n) => n + 1));
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

    const encoded = areas.map((mapArea) => {
      const status = statusOf(mapArea.area, at);
      const eligibility = eligibilityFor(mapArea.area, profile, status);
      return {
        mapArea,
        labelPoint: mapArea.labelPoint,
        free: !status.paid,
        encoding: encodeArea(mapArea.area, status, eligibility, scheme),
      };
    });

    /**
     * Which areas carry a pill comes from pills.ts, the same function the
     * native renderer calls.
     *
     * MapLibre's own collision detection would happily do the decluttering, and
     * it does it better than any hand-rolled rule — but it is not available on
     * Apple Maps, so leaving the decision to it meant the two platforms showed
     * different label sets from identical data. Running the shared selector
     * first and letting collision resolve what remains keeps one design
     * decision in one place, which is the rule this directory is built on.
     */
    const bounds = instance.getBounds();
    const withPill = new Set(
      selectPills(encoded, {
        zoom: instance.getZoom(),
        bounds: {
          south: bounds.getSouth(),
          west: bounds.getWest(),
          north: bounds.getNorth(),
          east: bounds.getEast(),
        },
      }).map((item) => item.mapArea.area.id)
    );

    const features = encoded.map(({ mapArea, encoding, free }, index) => {
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
          // Every area keeps its label text; the pill LAYER is filtered on
          // `pill` instead. Blanking the text here would also blank it for the
          // polygon, and the outline must be drawn either way.
          label: encoding.label,
          labelColor: encoding.labelColor,
          labelBackground: encoding.labelBackground,
          pill: withPill.has(mapArea.area.id),
          // Free areas win the remaining collisions, matching the order
          // selectPills applied.
          sortKey: free ? 0 : 1,
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
  }, [areas, at, selectedAreaId, scheme, loaded, cameraSettled, profile]);

  // --- move to a selection made somewhere else -----------------------------
  useEffect(() => {
    const instance = map.current;
    if (!instance || !loaded || !selectedAreaId) return;
    const target = areas.find((mapArea) => mapArea.area.id === selectedAreaId);
    if (!target) return;

    const bounds = instance.getBounds();
    // Whether to move, and where to, is decided in camera.ts and shared with
    // the native renderer. This file only knows how to perform the move.
    const focus = focusFor(target.labelPoint, {
      zoom: instance.getZoom(),
      bounds: {
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast(),
      },
    });
    if (!focus) return;

    instance.easeTo({
      center: [focus.center.lon, focus.center.lat],
      zoom: focus.zoom,
      duration: reduceMotion ? 0 : 500,
    });
    // `areas` is excluded on purpose: it is a new array on every tick, and
    // including it would re-run this on the clock and fight the user's own pan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAreaId, loaded, reduceMotion]);

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

  // --- follow a newly chosen destination ------------------------------------
  useEffect(() => {
    const instance = map.current;
    if (!instance || !loaded || !destination) return;

    /*
     * The destination the app started with does not move the camera.
     *
     * It is restored from storage before the first paint, so treating it as a
     * change would drag the map off its opening frame every launch — and the
     * user did nothing to ask for that. Only a destination they pick during the
     * session is a request to look somewhere.
     */
    if (!followedDestination.current) {
      followedDestination.current = true;
      return;
    }

    const focus = focusOn(destination, instance.getZoom());
    instance.easeTo({
      center: [focus.center.lon, focus.center.lat],
      zoom: focus.zoom,
      duration: reduceMotion ? 0 : 500,
    });
  }, [destination, loaded, reduceMotion]);

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
