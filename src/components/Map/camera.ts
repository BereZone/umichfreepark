/**
 * When the map should move itself, and where to.
 *
 * The map moves for one reason: something was selected that you cannot
 * meaningfully see. Selection arrives from a polygon tap or from a list row,
 * and on the wide layout that second case is an entire interaction — click a
 * row in the sidebar, watch the map beside it.
 *
 * Like pills.ts, this lives outside both renderers because it is a decision
 * rather than a drawing technique. Apple Maps and MapLibre have completely
 * different camera APIs; the point is that they agree on *whether* to move, not
 * on how.
 *
 * "CAN YOU SEE IT" IS TWO QUESTIONS, NOT ONE
 *
 * The first version asked only whether the point was inside the frame, and it
 * was wrong in a way that looked right: selecting a lot from the sidebar at
 * city scale left the camera exactly where it was, because the lot genuinely
 * was on screen — as a 6-pixel rectangle whose only change was two points of
 * extra border. The row appeared to do nothing.
 *
 * So scale counts too. Below the focus zoom nothing is identifiable no matter
 * where it sits in the frame, and a selection is a request to look at
 * something.
 */

import type { LatLng } from '../../geo/polygons';

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface CameraView {
  zoom: number;
  /**
   * Null when the renderer cannot say where it is looking — Apple Maps before
   * its first camera event. Null means do not move: driving a camera whose
   * position is unknown is how a map ends up in the Atlantic.
   */
  bounds: Bounds | null;
}

/**
 * How far inside the viewport a point must sit to count as comfortably visible.
 *
 * A fifth of the frame. A lot two pixels inside the edge is under the status
 * card, or half past the bezel, or behind the sheet — "on screen" and "visible"
 * are different claims.
 */
const COMFORT_INSET = 0.2;

/**
 * The zoom at which a single lot becomes a thing you can look at rather than a
 * speck. Below it, selecting anything is worth a move.
 */
export const FOCUS_ZOOM = 16;

/**
 * Where the camera should go for this selection, or null to stay put.
 *
 * Zoom only ever increases: someone who has zoomed to one block and then taps a
 * row for a lot two streets over wants to arrive at that lot, not to be pulled
 * back out to city scale.
 */
export interface Focus {
  center: LatLng;
  zoom: number;
}

/**
 * The camera that puts `point` in the middle at a useful scale.
 *
 * Unconditional, unlike `focusFor`. Some moves are not a judgement call: when
 * the user picks a destination they have just named a place and expect to be
 * looking at it, so there is nothing to decide. Shared so that "a useful scale"
 * means the same thing whichever way the camera was asked to move.
 */
export function focusOn(point: LatLng, currentZoom: number): Focus {
  return { center: point, zoom: Math.max(currentZoom, FOCUS_ZOOM) };
}

export function focusFor(point: LatLng, view: CameraView): Focus | null {
  if (!view.bounds) return null;

  const tooFarOut = view.zoom < FOCUS_ZOOM;
  const latInset = (view.bounds.north - view.bounds.south) * COMFORT_INSET;
  const lonInset = (view.bounds.east - view.bounds.west) * COMFORT_INSET;
  const offCentre =
    point.lat < view.bounds.south + latInset ||
    point.lat > view.bounds.north - latInset ||
    point.lon < view.bounds.west + lonInset ||
    point.lon > view.bounds.east - lonInset;

  if (!tooFarOut && !offCentre) return null;
  return focusOn(point, view.zoom);
}
