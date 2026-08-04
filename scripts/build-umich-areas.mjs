#!/usr/bin/env node
/**
 * Join U-M lots to their OSM polygons and emit src/engine/data/umich-areas.json.
 *
 * WHY GENERATED RATHER THAN HAND-TAGGED
 *
 * The city areas in city-areas.ts are hand-written, because there are a dozen
 * of them and each carries a rate someone had to read off a page. U-M is the
 * opposite shape: 150 lots whose rules come from a table that is itself
 * regenerated every August, and whose only per-lot fact is an enforcement
 * window we already parse. Hand-copying those would guarantee drift the first
 * time LTP changes a lot's hours.
 *
 * THE JOIN, AND WHY IT IS SAFE
 *
 * OSM names U-M lots with their official codes ("UM Lot SC7 / RV Lot",
 * "U of M Lot NC 47"). We extract the code and look it up in the LTP table.
 * A regex join could produce false matches, so every match is checked against
 * the campus LTP assigns it to: a lot the table calls North Campus whose
 * polygon sits on Ross Athletic is a bad join and is dropped, not shipped.
 *
 * Two lots legitimately fall outside their campus envelope and are allowlisted
 * below with the address that justifies them.
 *
 * Usage:
 *   node scripts/build-umich-areas.mjs [--dry-run]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

const OUT = 'src/engine/data/umich-areas.json';

/**
 * Lots whose polygon is genuinely far from the campus LTP files them under.
 * Each needs the address that justifies it, so this cannot become a dumping
 * ground for bad joins.
 */
const ENVELOPE_EXCEPTIONS = {
  EC1: 'EMC Gravel Lot, 4442 Plymouth Rd — East Medical Campus, remote from the hospital core.',
  SC34: 'State Street Commuter lot, S. State St — the park-and-ride, south of the athletic campus.',
};

/** Lot codes as OSM spells them: "SC7", "NC 47", "M-22". */
const LOT_CODE = /\b((?:NC|SC|NW|EC|M|N|S|W|E|C)\s?-?\d{1,3})\b/;

function centroid(feature) {
  const ring =
    feature.geometry.type === 'Polygon'
      ? feature.geometry.coordinates[0]
      : feature.geometry.coordinates[0][0];
  // Skip the repeated closing vertex; see src/geo/polygons.ts.
  const closed =
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1];
  const pts = closed ? ring.slice(0, -1) : ring;
  let x = 0;
  let y = 0;
  for (const [lon, lat] of pts) {
    x += lon;
    y += lat;
  }
  return [y / pts.length, x / pts.length];
}

/** Bounding box of each campus, derived from the building dataset. */
function campusEnvelopes(buildings) {
  const env = {};
  for (const b of buildings) {
    const e = (env[b.campus] ??= {
      minLat: Infinity,
      maxLat: -Infinity,
      minLon: Infinity,
      maxLon: -Infinity,
    });
    e.minLat = Math.min(e.minLat, b.lat);
    e.maxLat = Math.max(e.maxLat, b.lat);
    e.minLon = Math.min(e.minLon, b.lon);
    e.maxLon = Math.max(e.maxLon, b.lon);
  }
  return env;
}

// LTP's campus names vs the building dataset's.
const CAMPUS_ALIAS = { central: 'central', medical: 'medical', north: 'north', 'ross-athletic': 'south' };

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const geo = read('data/raw/osm-parking.geojson');
  const lots = read('src/engine/data/umich-lots.json');
  const buildings = read('src/engine/data/buildings.json').buildings;

  const table = new Map();
  for (const campus of lots.campuses) {
    for (const lot of campus.lots) {
      // M18 appears twice in LTP's own Medical table; first wins, and both
      // rows are 24/7 Visitor so the choice cannot change an answer.
      if (!table.has(lot.lot)) table.set(lot.lot, { ...lot, campus: campus.campus });
    }
  }

  const env = campusEnvelopes(buildings);
  const PAD = 0.015; // ~1.6 km, enough to cover lots at a campus edge.

  /**
   * Index OSM features by lot code first, so the join runs FROM the LTP table.
   *
   * The direction matters. An earlier version iterated OSM features and emitted
   * a lot only when a polygon carried its code, which meant OSM decided whether
   * a lot existed at all — 85 lots with published, verified enforcement hours
   * were silently absent from the app because nobody had named them in OSM.
   *
   * Rules exist independently of geometry. A lot with no polygon cannot be
   * drawn on the map, but it can absolutely be listed with its hours, and being
   * listed is what stops a student standing in front of it wondering.
   */
  const polygonByCode = new Map();
  const rejected = [];

  for (const feature of geo.features) {
    const name = feature.properties.name;
    if (!name) continue;
    const match = LOT_CODE.exec(name.toUpperCase().replace(/\s+/g, ' '));
    if (!match) continue;
    const code = match[1].replace(/[\s-]/g, '');
    const lot = table.get(code);
    if (!lot || polygonByCode.has(code)) continue;

    const [lat, lon] = centroid(feature);
    const e = env[CAMPUS_ALIAS[lot.campus]];
    const inside =
      e &&
      lat > e.minLat - PAD &&
      lat < e.maxLat + PAD &&
      lon > e.minLon - PAD &&
      lon < e.maxLon + PAD;

    if (!inside && !ENVELOPE_EXCEPTIONS[code]) {
      rejected.push(
        `${code}: polygon at ${lat.toFixed(4)},${lon.toFixed(4)} is outside ${lot.campus} — "${name}"`
      );
      continue;
    }
    polygonByCode.set(code, { osmId: feature.properties.osm_id, osmName: name });
  }

  // Every lot in the table ships. Geometry is an attribute, not a gate.
  const areas = [];
  for (const [code, lot] of table) {
    const polygon = polygonByCode.get(code) ?? null;
    areas.push({
      id: `umich-${code.toLowerCase()}`,
      name: lot.name || polygon?.osmName || code,
      lot: code,
      campus: lot.campus,
      osmId: polygon?.osmId ?? null,
      permitTier: lot.tier ?? null,
      enforcementHours: lot.enforcementHours,
      address: lot.address || null,
      ...(ENVELOPE_EXCEPTIONS[code] ? { envelopeException: ENVELOPE_EXCEPTIONS[code] } : {}),
    });
  }

  areas.sort((a, b) => a.id.localeCompare(b.id));

  const tiers = {};
  for (const a of areas) {
    const key = a.permitTier ?? '(no tier published)';
    tiers[key] = (tiers[key] ?? 0) + 1;
  }
  const withPolygon = areas.filter((a) => a.osmId !== null).length;

  console.log(`${areas.length} lots shipped; ${withPolygon} have a polygon and can be drawn.`);
  console.log(`${areas.length - withPolygon} are list-only until someone maps them in OSM.`);
  console.log('By permit tier:', JSON.stringify(tiers));
  console.log(`Rejected ${rejected.length} bad join(s):`);
  for (const r of rejected) console.log(`  ${r}`);

  const out = {
    _comment:
      'Generated by scripts/build-umich-areas.mjs. Do not hand-edit; see docs/data-sources.md.',
    source: lots.source,
    retrievedVia: lots.retrievedVia,
    generatedAt: new Date().toISOString().slice(0, 10),
    note: 'Lots are joined to OSM polygons by the lot code in the OSM name, then validated against the campus LTP assigns them to.',
    areas,
  };

  if (dryRun) {
    console.log('--dry-run: nothing written.');
    return;
  }
  writeFileSync(path.join(ROOT, OUT), `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${OUT}`);
}

main();
