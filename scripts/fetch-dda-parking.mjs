#!/usr/bin/env node
/**
 * Fetch the city's own DDA parking geometry into src/engine/data/dda-parking.json.
 *
 * WHAT THIS ADDS THAT OSM CANNOT
 *
 * OpenStreetMap knows where parking lots are; it does not know which of them
 * Ann Arbor runs on meters. That distinction is the whole answer to "can I park
 * here for free at 7pm" — a metered lot is free evenings and Sundays, a gated
 * lot is not — and getting it wrong in the free direction costs a student a
 * ticket. So the metered set comes from the operator, not from a map.
 *
 * TWO AUTHORITIES, EACH FOR WHAT IT ACTUALLY KNOWS
 *
 *   PCI (pcia2.com)      operates the meters. Its "Meter Lot Locations" map is
 *                        the published list of WHICH lots are metered.
 *   City ArcGIS          publishes the DDA lot polygons with names and space
 *                        counts. This is WHERE they are.
 *
 * Neither alone is enough, so the two are joined.
 *
 * WHY THE JOIN IS A HAND-WRITTEN TABLE
 *
 * A nearest-centroid join looks obvious and is wrong here: Broadway Bridge and
 * Depot Street are adjacent riverside lots, and proximity matching puts PCI's
 * "Depot Lot" on the Broadway Bridge polygon. Four of the nine pairs are
 * ambiguous by distance. Nine records is small enough to state explicitly and
 * review by eye, so the correspondence is written out below and the script
 * fails if either side stops matching it.
 *
 * The DDA parking-area boundary comes along too. It is the sourced answer to
 * "where downtown are there on-street meters at all" — no authority publishes a
 * block-by-block meter inventory, so the district is as fine as we can honestly
 * go. See docs/data-sources.md.
 *
 * Usage:
 *   node scripts/fetch-dda-parking.mjs [--dry-run]
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'src/engine/data/dda-parking.json';

/** ~1 cm at this latitude, far finer than a painted lot edge. */
const DECIMALS = 6;
const round = (n) => Number(n.toFixed(DECIMALS));

const PCI_MARKERS = 'https://pcia2.com/wp-json/wpgmza/v1/markers';
const PCI_PAGE = 'https://pcia2.com/meter-lot-locations/';

/**
 * PCI publishes two maps from one endpoint. Map 1 is the gated structures and
 * lots; map 2 is the meter lots. The map id is the only thing distinguishing
 * them, and it is the bit that decides which enforcement schedule applies.
 */
const PCI_METER_MAP_ID = '2';

const ARCGIS_LOTS =
  'https://utility.arcgis.com/usrsvcs/servers/6e0d3db35a904593b35cbc50e05a9f05/rest/services/DDA/DDAParkingAreaView/FeatureServer/1';
const ARCGIS_AREA =
  'https://utility.arcgis.com/usrsvcs/servers/aa878be2c27642f5b066a4caaed4df29/rest/services/DDA/DDAParkingAreaView/FeatureServer/3';
const ARCGIS_ITEM =
  'https://a2-mi.maps.arcgis.com/home/item.html?id=d62a590c5155496680dfa8d3f129f185';

const geojsonQuery = (base) => `${base}/query?where=1%3D1&outFields=*&outSR=4326&f=geojson`;

/**
 * PCI's marker title -> the city's LotName, with the id MFreePark will use.
 *
 * Every pair was checked against PCI's posted street address and the city
 * polygon's location. The two that do not look alike are the two worth
 * explaining:
 *
 *   Palio Lot        PCI gives 353 S Main St; the city calls the same rectangle
 *                    "S Main and E William". Centroids are 5 m apart.
 *   Depot Lot        PCI gives 325 Depot St. The city's "Depot Street" polygon,
 *                    NOT the adjacent "Broadway Bridge" one that happens to sit
 *                    closer to PCI's dropped pin.
 */
const METER_LOTS = [
  { id: 'palio-lot', pci: 'Palio Lot', lotName: 'S Main and E William' },
  { id: 'main-ann-lot', pci: 'Main & Ann', lotName: 'N Main and W Ann' },
  { id: 'city-hall-lot', pci: 'City Hall', lotName: 'City Hall' },
  { id: 'community-high-lot', pci: 'Community High', lotName: 'Community High' },
  { id: 'farmers-market-lot', pci: "Farmer's Market", lotName: 'Farmers Market' },
  { id: 'kerrytown-lot', pci: 'Kerrytown', lotName: 'Kerrytown Shops' },
  { id: 'gandy-dancer-lot', pci: 'Gandy Dancer Lot', lotName: 'Gandy Dancer' },
  { id: 'broadway-bridge-lot', pci: 'Broadway Bridge', lotName: 'Broadway Bridge' },
  { id: 'depot-lot', pci: 'Depot Lot', lotName: 'Depot Street' },
];

/** WordPress escapes ampersands in marker titles; the city's names do not. */
const decode = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;/g, "'")
    .replace(/&#8217;/g, '’')
    .replace(/\s+/g, ' ')
    .trim();

async function getJson(url, label) {
  const res = await fetch(url, { headers: { 'User-Agent': 'mfreepark-dda-parking/1.0' } });
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  return res.json();
}

/** Largest outer ring; the rest of a multipolygon are slivers too small to tap. */
function ringsFor(geometry) {
  if (geometry.type === 'Polygon') return geometry.coordinates;
  const area = (rings) => {
    let sum = 0;
    const r = rings[0];
    for (let i = 0; i < r.length; i++) {
      const [x1, y1] = r[i];
      const [x2, y2] = r[(i + 1) % r.length];
      sum += (x2 - x1) * (y2 + y1);
    }
    return Math.abs(sum / 2);
  };
  return geometry.coordinates.reduce((best, p) => (area(p) > area(best) ? p : best), geometry.coordinates[0]);
}

const roundRings = (geometry) =>
  ringsFor(geometry).map((ring) => ring.map(([lon, lat]) => [round(lon), round(lat)]));

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('Fetching PCI meter-lot markers...');
  const markers = await getJson(PCI_MARKERS, 'PCI markers');
  const pciMeterTitles = new Set(
    markers.filter((m) => String(m.map_id) === PCI_METER_MAP_ID).map((m) => decode(m.title))
  );
  console.log(`  ${pciMeterTitles.size} lots on PCI's meter map.`);

  console.log('Fetching city DDA lot polygons...');
  const lotsGeo = await getJson(geojsonQuery(ARCGIS_LOTS), 'DDA lots');
  const byLotName = new Map(
    lotsGeo.features.map((f) => [decode(f.properties.LotName ?? ''), f])
  );
  console.log(`  ${byLotName.size} city lot polygons.`);

  console.log('Fetching DDA parking-area boundary...');
  const areaGeo = await getJson(geojsonQuery(ARCGIS_AREA), 'DDA area');
  if (areaGeo.features.length !== 1) {
    throw new Error(`Expected exactly one DDA parking area, got ${areaGeo.features.length}.`);
  }

  // Both halves of the table must still hold. If PCI adds a meter lot or the
  // city renames a polygon, that is a data change someone has to look at — not
  // something to paper over by silently shipping fewer lots.
  const problems = [];
  for (const { pci, lotName } of METER_LOTS) {
    if (!pciMeterTitles.has(pci)) problems.push(`PCI no longer lists a meter lot named "${pci}"`);
    if (!byLotName.has(lotName)) problems.push(`City has no lot polygon named "${lotName}"`);
  }
  const mapped = new Set(METER_LOTS.map((m) => m.pci));
  for (const title of pciMeterTitles) {
    if (!mapped.has(title)) problems.push(`PCI lists meter lot "${title}" with no entry in METER_LOTS`);
  }
  if (problems.length) {
    throw new Error(
      `The PCI/city correspondence no longer holds:\n  ${problems.join('\n  ')}\n` +
        'Update METER_LOTS deliberately rather than loosening the check.'
    );
  }

  const meterLots = METER_LOTS.map(({ id, pci, lotName }) => {
    const feature = byLotName.get(lotName);
    const p = feature.properties;
    return {
      id,
      name: pci,
      cityLotName: lotName,
      // NumberOfSpaces exists in the schema but is empty for every lot, so it
      // is not carried — an always-null field reads like missing data rather
      // than like a column the city never filled in.
      accessibleSpaces: p.AccessibleSpaces ?? null,
      typeOfParking: p.TypeOfParking ?? null,
      rings: roundRings(feature.geometry),
    };
  });

  // The city also publishes which lots are permit-only. That is worth carrying
  // out even for lots MFreePark models from elsewhere, because it settles questions
  // no prose page answers.
  const lotTypes = lotsGeo.features
    .map((f) => ({
      lotName: decode(f.properties.LotName ?? ''),
      typeOfParking: f.properties.TypeOfParking ?? null,
    }))
    .sort((a, b) => a.lotName.localeCompare(b.lotName));

  const out = {
    _comment:
      'Generated by scripts/fetch-dda-parking.mjs. Do not hand-edit; see docs/data-sources.md.',
    generatedAt: new Date().toISOString().slice(0, 10),
    sources: {
      meterLotList: PCI_PAGE,
      meterLotData: PCI_MARKERS,
      lotPolygons: ARCGIS_LOTS,
      parkingArea: ARCGIS_AREA,
      arcgisItem: ARCGIS_ITEM,
    },
    note: 'Which lots are metered comes from PCI, who operate the meters. Where they are comes from the city GIS. The join between them is a hand-written table in the script.',
    meterLots,
    lotTypes,
    ddaArea: { rings: roundRings(areaGeo.features[0].geometry) },
  };

  const json = `${JSON.stringify(out, null, 2)}\n`;
  console.log(`\n${meterLots.length} meter lots, ${lotTypes.length} lot types, DDA area with ${out.ddaArea.rings[0].length} vertices.`);
  console.log(`${(json.length / 1024).toFixed(1)} KB`);
  for (const l of meterLots) {
    console.log(`  ${l.id.padEnd(20)} ${l.name} (${l.accessibleSpaces ?? 0} accessible)`);
  }

  if (dryRun) {
    console.log('--dry-run: nothing written.');
    return;
  }
  writeFileSync(path.join(ROOT, OUT), json, 'utf8');
  console.log(`Wrote ${OUT}`);
}

await main();
