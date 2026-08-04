/**
 * The pill selector is the one place that decides which lots get a label, so
 * these assertions stand in for looking at two maps side by side.
 *
 * The bug they exist to prevent is the one that was there: a cap applied to the
 * whole dataset rather than to the screen, which hid labels on lots the user
 * had deliberately zoomed in on.
 */

import { describe, expect, it } from 'vitest';

import { MAP_AREAS } from './geometry';
import { selectPills, type Pillable } from './pills';
import { MAX_VISIBLE_PILLS, PILL_MIN_ZOOM } from './types';

const area = (lat: number, lon: number, free = false): Pillable => ({
  labelPoint: { lat, lon },
  free,
});

/** Roughly central campus, about a kilometre across. */
const CAMPUS = { south: 42.274, west: -83.745, north: 42.284, east: -83.73 };

describe('selectPills', () => {
  it('shows nothing below the shared zoom threshold', () => {
    // Forty overlapping pills at city scale are unreadable, and both platforms
    // have to stop at the same moment or they declutter differently.
    const areas = [area(42.279, -83.74), area(42.28, -83.739)];
    expect(selectPills(areas, { zoom: PILL_MIN_ZOOM - 0.1, bounds: CAMPUS })).toEqual([]);
    expect(selectPills(areas, { zoom: PILL_MIN_ZOOM, bounds: CAMPUS })).toHaveLength(2);
  });

  it('drops areas outside the viewport', () => {
    const inside = area(42.279, -83.74);
    const faraway = area(42.31, -83.71); // North Campus, well off this screen
    expect(selectPills([inside, faraway], { zoom: 15, bounds: CAMPUS })).toEqual([inside]);
  });

  it('keeps an area just past the edge, so pills do not flicker while panning', () => {
    // The label is drawn around its point, so a centre barely off screen still
    // has visible text. Culling on the exact bounds pops those in and out.
    const justOutside = area(CAMPUS.north + 0.0005, -83.74);
    expect(selectPills([justOutside], { zoom: 15, bounds: CAMPUS })).toHaveLength(1);
  });

  it('does not cull when the renderer cannot report bounds yet', () => {
    // Apple Maps has no region until the first camera event. Showing every
    // label for one frame beats showing none.
    const areas = [area(42.279, -83.74), area(42.31, -83.71)];
    expect(selectPills(areas, { zoom: 15, bounds: null })).toHaveLength(2);
  });

  it('spends the cap on free areas first', () => {
    const paid = Array.from({ length: MAX_VISIBLE_PILLS }, (_, i) =>
      area(42.279 + i * 1e-5, -83.74)
    );
    const free = area(42.2795, -83.7405, true);
    const chosen = selectPills([...paid, free], { zoom: 15, bounds: CAMPUS });
    expect(chosen).toHaveLength(MAX_VISIBLE_PILLS);
    // The free one is what someone is looking for, so it must survive a full cap.
    expect(chosen[0]).toBe(free);
    expect(chosen).toContain(free);
  });

  it('holds dataset order within a priority group, so pills do not reshuffle each tick', () => {
    const a = area(42.279, -83.74);
    const b = area(42.2791, -83.7401);
    const c = area(42.2792, -83.7402);
    expect(selectPills([a, b, c], { zoom: 15, bounds: CAMPUS })).toEqual([a, b, c]);
  });

  it('never exceeds the cap', () => {
    const many = Array.from({ length: MAX_VISIBLE_PILLS * 3 }, (_, i) =>
      area(42.276 + i * 1e-4, -83.74)
    );
    expect(selectPills(many, { zoom: 15, bounds: CAMPUS }).length).toBeLessThanOrEqual(
      MAX_VISIBLE_PILLS
    );
  });
});

describe('against the shipped areas', () => {
  const shipped = MAP_AREAS.map((m) => ({ labelPoint: m.labelPoint, free: false, id: m.area.id }));

  it('labels every area in view once you are zoomed in on a block', () => {
    // This is the property the old dataset-wide cap broke. A tight viewport
    // holds far fewer areas than the cap, so nothing in it should be dropped.
    const block = { south: 42.2775, west: -83.7425, north: 42.2805, east: -83.7375 };
    const inView = shipped.filter(
      (a) =>
        a.labelPoint.lat >= block.south &&
        a.labelPoint.lat <= block.north &&
        a.labelPoint.lon >= block.west &&
        a.labelPoint.lon <= block.east
    );
    expect(inView.length).toBeGreaterThan(0);
    expect(inView.length).toBeLessThan(MAX_VISIBLE_PILLS);

    const chosen = selectPills(shipped, { zoom: 16, bounds: block });
    for (const a of inView) expect(chosen).toContain(a);
  });

  it('still declutters when the whole city is on screen', () => {
    const city = { south: 42.24, west: -83.78, north: 42.32, east: -83.66 };
    const chosen = selectPills(shipped, { zoom: 14.5, bounds: city });
    expect(chosen.length).toBe(MAX_VISIBLE_PILLS);
    expect(chosen.length).toBeLessThan(shipped.length);
  });
});
