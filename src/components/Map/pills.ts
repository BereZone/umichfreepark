/**
 * Which areas get a price pill right now.
 *
 * This is decluttering, and it is a design decision, so it lives here rather
 * than inside either renderer — the same rule `encoding.ts` follows. It had
 * drifted exactly the way that rule exists to prevent: `Map.native.tsx` took
 * the 24 highest-priority pills and drew nothing else, while `Map.web.tsx`
 * handed every area to MapLibre and let label collision sort it out. On the
 * same screen at the same zoom, iOS showed 24 labels and the web showed sixty.
 * `types.ts` says the cap is shared "so that both platforms show the same set
 * rather than iOS quietly showing fewer", and iOS was quietly showing fewer.
 *
 * WHY CULL BEFORE CAPPING
 *
 * The old cap was a flat 24 applied to every area CURB can draw, at every zoom.
 * That is the wrong axis. What makes a map unreadable is labels per screen, not
 * labels per dataset, and the two only coincide when the whole dataset is on
 * screen. Zoomed to one block, a flat cap hides labels on lots you are looking
 * straight at while the budget is spent on lots a mile away.
 *
 * So: drop what is off screen, then rank, then cap. The cap now bites at city
 * scale, where it should, and lifts as you zoom in — which is what makes "every
 * lot has a label" true at any zoom where you could read one.
 */

import type { LatLng } from '../../geo/polygons';
import { MAX_VISIBLE_PILLS, PILL_MIN_ZOOM } from './types';

/** The visible map rectangle. Renderers report it; nothing here computes it. */
export interface Viewport {
  zoom: number;
  /**
   * Null when the renderer cannot report bounds yet — before first layout, or
   * on a platform that only exposes them after a camera event. Null means "do
   * not cull", which errs toward showing labels rather than hiding them.
   */
  bounds: { south: number; west: number; north: number; east: number } | null;
}

/** What the selector needs from an area. Renderers pass their own richer objects. */
export interface Pillable {
  labelPoint: LatLng;
  /** Free areas win the cap. See below. */
  free: boolean;
}

/**
 * Grow the cull rectangle slightly past the screen edge.
 *
 * A pill is anchored at its label point but drawn around it, so a lot whose
 * centre sits just off screen can still have half its label visible. Culling on
 * the exact bounds makes those pop in and out during a pan. A tenth of the
 * viewport is comfortably more than any pill is wide.
 */
const EDGE_MARGIN = 0.1;

function withinBounds(point: LatLng, bounds: NonNullable<Viewport['bounds']>): boolean {
  const latPad = (bounds.north - bounds.south) * EDGE_MARGIN;
  const lonPad = (bounds.east - bounds.west) * EDGE_MARGIN;
  return (
    point.lat >= bounds.south - latPad &&
    point.lat <= bounds.north + latPad &&
    point.lon >= bounds.west - lonPad &&
    point.lon <= bounds.east + lonPad
  );
}

/**
 * The areas that should carry a pill, in the order they should win collisions.
 *
 * Free first, deliberately. At city scale the useful signal is where you can
 * stop paying, so that is what survives a cap — the same priority the web
 * renderer already expressed through `symbol-sort-key`, now stated once.
 */
export function selectPills<T extends Pillable>(areas: readonly T[], viewport: Viewport): T[] {
  // Below the threshold, no pill is legible anyway and forty overlapping ones
  // turn the map to soup. Both platforms have always agreed on this part.
  if (viewport.zoom < PILL_MIN_ZOOM) return [];

  const onScreen = viewport.bounds
    ? areas.filter((area) => withinBounds(area.labelPoint, viewport.bounds!))
    : [...areas];

  // Stable within each group: equal-priority areas keep dataset order, so the
  // set does not reshuffle on a clock tick and make pills flicker.
  const ranked = onScreen
    .map((area, index) => ({ area, index }))
    .sort((a, b) => Number(b.area.free) - Number(a.area.free) || a.index - b.index)
    .map(({ area }) => area);

  return ranked.slice(0, MAX_VISIBLE_PILLS);
}
