/**
 * The city's metered surface lots, plus the downtown on-street meter district.
 *
 * WHY THESE ARE NOT IN city-areas.ts
 *
 * That file is hand-written because each record there carries a rate someone
 * read off a page. These carry the same one rate as each other and get their
 * geometry from the city's GIS, so hand-copying nine polygons would only create
 * something to drift. See scripts/fetch-dda-parking.mjs.
 *
 * WHY A METER LOT IS NOT A DDA LOT
 *
 * Both cost $2.60/hr, which makes them look interchangeable and they are not.
 * A gated DDA lot bills continuously and is free only Sunday 4am to Monday 4am.
 * A meter lot is enforced Monday–Saturday 8am–6pm and is free every evening.
 * At 7pm on a Tuesday one of them costs money and the other does not, and that
 * is the single most useful thing this app can tell someone downtown.
 *
 * The split is sourced, not inferred: PCI operates the meters and publishes
 * which lots are on them.
 */

import type { ParkingArea } from '../types';
import ddaParking from './dda-parking.json';

const A2GOV_PARKING = 'https://www.a2gov.org/services/parking/';
const PCI_METER_LOTS = 'https://pcia2.com/meter-lot-locations/';

/** Same $2.60/hr as the surface lots — the schedule is what differs. */
const METER_RATE = { kind: 'hourly', centsPerHour: 260 } as const;

export const METER_LOT_AREAS: ParkingArea[] = ddaParking.meterLots.map((lot) => ({
  id: lot.id,
  // PCI names some of these "… Lot" already and some not.
  name: lot.name.endsWith('Lot') ? lot.name : `${lot.name} Lot`,
  authority: 'city-meter' as const,
  kind: 'lot' as const,
  // Not an OSM feature. The polygon is the city's own, and is joined by area id
  // in area-polygons.json like every other shape.
  osmId: null,
  rate: METER_RATE,
  provenance: {
    lastVerified: ddaParking.generatedAt,
    source: PCI_METER_LOTS,
    confidence: 'verified' as const,
  },
  note:
    `Meter lot — free evenings after 6pm, all day Sunday, and on city holidays. ` +
    `${lot.accessibleSpaces ?? 0} accessible ${lot.accessibleSpaces === 1 ? 'space' : 'spaces'}.`,
}));

/**
 * The downtown on-street meter district, as one area.
 *
 * NO AUTHORITY PUBLISHES A BLOCK-BY-BLOCK METER INVENTORY. Not the city's open
 * data, not its GIS portal, not the DDA, not PCI. OpenStreetMap does not have
 * it either — its Ann Arbor street-parking tags are almost entirely "no parking
 * here", with nothing on Maynard, State, or Liberty.
 *
 * So this ships as the district boundary the city does publish, and says so.
 * The alternative was to invent a plausible list of metered blocks, which would
 * look exactly like a sourced one and would eventually put someone in front of
 * a "no parking" sign holding a phone that said otherwise.
 *
 * The two rates below are genuinely different areas, not one area with a
 * footnote, because the half-price blocks ARE named by the city.
 */
export const ON_STREET_METER_AREA: ParkingArea = {
  id: 'downtown-meters',
  name: 'Downtown on-street meters',
  authority: 'city-meter',
  kind: 'meter-zone',
  osmId: null,
  rate: METER_RATE,
  provenance: {
    lastVerified: ddaParking.generatedAt,
    source: A2GOV_PARKING,
    confidence: 'verified',
  },
  note: 'Free evenings after 6pm, all day Sunday, and on city holidays. This outline is the DDA parking district, not a map of individual meters — the city does not publish one, so check the sign on your block.',
};
