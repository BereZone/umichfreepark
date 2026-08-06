/**
 * The pill selector is the one place that decides which lots get a label, so
 * these assertions stand in for looking at two maps side by side.
 *
 * Two bugs they exist to prevent, both of which were real:
 *
 *  1. A cap applied to the whole dataset rather than to the screen, which hid
 *     labels on lots the user had deliberately zoomed in on.
 *  2. No spacing rule, which was invisible on the web because MapLibre resolves
 *     label collisions itself, and turned dense blocks of campus into a stack
 *     of overlapping "BLUE PERMIT" pills on Apple Maps, which does not.
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

/**
 * Degrees of latitude per metre in Ann Arbor. Test fixtures are spaced in
 * metres because the spacing rule is in metres; writing decimal degrees inline
 * makes it impossible to see whether two fixtures are near or far.
 */
const M = 1 / 110_540;

/** `count` areas in a north-south line, `metres` apart. */
const spacedApart = (count: number, metres: number, free = false) =>
  Array.from({ length: count }, (_, i) => area(42.2755 + i * metres * M, -83.7395, free));

describe('selectPills', () => {
  it('shows nothing below the shared zoom threshold', () => {
    // Forty overlapping pills at city scale are unreadable, and both platforms
    // have to stop at the same moment or they declutter differently.
    const areas = spacedApart(2, 600);
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

  it('never exceeds the cap', () => {
    const many = spacedApart(MAX_VISIBLE_PILLS * 3, 400);
    expect(
      selectPills(many, { zoom: 17, bounds: null }).length
    ).toBeLessThanOrEqual(MAX_VISIBLE_PILLS);
  });
});

describe('spacing', () => {
  it('drops a pill that would land on top of one already chosen', () => {
    // Two lots ten metres apart cannot both be labelled at any readable zoom.
    const [first, second] = spacedApart(2, 10);
    expect(selectPills([first, second], { zoom: 15, bounds: CAMPUS })).toEqual([first]);
  });

  it('keeps both once they are far enough apart', () => {
    const pair = spacedApart(2, 400);
    expect(selectPills(pair, { zoom: 15, bounds: CAMPUS })).toHaveLength(2);
  });

  it('relaxes as you zoom in, because the same gap becomes more pixels', () => {
    // 40m apart: overlapping at neighbourhood zoom, comfortably separate at
    // street zoom. This is what makes "every lot has a label" true when you
    // have zoomed in far enough to read one.
    const pair = spacedApart(2, 40);
    expect(selectPills(pair, { zoom: 15, bounds: null })).toHaveLength(1);
    expect(selectPills(pair, { zoom: 18, bounds: null })).toHaveLength(2);
  });

  it('needs far more room side by side than stacked, because a pill is wide', () => {
    /*
     * The anisotropy is the point. A single radius has to be sized for the wide
     * axis, and then a street of lots stacked north to south loses four labels
     * in five for space that was never contested.
     *
     * 150m apart at zoom 15 is roughly 42 screen points: clear vertically,
     * overlapping horizontally.
     */
    const northSouth = [area(42.2755, -83.7395), area(42.2755 + 150 * M, -83.7395)];
    const lonPerMetre = 1 / (Math.cos((42.2755 * Math.PI) / 180) * 111_320);
    const eastWest = [area(42.2755, -83.7395), area(42.2755, -83.7395 + 150 * lonPerMetre)];

    expect(selectPills(northSouth, { zoom: 15, bounds: null })).toHaveLength(2);
    expect(selectPills(eastWest, { zoom: 15, bounds: null })).toHaveLength(1);
  });

  it('lets the free lot win when two are too close to label both', () => {
    const paid = area(42.2755, -83.7395);
    const free = area(42.2756, -83.7395, true); // ~11m away
    const chosen = selectPills([paid, free], { zoom: 15, bounds: CAMPUS });
    // At city scale the useful signal is where you can stop paying.
    expect(chosen).toEqual([free]);
  });

  it('holds dataset order within a priority group, so pills do not reshuffle', () => {
    const [a, b, c] = spacedApart(3, 400);
    expect(selectPills([a, b, c], { zoom: 15, bounds: CAMPUS })).toEqual([a, b, c]);
  });
});

describe('against the shipped areas', () => {
  const shipped = MAP_AREAS.map((m) => ({ labelPoint: m.labelPoint, free: false, id: m.area.id }));

  const within = (bounds: { south: number; west: number; north: number; east: number }) =>
    shipped.filter(
      (a) =>
        a.labelPoint.lat >= bounds.south &&
        a.labelPoint.lat <= bounds.north &&
        a.labelPoint.lon >= bounds.west &&
        a.labelPoint.lon <= bounds.east
    );

  it('leaves an area in view unlabelled only when a label is already on top of it', () => {
    /*
     * The honest form of "every lot has a label at street zoom".
     *
     * The old dataset-wide cap dropped labels for no reason visible on screen —
     * the budget had been spent on lots a mile away. Spacing drops them for a
     * reason you can see: another pill is already there. So rather than assert
     * that nothing is ever dropped, assert that nothing is dropped *silently*:
     * every unlabelled area in view has a labelled neighbour close enough that
     * the two pills could not both be drawn.
     *
     * A metre or two of slack, because the test recomputes the threshold in
     * metres rather than reaching into the module's own arithmetic.
     */
    const block = { south: 42.2775, west: -83.7425, north: 42.2805, east: -83.7375 };
    const inView = within(block);
    expect(inView.length).toBeGreaterThan(0);

    const zoom = 18;
    const chosen = selectPills(shipped, { zoom, bounds: block });
    const metresPerPixel = (156_543.03392 * Math.cos((42.279 * Math.PI) / 180)) / 2 ** zoom;
    const threshold = 76 * metresPerPixel + 2;

    for (const a of inView) {
      if (chosen.includes(a)) continue;
      const nearest = Math.min(
        ...chosen.map((b) =>
          Math.hypot(
            (a.labelPoint.lon - b.labelPoint.lon) *
              Math.cos((a.labelPoint.lat * Math.PI) / 180) *
              111_320,
            (a.labelPoint.lat - b.labelPoint.lat) * 110_540
          )
        )
      );
      expect(nearest, `${a.id} is unlabelled with no pill near it`).toBeLessThan(threshold);
    }
  });

  it('still declutters when the whole city is on screen', () => {
    const city = { south: 42.24, west: -83.78, north: 42.32, east: -83.66 };
    const chosen = selectPills(shipped, { zoom: 14.5, bounds: city });
    expect(chosen.length).toBeLessThanOrEqual(MAX_VISIBLE_PILLS);
    // Roughly a third of the dataset. Enough to read the city at a glance,
    // nowhere near enough to overlap.
    expect(chosen.length).toBeLessThan(shipped.length / 2);
  });

  it('shows more as you zoom in, never fewer', () => {
    const city = { south: 42.24, west: -83.78, north: 42.32, east: -83.66 };
    const counts = [14.5, 15.5, 16.5].map(
      (zoom) => selectPills(shipped, { zoom, bounds: city }).length
    );
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i], `zoom step ${i}`).toBeGreaterThanOrEqual(counts[i - 1]);
    }
  });
});

describe('areas that opt out of a pill', () => {
  it('never selects one, however much room there is', () => {
    const district = { ...area(42.279, -83.74), showsPill: false };
    const lot = area(42.2795, -83.7405);
    expect(selectPills([district, lot], { zoom: 18, bounds: CAMPUS })).toEqual([lot]);
  });

  it('does not let one consume a slot in the cap', () => {
    // The district is dropped before ranking, so a crowded screen is not one
    // pill poorer for its presence.
    const districts = spacedApart(3, 400).map((a) => ({ ...a, showsPill: false }));
    const lots = spacedApart(3, 400);
    expect(selectPills([...districts, ...lots], { zoom: 17, bounds: null })).toHaveLength(3);
  });

  it('treats an unset flag as pillable, so ordinary areas need not mention it', () => {
    const plain = area(42.279, -83.74);
    expect(selectPills([plain], { zoom: 17, bounds: CAMPUS })).toEqual([plain]);
  });
});
