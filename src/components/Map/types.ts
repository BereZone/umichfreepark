/**
 * The contract both map renderers satisfy.
 *
 * `Map.native.tsx` (react-native-maps -> Apple Maps) and `Map.web.tsx`
 * (maplibre-gl -> OpenFreeMap) are resolved by Metro's platform suffixes.
 * Callers import from `./index` and never learn which one they got.
 *
 * NEITHER RENDERER MAY ADD A PROP TO THIS FILE ALONE. A prop that only one
 * platform honours is a divergence with a type signature — the thing this
 * split exists to prevent. If one platform cannot support something, that is a
 * conversation about the design, not a reason for an optional prop.
 *
 * Appearance is not in here on purpose: it comes from encoding.ts, which both
 * renderers call. This file is about behaviour and data.
 */

import type { LatLng, Ring } from '../../geo/polygons';
import type { Profile, ResolvedArea } from '../../engine';

/** An area paired with the geometry needed to draw it. */
export interface MapArea {
  area: ResolvedArea;
  /** Ring 0 is the exterior; the rest are holes. Winding already normalized. */
  rings: Ring[];
  /** Where the price pill goes. Guaranteed inside the polygon. */
  labelPoint: LatLng;
}

export interface MapCamera {
  center: LatLng;
  /** Web zoom levels. The native renderer converts to a latitude delta. */
  zoom: number;
}

export interface MapProps {
  areas: readonly MapArea[];

  /** The instant to render. Drives free/paid via the engine, and the scrubber. */
  at: Date;

  /** Currently selected area id, or null. Controlled by the caller. */
  selectedAreaId: string | null;
  onSelectArea: (areaId: string | null) => void;

  /** Destination pin, when the user has chosen a building. */
  destination?: LatLng | null;

  /**
   * Who is looking. Decides which areas render as closed to you.
   *
   * Both renderers used to hardcode `DEFAULT_PROFILE`, which was harmless only
   * while nothing could change it. Once the profile is settable, a hardcoded
   * one means a junior with a Blue permit sees a greyed-out lot on the map and
   * an available one in the list, from the same engine call with different
   * arguments — the map contradicting the list about the same lot at the same
   * second.
   */
  profile?: Profile;

  initialCamera?: MapCamera;

  /**
   * Show the device location dot. The caller is responsible for having asked
   * permission first — neither renderer requests it, so a renderer can never
   * be the thing that triggers a permission prompt as a side effect.
   */
  showsUserLocation?: boolean;

  /**
   * Collapse animation to instant state changes.
   *
   * The 6pm sweep is the app's one orchestrated moment, and under reduce-motion
   * it must become an instant change rather than merely a faster one.
   */
  reduceMotion?: boolean;

  /** Called once the tiles and first paint are ready, for dismissing a skeleton. */
  onReady?: () => void;

  /**
   * Called when tiles fail. The map is not the accessible equivalent of the
   * data — the list view is — so a tile failure must surface as a message
   * pointing at the list, never as a blank rectangle.
   */
  onError?: (error: Error) => void;
}

/** Ann Arbor, framed on central campus and downtown together. */
export const DEFAULT_CAMERA: MapCamera = {
  center: { lat: 42.2793, lon: -83.7414 },
  zoom: 14.5,
};

/**
 * Below this zoom, price pills are hidden and only polygons draw.
 *
 * At city scale forty overlapping pills turn the map into soup, and none of
 * them is readable anyway. Both renderers must use this same threshold or the
 * platforms will declutter at different moments.
 */
export const PILL_MIN_ZOOM = 14;

/**
 * Most pills to draw at once, counted AFTER culling to the visible map.
 *
 * On iOS every custom marker is rasterized on re-render by default, so an
 * uncapped count drops frames on a clock tick. The cap is shared so that both
 * platforms show the same set rather than iOS quietly showing fewer.
 *
 * It is a budget per screen, not per dataset — `pills.ts` drops off-screen
 * areas before applying it. That distinction is the whole reason a lot you have
 * zoomed in on now gets a label: the budget is no longer spent on lots a mile
 * away. Applied to the dataset instead, this number would hide labels on 137 of
 * the 161 areas UMichFreePark can draw, at every zoom, forever.
 */
export const MAX_VISIBLE_PILLS = 48;
