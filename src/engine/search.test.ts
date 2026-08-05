import { describe, expect, it } from 'vitest';

import { BUILDINGS, buildingById, nearestBuilding, searchBuildings } from './search';

const topId = (query: string) => searchBuildings(query)[0]?.building.id;

describe('building search', () => {
  it('loads the building set', () => {
    expect(BUILDINGS.length).toBeGreaterThan(70);
    expect(buildingById.get('mason-hall')?.name).toBe('Mason Hall');
  });

  it('returns nothing for an empty query, not everything', () => {
    // A list of all 80 buildings is not a search result; showing it makes the
    // box look broken.
    expect(searchBuildings('')).toEqual([]);
    expect(searchBuildings('   ')).toEqual([]);
  });

  it('finds a building by its official name', () => {
    expect(topId('Mason Hall')).toBe('mason-hall');
    expect(topId('Michigan Stadium')).toBe('michigan-stadium');
  });

  describe('colloquial names — the feature that matters', () => {
    /**
     * Nobody types "Duderstadt Center Media Union". If these fail, students
     * try the search once and stop using it.
     */
    const colloquial: [string, string][] = [
      ['the dude', 'duderstadt-center'],
      ['dude', 'duderstadt-center'],
      ['the big house', 'michigan-stadium'],
      ['big house', 'michigan-stadium'],
      ['ugli', 'shapiro-undergraduate-library'],
      ['the ugli', 'shapiro-undergraduate-library'],
      ['the union', 'michigan-union'],
    ];

    for (const [query, expected] of colloquial) {
      it(`"${query}" finds ${expected}`, () => {
        const match = searchBuildings(query).find((m) => m.building.id === expected);
        expect(match, `no result for "${query}"`).toBeDefined();
      });
    }
  });

  it('ignores a leading "the" in either direction', () => {
    // Half the colloquial names carry one and half get typed without it.
    expect(topId('the union')).toBe(topId('union'));
    expect(topId('the big house')).toBe(topId('big house'));
  });

  it('is case and punctuation insensitive', () => {
    expect(topId('MASON HALL')).toBe('mason-hall');
    expect(topId('mason  hall')).toBe('mason-hall');
  });

  it('matches a prefix as you type', () => {
    for (const partial of ['maso', 'mason', 'mason h']) {
      expect(topId(partial), partial).toBe('mason-hall');
    }
  });

  it('ranks an exact match above a merely-contains match', () => {
    const results = searchBuildings('union');
    // Something named exactly "union" or starting with it must come before a
    // building that only contains the letters in order.
    const unionIndex = results.findIndex((m) => m.building.id === 'michigan-union');
    expect(unionIndex).toBeGreaterThanOrEqual(0);
    expect(unionIndex).toBeLessThan(3);
  });

  it('reports which name matched, so the UI can show why', () => {
    const match = searchBuildings('the dude')[0];
    expect(match.matchedOn.toLowerCase()).toContain('dude');
  });

  it('respects the result limit', () => {
    expect(searchBuildings('a', 3).length).toBeLessThanOrEqual(3);
  });

  it('returns nothing for a query that matches nothing', () => {
    expect(searchBuildings('zzzzqqqq')).toEqual([]);
  });

  it('never returns duplicates', () => {
    const ids = searchBuildings('hall', 20).map((m) => m.building.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every building a route to being found by its own name', () => {
    for (const building of BUILDINGS) {
      const found = searchBuildings(building.name, 20).some((m) => m.building.id === building.id);
      expect(found, building.name).toBe(true);
    }
  });
});

describe('nearestBuilding', () => {
  /*
   * "Use my location" resolves a GPS fix to a building because every walking
   * time CURB holds is precomputed from one. The risk is entirely in the
   * out-of-range case: returning the closest building unconditionally would
   * hand a student in Detroit a destination forty miles away and then rank
   * every lot in Ann Arbor as a short walk from it.
   */

  const mason = buildingById.get('mason-hall')!;

  it('finds the building you are standing on', () => {
    const found = nearestBuilding(mason.lat, mason.lon);
    expect(found?.building.id).toBe('mason-hall');
    expect(found?.metres).toBeLessThan(5);
  });

  it('finds the nearest one from a point between buildings', () => {
    // Twenty metres north of Mason. Still Mason, not whatever is across the Diag.
    const found = nearestBuilding(mason.lat + 20 / 110_540, mason.lon);
    expect(found?.building.id).toBe('mason-hall');
    expect(found?.metres).toBeGreaterThan(10);
    expect(found?.metres).toBeLessThan(40);
  });

  it('returns null rather than a distant guess when you are nowhere near', () => {
    // Downtown Detroit, about 60km away.
    expect(nearestBuilding(42.3314, -83.0458)).toBeNull();
  });

  it('respects an explicit range', () => {
    /*
     * Tested by widening the range around a point that is definitively out of
     * it, rather than by shrinking it around a point on campus. Central campus
     * is dense enough that a coordinate "300m from Mason" is 37m from the
     * Modern Languages Building, so the tight-radius version of this test
     * asserted a fact about building spacing rather than about the parameter.
     */
    expect(nearestBuilding(42.3314, -83.0458)).toBeNull();
    expect(nearestBuilding(42.3314, -83.0458, 100_000)?.building).toBeDefined();
  });

  it('reports a distance consistent with the coordinate it was given', () => {
    // 500m east. The east-west scale is the part an equirectangular
    // approximation gets wrong if the latitude cosine is forgotten.
    const metresPerLon = Math.cos((mason.lat * Math.PI) / 180) * 111_320;
    const found = nearestBuilding(mason.lat, mason.lon + 500 / metresPerLon, 5_000);
    expect(found).not.toBeNull();
    expect(found!.metres).toBeLessThanOrEqual(500 + 1);
  });
});
