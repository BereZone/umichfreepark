/**
 * Turning shipped areas into drawable geometry.
 *
 * Pure, and computed once at module load rather than per render. The polygons
 * never change, so normalizing winding and solving for label points on every
 * clock tick would burn frames to produce identical results.
 */

import areaPolygons from '../../engine/data/area-polygons.json';
import { MAPPABLE_AREAS, type ResolvedArea } from '../../engine';
import { normalizeWinding, representativePoint, type Ring } from '../../geo/polygons';
import type { MapArea } from './types';

/**
 * A JSON import widens `[lon, lat]` to `number[]`, so TypeScript cannot see the
 * pairs as tuples and the cast has to go through `unknown`.
 *
 * The cast is not the safety mechanism — geometry.test.ts is. It asserts on the
 * real file that every exterior ring has at least four points, is closed, and
 * lies inside Ann Arbor. A malformed polygon fails there rather than becoming a
 * runtime surprise on a map.
 */
const polygons = areaPolygons.polygons as unknown as Record<
  string,
  { osmId: string; rings: Ring[] }
>;

function toMapArea(area: ResolvedArea): MapArea | null {
  const entry = polygons[area.id];
  if (!entry) return null;
  // Winding is normalized HERE, once, so neither renderer has to think about
  // it and neither can get it different from the other.
  const rings = normalizeWinding(entry.rings);
  return { area, rings, labelPoint: representativePoint(rings) };
}

/** Every area the map can draw, with geometry resolved. */
export const MAP_AREAS: MapArea[] = MAPPABLE_AREAS.map(toMapArea).filter(
  (a): a is MapArea => a !== null
);

export const mapAreaById = new Map(MAP_AREAS.map((m) => [m.area.id, m]));
