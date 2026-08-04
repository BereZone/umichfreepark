#!/usr/bin/env node
/**
 * Fetch U-M's own published coordinates for its parking lots.
 *
 * Source: the data behind the official campus map at
 * https://maps.studentlife.umich.edu — its parking layer is served from
 * https://apibuilder.studentlife.umich.edu/api/1/type/parking?limit=-1
 *
 * WHY WE WANT THIS
 *
 * LTP publishes the rules but no coordinates; OpenStreetMap has coordinates but
 * only for the lots someone has bothered to tag. Neither alone covers the
 * campus. This file is the bridge: a lot code paired with a point U-M itself
 * publishes, which build-umich-areas.mjs uses to find the OSM polygon that
 * contains it. A join on "the university says the lot is here, and exactly one
 * mapped parking area contains that point" is far stronger than a regex over a
 * name, and it found 22 lots the name join could never reach.
 *
 * WHY ONLY THE COORDINATES
 *
 * This endpoint also carries `enforcementhours` and a permit `type`, and we
 * deliberately throw both away. They disagree with LTP for 100 of the 104 lots
 * the two sources share. Some of that is formatting — "M-Sat. 6am-10pm" versus
 * "6am – 10 pm, Mon – Sat" — but some is substantive and dangerous:
 *
 *   C2   campus map "M-F 6am-6pm"    LTP "24 hrs, 7 days"
 *   W3   campus map "M-F 6am-6pm"    LTP "6am – 6pm, Mon – Sat"
 *   W9   campus map "M-F 6am-6pm"    LTP "6am – 5pm, Mon – Sat"
 *
 * Believing the campus map on W9 would tell a student the lot goes free at 5pm
 * on a Saturday when LTP says it does not. LTP is the parking authority and the
 * campus map is Student Life's directory of where things are; on rules, LTP
 * wins, and the honest way to hold that line is to not carry the other numbers
 * at all. A field that is not in the file cannot be read by mistake later.
 *
 * Geometry is the one thing this source is authoritative about, and a wrong
 * coordinate fails safe in a way a wrong hour does not: the join drops it.
 *
 * Usage:
 *   node scripts/fetch-umich-locations.mjs [--dry-run]
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'src/engine/data/umich-locations.json';

const API = 'https://apibuilder.studentlife.umich.edu/api/1/type/parking?limit=-1';
const HUMAN_PAGE = 'https://maps.studentlife.umich.edu/';

/** Ann Arbor, generously. A coordinate outside this is a data error, not a lot. */
const BOUNDS = { minLat: 42.2, maxLat: 42.4, minLon: -83.85, maxLon: -83.6 };

/** ~1 cm. Finer than any lot boundary, and keeps the file small. */
const round = (n) => Number(n.toFixed(6));

/** Lot codes as the campus map spells them: "NC 47", "M-22", "sc7". */
const normalizeCode = (raw) => String(raw ?? '').toUpperCase().replace(/[\s-]/g, '');

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log(`Fetching ${API}`);
  const response = await fetch(API, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} from ${API}`);
  const payload = await response.json();

  const pois = payload.pois;
  if (!Array.isArray(pois) || pois.length === 0) {
    // A shape change here must stop the build rather than quietly emit an empty
    // file, which would silently un-map every lot that depends on this join.
    throw new Error('Unexpected response: expected a non-empty `pois` array.');
  }

  const locations = [];
  const skipped = [];
  const seen = new Set();

  for (const poi of pois) {
    const input = poi.input ?? {};
    const lot = normalizeCode(input.lotnumber || input.lotname || poi.name);
    const lat = Number.parseFloat(input.lat);
    const lon = Number.parseFloat(input.lng);

    if (!lot) {
      skipped.push(`${poi.name ?? '(unnamed)'}: no lot code`);
      continue;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      skipped.push(`${lot}: no usable coordinate`);
      continue;
    }
    // Catches a lat/lon swap, which puts Ann Arbor in the Indian Ocean and is
    // the classic silent failure in any coordinate pipeline.
    if (
      lat < BOUNDS.minLat ||
      lat > BOUNDS.maxLat ||
      lon < BOUNDS.minLon ||
      lon > BOUNDS.maxLon
    ) {
      skipped.push(`${lot}: ${lat},${lon} is outside Ann Arbor`);
      continue;
    }
    if (seen.has(lot)) {
      skipped.push(`${lot}: duplicate, first kept`);
      continue;
    }

    seen.add(lot);
    // name and address travel with the point so a reviewer can tell which lot a
    // coordinate belongs to without cross-referencing. Hours and permit tier
    // are dropped on purpose — see the header.
    locations.push({
      lot,
      name: String(input.lotname ?? poi.name ?? lot),
      address: input.address && input.address !== 'NULL' ? String(input.address) : null,
      lat: round(lat),
      lon: round(lon),
    });
  }

  locations.sort((a, b) => a.lot.localeCompare(b.lot));

  console.log(`${locations.length} lots with a published coordinate.`);
  if (skipped.length) {
    console.log(`Skipped ${skipped.length}:`);
    for (const s of skipped) console.log(`  ${s}`);
  }

  const out = {
    _comment:
      'Generated by scripts/fetch-umich-locations.mjs. Coordinates only — enforcement hours and permit tier from this source are deliberately discarded; LTP is the authority on rules. Do not hand-edit.',
    source: HUMAN_PAGE,
    endpoint: API,
    generatedAt: new Date().toISOString().slice(0, 10),
    note: 'Used by build-umich-areas.mjs to find the OSM polygon containing each lot. Never used for rules.',
    locations,
  };

  if (dryRun) {
    console.log('--dry-run: nothing written.');
    return;
  }
  writeFileSync(path.join(ROOT, OUT), `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${OUT}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
