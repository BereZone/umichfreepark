/**
 * Map-agnostic geometry.
 *
 * This layer may know about coordinates. It may NOT know about React, React
 * Native, MapLibre, or react-native-maps. The layering the whole app rests on:
 * the engine decides what is true, encoding.ts decides how it should look,
 * src/geo decides where it is, and the renderers only draw.
 */

/** [longitude, latitude] — GeoJSON order, which is the reverse of how we say it. */
export type Position = [number, number];
export type Ring = Position[];

export interface LatLng {
  lat: number;
  lon: number;
}

export interface BoundingBox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

/**
 * Signed area of a ring, using the shoelace formula.
 *
 * The SIGN is the useful part: positive means counter-clockwise, negative
 * clockwise. Magnitude is in squared degrees and is meaningless as an area —
 * it is only ever compared against other rings from the same polygon.
 */
export function signedArea(ring: Ring): number {
  let sum = 0;
  // Edges must be walked in ring order. Iterating from each vertex back to its
  // predecessor traverses the ring backwards and flips the sign, which reports
  // every counter-clockwise exterior as clockwise.
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += (x2 - x1) * (y2 + y1);
  }
  return sum / 2;
}

export const isClockwise = (ring: Ring): boolean => signedArea(ring) > 0;

/**
 * Normalize winding: counter-clockwise exteriors, clockwise holes.
 *
 * WHY THIS EXISTS
 *
 * GeoJSON (RFC 7946) specifies counter-clockwise exterior rings, but plenty of
 * real OSM-derived data does not comply, and the two renderers disagree about
 * whether it matters. MapLibre uses winding to decide which rings are holes;
 * react-native-maps takes a flat coordinate array and a separate holes array
 * and does not care. Normalizing once here means both renderers receive
 * identical input, so a polygon with a courtyard cannot render as a solid blob
 * on one platform and a ring on the other.
 */
export function normalizeWinding(rings: Ring[]): Ring[] {
  return rings.map((ring, index) => {
    const wantClockwise = index > 0; // ring 0 is the exterior; the rest are holes
    return isClockwise(ring) === wantClockwise ? ring : [...ring].reverse();
  });
}

/**
 * Representative point of a ring: the mean of its vertices.
 *
 * Not the true area centroid, and deliberately so. For the concave, L-shaped
 * lots that are common downtown, an area centroid or a bounding-box centre can
 * land outside the polygon entirely — which would put the price pill in the
 * middle of a building. The vertex mean is biased toward wherever the outline
 * has the most detail, which in practice keeps it inside the shape.
 */
export function ringCentroid(ring: Ring): LatLng {
  // A closed ring repeats its first vertex as its last. Averaging both copies
  // double-weights that corner and drags the centroid toward it — enough to
  // put a unit square's centre at 0.4 rather than 0.5.
  const closed =
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1];
  const vertices = closed ? ring.slice(0, -1) : ring;

  let lon = 0;
  let lat = 0;
  for (const [x, y] of vertices) {
    lon += x;
    lat += y;
  }
  return { lat: lat / vertices.length, lon: lon / vertices.length };
}

/** Centroid of the largest ring, for multipolygons where one part dominates. */
export function polygonCentroid(rings: Ring[]): LatLng {
  const largest = rings.reduce(
    (best, ring) => (Math.abs(signedArea(ring)) > Math.abs(signedArea(best)) ? ring : best),
    rings[0]
  );
  return ringCentroid(largest);
}

/**
 * A point guaranteed to lie inside the polygon — where the price pill goes.
 *
 * `ringCentroid` is a good first guess and is right for most lots, but it is
 * NOT guaranteed inside: for an L-shaped lot the vertex mean can land exactly
 * in the missing corner, which would put the pill on the building next door.
 * Neither would the area centroid or the bounding-box centre.
 *
 * So: try the centroid, and if it is outside, search a grid for the interior
 * point furthest from any edge. That biases the label toward the widest part
 * of the lot, which is also where there is room to draw it.
 */
export function representativePoint(rings: Ring[], gridSteps = 16): LatLng {
  if (rings.length === 0) return { lat: 0, lon: 0 };

  const centroid = polygonCentroid(rings);
  if (pointInPolygon(centroid, rings)) return centroid;

  const box = boundingBox(rings);
  let best: LatLng = centroid;
  let bestClearance = -Infinity;

  for (let i = 1; i < gridSteps; i++) {
    for (let j = 1; j < gridSteps; j++) {
      const candidate = {
        lat: box.minLat + ((box.maxLat - box.minLat) * i) / gridSteps,
        lon: box.minLon + ((box.maxLon - box.minLon) * j) / gridSteps,
      };
      if (!pointInPolygon(candidate, rings)) continue;
      const clearance = Math.min(
        ...rings.flatMap((ring) => ring.map(([x, y]) => haversineMetres(candidate, { lat: y, lon: x })))
      );
      if (clearance > bestClearance) {
        bestClearance = clearance;
        best = candidate;
      }
    }
  }
  return best;
}

export function boundingBox(rings: Ring[]): BoundingBox {
  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    }
  }
  return { minLat, minLon, maxLat, maxLon };
}

/** Union of several boxes, for fitting the map to a set of areas. */
export function unionBoxes(boxes: readonly BoundingBox[]): BoundingBox | null {
  if (boxes.length === 0) return null;
  return boxes.reduce((a, b) => ({
    minLat: Math.min(a.minLat, b.minLat),
    minLon: Math.min(a.minLon, b.minLon),
    maxLat: Math.max(a.maxLat, b.maxLat),
    maxLon: Math.max(a.maxLon, b.maxLon),
  }));
}

/**
 * Ray-casting point-in-ring test.
 *
 * Points exactly on an edge are not guaranteed either way — that is inherent to
 * the algorithm, and for tapping a parking lot a sub-metre ambiguity at the
 * boundary does not matter.
 */
export function pointInRing(point: LatLng, ring: Ring): boolean {
  const { lon: x, lat: y } = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Inside the exterior ring and outside every hole. */
export function pointInPolygon(point: LatLng, rings: Ring[]): boolean {
  if (rings.length === 0 || !pointInRing(point, rings[0])) return false;
  return !rings.slice(1).some((hole) => pointInRing(point, hole));
}

const EARTH_RADIUS_METRES = 6_371_000;

/** Great-circle distance. Used for "near me", never for walking times. */
export function haversineMetres(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat));
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.sqrt(h));
}
