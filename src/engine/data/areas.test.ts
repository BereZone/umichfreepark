import { describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { statusAt } from '../rules';
import { AREAS, MAPPABLE_AREAS, areaById } from './areas';

// Read rather than import: the extension is .geojson, which the bundler does
// not treat as JSON, and renaming it would obscure what the file is.
const osmParking = JSON.parse(
  readFileSync(path.join(process.cwd(), 'data/raw/osm-parking.geojson'), 'utf8')
);

const utc = (iso: string) => new Date(iso);

describe('the area dataset', () => {
  it('has both authorities represented', () => {
    const authorities = new Set(AREAS.map((a) => a.authority));
    expect(authorities).toContain('city-structure');
    expect(authorities).toContain('city-meter');
    expect(authorities).toContain('umich');
  });

  it('has no duplicate ids', () => {
    const ids = AREAS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('carries provenance on every record', () => {
    for (const area of AREAS) {
      expect(area.provenance.source, area.id).toMatch(/^https:\/\//);
      expect(area.provenance.lastVerified, area.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(['verified', 'community']).toContain(area.provenance.confidence);
    }
  });

  it('resolves every osmId to a real polygon', () => {
    const known = new Set(
      (osmParking as { features: { properties: { osm_id: string } }[] }).features.map(
        (f) => f.properties.osm_id
      )
    );
    for (const area of MAPPABLE_AREAS) {
      expect(known.has(area.osmId!), `${area.id} -> ${area.osmId}`).toBe(true);
    }
  });

  it('ships an area without a polygon rather than dropping it', () => {
    // Most U-M lots are not named in OpenStreetMap, so most of the dataset has
    // no geometry. That is a mapping gap, not a reason to withhold the rules —
    // an earlier version let OSM decide whether a lot existed at all and
    // silently hid 160 lots whose hours we had verified.
    const unmapped = AREAS.filter((a) => a.osmId === null);
    expect(unmapped.length).toBeGreaterThan(100);

    for (const area of unmapped) {
      // Only two things may legitimately lack a polygon: a meter zone, which is
      // a grouping rather than a place, and a U-M lot nobody has drawn yet.
      expect(area.kind === 'meter-zone' || area.authority === 'umich', area.id).toBe(true);
      // Whatever the reason, it still carries everything the list needs.
      expect(area.rate, area.id).toBeDefined();
      expect(area.provenance.source, area.id).toMatch(/^https:\/\//);
      expect(area.name, area.id).toBeTruthy();
    }
  });

  it('keeps the map to the areas it can actually draw', () => {
    expect(MAPPABLE_AREAS.length).toBeGreaterThan(50);
    expect(MAPPABLE_AREAS.every((a) => a.osmId !== null)).toBe(true);
    expect(MAPPABLE_AREAS.length).toBeLessThan(AREAS.length);
  });
});

describe('rates', () => {
  it('prices structures at $1.80/hr and lots at $2.60/hr — they are different', () => {
    const maynard = areaById.get('maynard')!;
    const ashley = areaById.get('south-ashley-lot')!;
    expect(maynard.rate).toEqual({ kind: 'hourly', centsPerHour: 180 });
    expect(ashley.rate).toEqual({ kind: 'hourly', centsPerHour: 260 });
  });

  it('keeps money in whole cents so the arithmetic stays exact', () => {
    for (const area of AREAS) {
      if (area.rate.kind === 'hourly') {
        expect(Number.isInteger(area.rate.centsPerHour), area.id).toBe(true);
        expect(area.rate.cap ? Number.isInteger(area.rate.cap.cents) : true).toBe(true);
      }
    }
    // Three hours at Library Lane is exactly $5.40 before the cap applies.
    const lane = areaById.get('library-lane')!;
    if (lane.rate.kind !== 'hourly') throw new Error('expected hourly');
    expect(lane.rate.centsPerHour * 3).toBe(540);
  });

  it('does not invent a rate for the lot we could not source', () => {
    const first = areaById.get('first-william-lot')!;
    expect(first.rate.kind).toBe('unknown');
    expect(first.provenance.confidence).toBe('community');
    expect(first.note).toMatch(/check the sign/i);
  });

  it('treats U-M lots as permit-only rather than free', () => {
    // "permit-only" and "free" must not collapse: during enforcement there is
    // no hourly option to buy, which is a different fact from costing nothing.
    const blue = AREAS.find((a) => a.authority === 'umich' && a.permitTier === 'Blue')!;
    expect(blue.rate.kind).toBe('permit-only');
  });

  it('marks the park-and-ride free, because it genuinely is', () => {
    const parkRide = AREAS.find((a) => a.permitTier === 'Park & Ride')!;
    expect(parkRide.rate.kind).toBe('free');
  });
});

describe('schedules resolve to real behaviour', () => {
  it('parsed a schedule for every U-M lot whose hours are published', () => {
    const umich = AREAS.filter((a) => a.authority === 'umich');
    expect(umich.length).toBeGreaterThan(200);

    const noSchedule = umich.filter((a) => a.schedule === null);
    // Four lots out of 240-odd: three docks LTP prints "NA" for, and the one
    // cell that packs two schedules together. Both refusals are deliberate and
    // live in enforcement.test.ts; this is the ceiling that catches a parser
    // regression turning into a quietly larger number.
    expect(noSchedule.length).toBeLessThanOrEqual(4);
  });

  it('treats an unparseable lot as enforced, never as free', () => {
    // The asymmetry that governs this whole app: wrongly saying "pay" costs a
    // walk to another lot, wrongly saying "free" costs a $70 ticket. A lot we
    // could not read must fall to the expensive-looking side.
    const noSchedule = AREAS.filter((a) => a.authority === 'umich' && a.schedule === null);
    expect(noSchedule.length).toBeGreaterThan(0);
    for (const area of noSchedule) {
      // Sunday afternoon — when almost everything else in the app is free.
      const status = statusAt(area.authority, area.schedule, utc('2026-08-09T18:00:00Z'));
      expect(status.paid, area.id).toBe(true);
      // And it must not pretend to be sure about it.
      expect(status.certain, area.id).toBe(false);
    }
  });

  it('makes downtown structures free on a Sunday afternoon', () => {
    const maynard = areaById.get('maynard')!;
    expect(statusAt(maynard.authority, maynard.schedule, utc('2026-08-09T18:00:00Z')).paid).toBe(
      false
    );
  });

  it('keeps 24/7 U-M lots paid even on a Sunday afternoon', () => {
    const always = AREAS.filter(
      (a) => a.authority === 'umich' && a.note?.includes('24 hrs, 7 days')
    );
    expect(always.length).toBeGreaterThan(0);
    for (const area of always) {
      expect(statusAt(area.authority, area.schedule, utc('2026-08-09T18:00:00Z')).paid, area.id).toBe(
        true
      );
    }
  });

  it('opens weekday-only U-M lots to the public on a Saturday', () => {
    const weekday = AREAS.filter(
      (a) => a.authority === 'umich' && a.note?.includes('6am – 5pm, Mon – Fri')
    );
    expect(weekday.length).toBeGreaterThan(20);
    for (const area of weekday.slice(0, 5)) {
      expect(statusAt(area.authority, area.schedule, utc('2026-08-08T18:00:00Z')).paid, area.id).toBe(
        false
      );
    }
  });

  it('shows the posted string so a user can check it against the sign', () => {
    const umich = AREAS.filter((a) => a.authority === 'umich');
    for (const area of umich) {
      // Either we quote LTP's cell verbatim, or — for the handful of docks LTP
      // prints "NA" for — we say plainly that no hours are published. What must
      // never happen is echoing "NA" back at the user as if it were a schedule.
      expect(area.note, area.id).toMatch(/^(Posted enforcement: |U-M does not publish)/);
      expect(area.note, area.id).not.toMatch(/^Posted enforcement: NA/i);
    }
  });
});
