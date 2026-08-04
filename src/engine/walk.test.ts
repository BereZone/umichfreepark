import { describe, expect, it } from 'vitest';

import { MAPPABLE_AREAS } from './data/areas';
import buildingData from './data/buildings.json';
import {
  FALLBACK_COUNT,
  KNOWN_BUILDING_IDS,
  ROUTED_AREA_IDS,
  walkMinutes,
  walkSeconds,
} from './walk';

describe('the walk matrix', () => {
  it('covers every building and every mappable area you can walk to', () => {
    expect(KNOWN_BUILDING_IDS).toHaveLength(buildingData.buildings.length);

    // Every drawable area is routed except the meter district, which is a
    // square kilometre of downtown rather than a place. Routing to its centre
    // would tell someone at the Union that the downtown meters are twelve
    // minutes away while they are standing next to one.
    const routed = new Set(ROUTED_AREA_IDS);
    const unrouted = MAPPABLE_AREAS.filter((a) => !routed.has(a.id)).map((a) => a.id);
    expect(unrouted).toEqual(['downtown-meters']);
  });

  it('has a routed time for every pair', () => {
    for (const b of KNOWN_BUILDING_IDS) {
      for (const a of ROUTED_AREA_IDS) {
        const seconds = walkSeconds(b, a);
        expect(typeof seconds, `${b} -> ${a}`).toBe('number');
        expect(seconds!, `${b} -> ${a}`).toBeGreaterThan(0);
      }
    }
  });

  it('used no straight-line fallbacks', () => {
    // The fallback is an estimate, not a routed walk. Zero is the target, and
    // a regression here means a coordinate stopped being reachable on foot —
    // which is exactly how the Michigan Stadium centroid was caught.
    expect(FALLBACK_COUNT).toBe(0);
  });

  it('returns null for a pair it does not know, rather than a plausible zero', () => {
    expect(walkSeconds('not-a-building', 'maynard')).toBeNull();
    expect(walkSeconds('mason-hall', 'not-an-area')).toBeNull();
    // The meter zones have no polygon, so they are deliberately absent.
    expect(walkSeconds('mason-hall', 'downtown-meters')).toBeNull();
  });

  it('rounds minutes up so a walk is never undersold', () => {
    // Telling someone 1 minute for a 61-second walk is the wrong direction to
    // be wrong when they are deciding whether they have time.
    for (const a of ROUTED_AREA_IDS.slice(0, 20)) {
      const seconds = walkSeconds('mason-hall', a)!;
      expect(walkMinutes('mason-hall', a)).toBe(Math.ceil(seconds / 60));
    }
  });

  it('produces times that match the geography', () => {
    // Mason Hall sits on the Diag, a few minutes from the Maynard structure.
    // The Duderstadt is on North Campus, a different part of town entirely.
    const close = walkMinutes('mason-hall', 'maynard')!;
    const far = walkMinutes('duderstadt-center', 'maynard')!;
    expect(close).toBeLessThan(10);
    expect(far).toBeGreaterThan(25);
    expect(far).toBeGreaterThan(close * 3);
  });

  it('puts the stadium closer to its own lot than to downtown', () => {
    const ownLot = walkMinutes('michigan-stadium', 'umich-sc7')!;
    const downtown = walkMinutes('michigan-stadium', 'maynard')!;
    expect(ownLot).toBeLessThan(downtown);
  });

  it('has no absurd values in either direction', () => {
    const all = KNOWN_BUILDING_IDS.flatMap((b) =>
      ROUTED_AREA_IDS.map((a) => walkSeconds(b, a)!)
    );
    // Nothing instant, nothing beyond a very long cross-town walk.
    expect(Math.min(...all)).toBeGreaterThan(10);
    expect(Math.max(...all)).toBeLessThan(3 * 60 * 60);
  });
});
