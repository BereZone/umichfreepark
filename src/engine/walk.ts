/**
 * Walking times, read from the precomputed matrix.
 *
 * Pure and synchronous by construction. The matrix is built at build time by
 * scripts/build-walk-matrix.mjs precisely so that this lookup never needs a
 * network call — the app has to work inside a parking structure with no signal,
 * and "how far is this lot" is the question it exists to answer.
 */

import walkMatrix from './data/walk-matrix.json';

const buildingIndex = new Map(walkMatrix.buildings.map((id, i) => [id, i]));
const areaIndex = new Map(walkMatrix.areas.map((id, i) => [id, i]));

/**
 * Walking seconds from a building to an area, or null when the pair is not in
 * the matrix.
 *
 * Null is a real answer, not an error: the two meter zones have no polygon and
 * therefore no centroid to route to. Callers must decide what to show rather
 * than being handed a plausible-looking zero.
 */
export function walkSeconds(buildingId: string, areaId: string): number | null {
  const b = buildingIndex.get(buildingId);
  const a = areaIndex.get(areaId);
  if (b === undefined || a === undefined) return null;
  return walkMatrix.seconds[b][a] ?? null;
}

/** Whole minutes, rounded up — a 61-second walk is "2 min", never "1 min". */
export function walkMinutes(buildingId: string, areaId: string): number | null {
  const seconds = walkSeconds(buildingId, areaId);
  return seconds === null ? null : Math.ceil(seconds / 60);
}

export const KNOWN_BUILDING_IDS: readonly string[] = walkMatrix.buildings;
export const ROUTED_AREA_IDS: readonly string[] = walkMatrix.areas;

/** How many pairs fell back to a straight-line estimate when the matrix was built. */
export const FALLBACK_COUNT = walkMatrix.fallback.used;
