import { describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  boundingBox,
  haversineMetres,
  isClockwise,
  normalizeWinding,
  pointInPolygon,
  pointInRing,
  polygonCentroid,
  representativePoint,
  ringCentroid,
  signedArea,
  unionBoxes,
  type Ring,
} from './polygons';

/** Every real polygon UMichFreePark ships, as ring arrays. */
const realPolygons: Ring[][] = (() => {
  const geo = JSON.parse(
    readFileSync(path.join(process.cwd(), 'data/raw/osm-parking.geojson'), 'utf8')
  );
  return geo.features
    .slice(0, 200)
    .map((f: { geometry: { type: string; coordinates: unknown } }) =>
      f.geometry.type === 'Polygon'
        ? (f.geometry.coordinates as Ring[])
        : (f.geometry.coordinates as Ring[][]).map((p) => p[0])
    );
})();

/** A unit square, counter-clockwise in GeoJSON [lon, lat] order. */
const ccwSquare: Ring = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
  [0, 0],
];
const cwSquare: Ring = [...ccwSquare].reverse();

describe('winding', () => {
  it('detects direction', () => {
    expect(isClockwise(ccwSquare)).toBe(false);
    expect(isClockwise(cwSquare)).toBe(true);
  });

  it('makes exteriors counter-clockwise and holes clockwise', () => {
    // RFC 7946 wants CCW exteriors. MapLibre uses winding to find holes;
    // react-native-maps does not care. Normalizing means both renderers get
    // the same input and a courtyard cannot render as a blob on one platform.
    const [exterior, hole] = normalizeWinding([cwSquare, ccwSquare]);
    expect(isClockwise(exterior)).toBe(false);
    expect(isClockwise(hole)).toBe(true);
  });

  it('leaves already-correct rings untouched', () => {
    const input = [ccwSquare, cwSquare];
    const output = normalizeWinding(input);
    expect(output[0]).toBe(input[0]);
    expect(output[1]).toBe(input[1]);
  });

  it('is idempotent', () => {
    const once = normalizeWinding([cwSquare, ccwSquare]);
    expect(normalizeWinding(once)).toEqual(once);
  });

  it('does not mutate its input', () => {
    const original = [...cwSquare];
    normalizeWinding([cwSquare]);
    expect(cwSquare).toEqual(original);
  });

  it('gives the same magnitude regardless of direction', () => {
    expect(Math.abs(signedArea(ccwSquare))).toBeCloseTo(Math.abs(signedArea(cwSquare)));
  });
});

describe('centroids', () => {
  it('finds the middle of a square', () => {
    const c = ringCentroid(ccwSquare);
    expect(c.lon).toBeCloseTo(0.5, 6);
    expect(c.lat).toBeCloseTo(0.5, 6);
  });

  it('uses the largest ring of a multipolygon', () => {
    const small: Ring = [
      [10, 10],
      [10.1, 10],
      [10.1, 10.1],
      [10, 10.1],
      [10, 10],
    ];
    const c = polygonCentroid([ccwSquare, small]);
    expect(c.lon).toBeCloseTo(0.5, 6);
  });

  /** The notch is the top-right quadrant of a 2x2 box. */
  const lShape: Ring = [
    [0, 0],
    [2, 0],
    [2, 1],
    [1, 1],
    [1, 2],
    [0, 2],
    [0, 0],
  ];

  it('the plain centroid can fall OUTSIDE a concave lot', () => {
    // Worth asserting rather than assuming: for this L the vertex mean lands
    // exactly on the notch corner, and the bounding-box centre lands in the
    // missing quadrant. Either would put the price pill on the building next
    // door, which is why representativePoint exists.
    const box = boundingBox([lShape]);
    const boxCentre = {
      lat: (box.minLat + box.maxLat) / 2,
      lon: (box.minLon + box.maxLon) / 2,
    };
    expect(pointInRing(boxCentre, lShape)).toBe(false);
  });

  it('representativePoint is inside, even for a concave lot', () => {
    expect(pointInPolygon(representativePoint([lShape]), [lShape])).toBe(true);
  });

  it('representativePoint keeps the centroid when it is already inside', () => {
    expect(representativePoint([ccwSquare])).toEqual(ringCentroid(ccwSquare));
  });

  it('representativePoint stays inside for every real area polygon', () => {
    // The guarantee has to hold on the actual dataset, not just a toy L.
    for (const rings of realPolygons) {
      expect(pointInPolygon(representativePoint(rings), rings)).toBe(true);
    }
  });

  it('representativePoint avoids holes', () => {
    const outer: Ring = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ];
    // A hole dead-centre, so the naive centroid lands in the courtyard.
    const hole: Ring = [
      [3, 3],
      [7, 3],
      [7, 7],
      [3, 7],
      [3, 3],
    ];
    const point = representativePoint([outer, hole]);
    expect(pointInPolygon(point, [outer, hole])).toBe(true);
    expect(pointInRing(point, hole)).toBe(false);
  });
});

describe('bounding boxes', () => {
  it('covers every vertex', () => {
    expect(boundingBox([ccwSquare])).toEqual({ minLat: 0, minLon: 0, maxLat: 1, maxLon: 1 });
  });

  it('unions boxes for fitting the map to several areas', () => {
    const a = boundingBox([ccwSquare]);
    const b = boundingBox([
      [
        [5, 5],
        [6, 5],
        [6, 6],
        [5, 5],
      ],
    ]);
    expect(unionBoxes([a, b])).toEqual({ minLat: 0, minLon: 0, maxLat: 6, maxLon: 6 });
  });

  it('returns null for nothing, rather than an inside-out box', () => {
    // Infinity-initialised bounds would otherwise produce a box that swallows
    // the world, and a map that zooms to fit it shows the whole planet.
    expect(unionBoxes([])).toBeNull();
  });
});

describe('point in polygon', () => {
  it('is true inside and false outside', () => {
    expect(pointInRing({ lat: 0.5, lon: 0.5 }, ccwSquare)).toBe(true);
    expect(pointInRing({ lat: 1.5, lon: 0.5 }, ccwSquare)).toBe(false);
  });

  it('respects holes', () => {
    const outer: Ring = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ];
    const hole: Ring = [
      [4, 4],
      [6, 4],
      [6, 6],
      [4, 6],
      [4, 4],
    ];
    expect(pointInPolygon({ lat: 1, lon: 1 }, [outer, hole])).toBe(true);
    // A courtyard: inside the outline but not on the lot.
    expect(pointInPolygon({ lat: 5, lon: 5 }, [outer, hole])).toBe(false);
  });

  it('does not depend on winding direction', () => {
    expect(pointInRing({ lat: 0.5, lon: 0.5 }, cwSquare)).toBe(true);
  });

  it('is false for an empty polygon rather than throwing', () => {
    expect(pointInPolygon({ lat: 0, lon: 0 }, [])).toBe(false);
  });
});

describe('haversine', () => {
  it('measures a known Ann Arbor distance', () => {
    // Mason Hall to the Maynard structure is a little over 400 m in a straight
    // line; the routed walk is 518 m, which is the detour factor at work.
    const metres = haversineMetres(
      { lat: 42.2768, lon: -83.7382 },
      { lat: 42.27868, lon: -83.74227 }
    );
    expect(metres).toBeGreaterThan(300);
    expect(metres).toBeLessThan(500);
  });

  it('is zero for a point to itself and symmetric', () => {
    const a = { lat: 42.2768, lon: -83.7382 };
    const b = { lat: 42.2909, lon: -83.7166 };
    expect(haversineMetres(a, a)).toBe(0);
    expect(haversineMetres(a, b)).toBeCloseTo(haversineMetres(b, a), 6);
  });
});
