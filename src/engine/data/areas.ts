/**
 * Every parkable area CURB knows about, as one typed list.
 *
 * Two sources feed this, and they are shaped differently on purpose:
 *
 *   city-areas.ts     hand-written. A dozen areas, each carrying a rate a
 *                     human read off the authority's page.
 *   umich-areas.json  generated. Every lot LTP publishes, joined to an OSM
 *                     polygon by lot code where one exists, because the
 *                     underlying LTP table is regenerated every August and
 *                     hand-copies would drift.
 *
 * A lot without a polygon still ships. Rules exist independently of geometry:
 * the map cannot draw it, but the list can state its hours, and that is what
 * stops someone standing in front of a lot wondering.
 *
 * The enforcement schedule is parsed once here, at module load, rather than on
 * every clock tick — `parseEnforcementHours` is pure and the result is
 * immutable, so there is no reason to redo it hundreds of times a second.
 */

import { parseEnforcementHours, type EnforcementSchedule } from '../enforcement';
import { CITY_METER_SCHEDULE, CITY_STRUCTURE_SCHEDULE } from '../rules';
import type { ParkingArea, Rate } from '../types';
import { CITY_AREAS } from './city-areas';
import umichAreas from './umich-areas.json';

/** An area with its schedule resolved, which is what the engine actually consumes. */
export interface ResolvedArea extends ParkingArea {
  /** null means the published hours could not be parsed — treated as enforced. */
  schedule: EnforcementSchedule | null;
}

const LTP_ENFORCEMENT = 'https://ltp.umich.edu/parking/locations-and-enforcement/';

/**
 * What a U-M lot costs someone without a permit.
 *
 * Outside enforcement hours the lot is free to the public — that is LTP's own
 * campus-wide rule and the reason this app can recommend U-M lots at all.
 * Inside enforcement hours there is no hourly option to buy: you either hold
 * the permit or you get a ticket. `permit-only` says exactly that, and is
 * deliberately not the same value as `free`.
 */
function umichRate(tier: string | null): Rate {
  // Park & Ride lots are free to anyone with no permit at any hour — LTP
  // states "free parking (no permit required)" on the Free Parking page.
  if (tier === 'Park & Ride') return { kind: 'free' };
  // No published tier still means permit-only during enforcement. About a
  // third of LTP's rows are service docks and loading bays with no permit
  // colour; "no colour" is not "open to anyone".
  return { kind: 'permit-only' };
}

/**
 * What to tell a user about a lot's published hours.
 *
 * LTP prints a literal "NA" for a few service docks — that is the table
 * declining to state hours, not a string we failed to read. Echoing it back as
 * "Posted enforcement: NA" reads like a rendering bug, so say what it means.
 * Every lot that does have a posted string still shows it verbatim: LTP's own
 * pages say the sign at the entrance is the authority, and surfacing the string
 * we parsed is what lets someone check our reading against that sign.
 */
function postedNote(hours: string): string {
  if (/^n\s*\/?\s*a$/i.test(hours.trim())) {
    return 'U-M does not publish enforcement hours for this lot. Assume a permit is required and check the sign.';
  }
  return `Posted enforcement: ${hours}.`;
}

const CITY_SCHEDULES: Record<string, EnforcementSchedule> = {
  'city-meter': CITY_METER_SCHEDULE,
  'city-structure': CITY_STRUCTURE_SCHEDULE,
};

const resolvedCity: ResolvedArea[] = CITY_AREAS.map((area) => ({
  ...area,
  schedule: CITY_SCHEDULES[area.authority] ?? null,
}));

const resolvedUmich: ResolvedArea[] = umichAreas.areas.map((lot) => ({
  id: lot.id,
  name: `${lot.name} (${lot.lot})`,
  authority: 'umich' as const,
  kind: 'lot' as const,
  // null when nobody has named this lot in OpenStreetMap yet. It still ships:
  // the list can show its rules, only the map cannot draw it.
  osmId: lot.osmId,
  rate: umichRate(lot.permitTier),
  // Absent tier stays absent rather than becoming a guessed colour.
  permitTier: lot.permitTier ?? undefined,
  schedule: parseEnforcementHours(lot.enforcementHours),
  provenance: {
    lastVerified: umichAreas.generatedAt,
    source: LTP_ENFORCEMENT,
    confidence: 'verified' as const,
  },
  note: postedNote(lot.enforcementHours),
}));

export const AREAS: ResolvedArea[] = [...resolvedCity, ...resolvedUmich];

export const areaById = new Map(AREAS.map((a) => [a.id, a]));

/** Areas whose polygon we know, i.e. those the map can actually draw. */
export const MAPPABLE_AREAS = AREAS.filter((a) => a.osmId !== null);
