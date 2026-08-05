/**
 * The camera rule is shared between two renderers with completely different
 * camera APIs, so "do they behave the same" cannot be checked by looking at
 * either one. These assertions are the check.
 *
 * Three bugs they exist to prevent, all of which were real or nearly so:
 *
 *  1. Recentring on a selection the user made by tapping the polygon they were
 *     already looking at, which yanks the map out from under their finger.
 *  2. Doing nothing when a sidebar row selects a lot that is off screen, which
 *     makes the row look broken.
 *  3. Doing nothing when the lot IS on screen but the map is at city scale, so
 *     the only visible change is two points of border on a six-pixel shape.
 *     This one shipped in the first version and looked correct in the code.
 */

import { describe, expect, it } from 'vitest';

import { FOCUS_ZOOM, focusFor } from './camera';

/** Roughly central campus, about a kilometre across. */
const VIEW = { south: 42.274, west: -83.745, north: 42.284, east: -83.735 };

const middle = { lat: 42.279, lon: -83.74 };

/** Close enough that a single lot is a thing you can look at. */
const close = { zoom: FOCUS_ZOOM + 1, bounds: VIEW };

describe('focusFor', () => {
  it('stays put for a point comfortably in view at a useful zoom', () => {
    expect(focusFor(middle, close)).toBeNull();
  });

  it('moves for a point outside the viewport entirely', () => {
    // North Campus, well off this screen.
    const focus = focusFor({ lat: 42.31, lon: -83.71 }, close);
    expect(focus).not.toBeNull();
    expect(focus?.center).toEqual({ lat: 42.31, lon: -83.71 });
  });

  it('moves for a point technically visible but jammed against the edge', () => {
    // "On screen" and "visible" are different claims: a lot two pixels inside
    // the frame is under the status card or behind the sheet.
    const nearEdge = { lat: VIEW.north - 0.0002, lon: middle.lon };
    expect(nearEdge.lat).toBeLessThan(VIEW.north); // genuinely inside
    expect(focusFor(nearEdge, close)).not.toBeNull();
  });

  it('checks both axes, not just latitude', () => {
    expect(focusFor({ lat: middle.lat, lon: VIEW.west + 0.0002 }, close)).not.toBeNull();
    expect(focusFor({ lat: middle.lat, lon: VIEW.east - 0.0002 }, close)).not.toBeNull();
  });

  it('moves for a centred point when the map is too far out to identify it', () => {
    /*
     * The bug this file exists for. At the app's default zoom of 14.5 every lot
     * downtown is inside the frame, so a position-only test said "you can see
     * it" and the camera stayed — while on screen the selected lot changed by
     * two points of border and nothing else.
     */
    const cityScale = { zoom: 14.5, bounds: VIEW };
    const focus = focusFor(middle, cityScale);
    expect(focus).not.toBeNull();
    expect(focus?.zoom).toBe(FOCUS_ZOOM);
  });

  it('never zooms out from a closer view', () => {
    // Someone who has zoomed to one block and then taps a row for a lot two
    // streets away wants to arrive there, not to be pulled back to city scale.
    const focus = focusFor({ lat: 42.31, lon: -83.71 }, { zoom: 18, bounds: VIEW });
    expect(focus?.zoom).toBe(18);
  });

  it('does nothing when the renderer cannot say where it is looking', () => {
    // Apple Maps has no region until the first camera event. Driving a camera
    // whose position is unknown is how a map ends up in the Atlantic.
    expect(focusFor({ lat: 42.31, lon: -83.71 }, { zoom: 14, bounds: null })).toBeNull();
  });
});
