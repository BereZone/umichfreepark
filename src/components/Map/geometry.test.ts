import { describe, expect, it } from 'vitest';

import { MAPPABLE_AREAS } from '../../engine';
import { isClockwise, pointInPolygon } from '../../geo/polygons';
import { MAP_AREAS, mapAreaById } from './geometry';

describe('map geometry', () => {
  it('resolves a polygon for every mappable area', () => {
    expect(MAP_AREAS).toHaveLength(MAPPABLE_AREAS.length);
  });

  it('normalizes winding so both renderers get identical input', () => {
    // Exterior counter-clockwise, holes clockwise. MapLibre reads winding to
    // find holes; react-native-maps does not. Without this, a lot with a
    // courtyard could render as a ring on one platform and a blob on the other.
    for (const { area, rings } of MAP_AREAS) {
      expect(isClockwise(rings[0]), `${area.id} exterior`).toBe(false);
      for (const hole of rings.slice(1)) {
        expect(isClockwise(hole), `${area.id} hole`).toBe(true);
      }
    }
  });

  it('puts every label point inside its own polygon', () => {
    // A pill outside its lot is a pill on someone else's building.
    for (const { area, rings, labelPoint } of MAP_AREAS) {
      expect(pointInPolygon(labelPoint, rings), area.id).toBe(true);
    }
  });

  it('has a closed exterior ring with enough points to be a polygon', () => {
    for (const { area, rings } of MAP_AREAS) {
      const ring = rings[0];
      expect(ring.length, area.id).toBeGreaterThanOrEqual(4);
      expect(ring[0], area.id).toEqual(ring[ring.length - 1]);
    }
  });

  it('places every polygon inside Ann Arbor', () => {
    for (const { area, rings } of MAP_AREAS) {
      for (const [lon, lat] of rings.flat()) {
        expect(lat, area.id).toBeGreaterThan(42);
        expect(lat, area.id).toBeLessThan(43);
        expect(lon, area.id).toBeGreaterThan(-84);
        expect(lon, area.id).toBeLessThan(-83);
      }
    }
  });

  it('indexes by area id', () => {
    expect(mapAreaById.get('maynard')?.area.name).toBe('Maynard Structure');
    // The meter district is drawable now — the city publishes its boundary even
    // though it publishes nothing about individual meters.
    expect(mapAreaById.get('downtown-meters')).toBeDefined();
    // The half-price blocks are named in prose only, so there is no shape.
    expect(mapAreaById.get('half-price-meters')).toBeUndefined();
  });
});
