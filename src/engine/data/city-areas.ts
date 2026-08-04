/**
 * City of Ann Arbor parking areas — hand-tagged, one record per area.
 *
 * Hand-written on purpose. Every rate here was read off the authority's own
 * page on the date in `lastVerified`, and every polygon was matched to an OSM
 * feature by name AND by checking the centroid against the facility's street
 * address. Nothing in this file was inferred from OSM's own `fee` tags, which
 * are frequently stale — see docs/data-sources.md.
 *
 * Rates last raised 2026-07-01.
 */

import type { ParkingArea } from '../types';

const DDA_RATES = 'https://www.a2dda.org/parking-rates/';
const A2GOV_PARKING = 'https://www.a2gov.org/services/parking/';

const VERIFIED = {
  lastVerified: '2026-08-03',
  source: DDA_RATES,
  confidence: 'verified',
} as const;

/** $1.80/hr, every DDA structure, verified 2026-08-03 off the DDA rates page. */
const STRUCTURE_RATE = { kind: 'hourly', centsPerHour: 180 } as const;

/** $2.60/hr for surface lots — a different rate from structures, easily confused. */
const LOT_RATE = { kind: 'hourly', centsPerHour: 260 } as const;

export const CITY_AREAS: ParkingArea[] = [
  // --- DDA structures ------------------------------------------------------
  // All free Sunday 4am -> Monday 4am. Holiday status is unknown; see the
  // open question in docs/data-sources.md.
  {
    id: 'ann-ashley',
    name: 'Ann & Ashley Structure',
    authority: 'city-structure',
    kind: 'structure',
    osmId: 'way/30838959',
    rate: STRUCTURE_RATE,
    provenance: VERIFIED,
  },
  {
    id: 'fourth-washington',
    name: 'Fourth & Washington Structure',
    authority: 'city-structure',
    kind: 'structure',
    osmId: 'way/30839085',
    rate: STRUCTURE_RATE,
    provenance: VERIFIED,
  },
  {
    id: 'fourth-william',
    name: 'Fourth & William Structure',
    authority: 'city-structure',
    kind: 'structure',
    osmId: 'way/30839105',
    rate: STRUCTURE_RATE,
    provenance: VERIFIED,
  },
  {
    id: 'library-lane',
    name: 'Library Lane Structure',
    authority: 'city-structure',
    kind: 'structure',
    osmId: 'way/30839120',
    rate: {
      kind: 'hourly',
      centsPerHour: 180,
      // Verbatim from PCI: "$1.80 per hour- Max $5.00. After 3PM M-F. All Day
      // Saturday. Must exit by 6AM the following day or normal rates apply."
      //
      // Both conditions are load-bearing. The cap depends on when you ARRIVE,
      // so it must not be applied to a car that entered at noon; and the exit
      // condition voids it entirely, so the note has to say so rather than
      // just advertising "$5 cap".
      cap: {
        cents: 500,
        note: '$5 max if you arrive after 3pm on a weekday or any time Saturday — you must exit by 6am',
        windows: [
          { kind: 'daily', days: [1, 2, 3, 4, 5], start: 15 * 60, end: 24 * 60 },
          { kind: 'daily', days: [6], start: 0, end: 24 * 60 },
        ],
      },
    },
    provenance: VERIFIED,
    note: 'Cheapest downtown option after 3pm, as long as you are out by 6am.',
  },
  {
    id: 'maynard',
    name: 'Maynard Structure',
    authority: 'city-structure',
    kind: 'structure',
    osmId: 'way/30839161',
    rate: STRUCTURE_RATE,
    provenance: VERIFIED,
    note: 'Closest structure to central campus.',
  },
  {
    id: 'liberty-square',
    name: 'Liberty Square Structure',
    authority: 'city-structure',
    kind: 'structure',
    osmId: 'way/30839192',
    rate: STRUCTURE_RATE,
    provenance: VERIFIED,
  },
  {
    id: 'forest',
    name: 'Forest Structure',
    authority: 'city-structure',
    kind: 'structure',
    osmId: 'way/30839268',
    rate: STRUCTURE_RATE,
    provenance: VERIFIED,
    note: 'Closest structure to South University and the Hill dorms.',
  },

  // --- City surface lots ---------------------------------------------------
  {
    id: 'south-ashley-lot',
    name: 'South Ashley Lot',
    authority: 'city-structure',
    kind: 'lot',
    osmId: 'way/30839328',
    rate: LOT_RATE,
    provenance: VERIFIED,
  },
  {
    id: 'first-william-lot',
    name: 'First & William Lot',
    authority: 'city-structure',
    kind: 'lot',
    osmId: 'way/495081613',
    // Resolved 2026-08-04. PCI's page listed only monthly parking, which hinted
    // at permit-only but did not say it, so this shipped with no rate. The
    // city's own GIS settles it: the DDA lot layer tags this one
    // `TypeOfParking: "Permit Only"` while every other lot in the layer is
    // "Hourly". That is the operator's own record, so it is verified now.
    //
    // The address disagreement stands (PCI says 300 First St; the DDA FAQ says
    // 216 W. William) but no longer affects what a user is told.
    rate: { kind: 'permit-only' },
    provenance: {
      lastVerified: '2026-08-04',
      source:
        'https://a2-mi.maps.arcgis.com/home/item.html?id=d62a590c5155496680dfa8d3f129f185',
      confidence: 'verified',
    },
    note: 'Permit only — there is no hourly rate to buy here.',
  },

  // --- On-street meters ----------------------------------------------------
  // The general downtown meter district lives in meter-lots.ts, because its
  // geometry is generated from the city's GIS. What stays here is the one
  // on-street set the city names block by block.
  {
    id: 'half-price-meters',
    name: 'Half-price meters',
    authority: 'city-meter',
    kind: 'meter-zone',
    osmId: null,
    // $1.30/hr with a 10-hour limit, on five named blocks: the 300 block of
    // S. First, the 300 and 400 blocks of N. Ashley, the 300 block of
    // W. William, the 400 block of S. Ashley, and the 700 block of Packard.
    rate: { kind: 'hourly', centsPerHour: 130 },
    provenance: {
      lastVerified: '2026-08-03',
      source: A2GOV_PARKING,
      confidence: 'verified',
    },
    note: 'Half price with a 10-hour limit, on five blocks near the edge of downtown.',
  },
];
