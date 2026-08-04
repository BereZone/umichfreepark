#!/usr/bin/env node
/**
 * Precompute walking times from every building to every mappable area.
 *
 * WHY THIS IS A BUILD STEP AND NOT A RUNTIME CALL
 *
 * CURB has no backend and must work with no signal, because the place it gets
 * used is inside a parking structure. Ranking "cheapest within a 10 minute
 * walk" therefore has to be answerable offline, which means the walking times
 * ship in the bundle. Computing them here also keeps `rank()` pure and
 * synchronous: it reads a number out of a table instead of awaiting a network
 * call that might not come back.
 *
 * WHY VALHALLA AND NOT APPLE OR GOOGLE
 *
 * Both Apple's and Google's terms restrict retaining directions results, and
 * retaining them is the entire point here. Valhalla runs on OSM data under
 * ODbL, which permits precomputing and shipping the result.
 *
 * Not OSRM: the public demo server (router.project-osrm.org) is compiled with
 * the car profile only. Asking it for walking times returns driving times with
 * no error and no warning — silently wrong for every pair, which is worse than
 * failing.
 *
 * WHEN A PAIR CANNOT BE ROUTED
 *
 * It falls back to straight-line distance x 1.35 at 1.4 m/s, and the script
 * reports how many pairs did. That ratio approximates real street networks but
 * it is an estimate, so the count is printed rather than buried: if it is ever
 * more than a handful, the fallback is doing work it should not be.
 *
 * Usage:
 *   node scripts/build-walk-matrix.mjs [--dry-run] [--limit N]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

const OUT = 'src/engine/data/walk-matrix.json';
const CACHE_DIR = path.join(ROOT, '.cache');
const CACHE = path.join(CACHE_DIR, 'walk-matrix-cache.json');

const ENDPOINT = 'https://valhalla1.openstreetmap.de/sources_to_targets';

/** Valhalla's public instance rejects very large matrices; keep requests modest. */
const SOURCES_PER_REQUEST = 10;

/** Detour factor from straight line to actual street path, and a normal walking pace. */
const DETOUR_FACTOR = 1.35;
const WALK_METRES_PER_SECOND = 1.4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function haversineMetres(a, b) {
  const R = 6_371_000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

const fallbackSeconds = (a, b) =>
  Math.round((haversineMetres(a, b) * DETOUR_FACTOR) / WALK_METRES_PER_SECOND);

/** Area of a ring, used to pick the largest ring of a multipolygon. */
function ringArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return Math.abs(sum / 2);
}

/**
 * Centroid of a polygon feature.
 *
 * Uses the vertex mean of the largest outer ring rather than the true area
 * centroid. For a parking lot the two are within a few metres, and the vertex
 * mean cannot land outside a concave lot the way a bounding-box centre can.
 */
function centroid(feature) {
  const g = feature.geometry;
  const rings = g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map((p) => p[0]);
  const ring = rings.reduce((best, r) => (ringArea(r) > ringArea(best) ? r : best), rings[0]);
  let lat = 0;
  let lon = 0;
  // A closed ring repeats its first vertex last; averaging both copies
  // double-weights that corner. See src/geo/polygons.ts.
  const closed =
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1];
  const pts = closed ? ring.slice(0, -1) : ring;
  for (const [x, y] of pts) {
    lon += x;
    lat += y;
  }
  return { lat: lat / pts.length, lon: lon / pts.length };
}

async function postWithRetry(body, attempts = 4) {
  let wait = 3000;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'curb-walk-matrix/1.0' },
        body: JSON.stringify(body),
      });
      if (res.ok) return await res.json();
      if (res.status < 500 && res.status !== 429) {
        throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
      if (i === attempts) throw new Error(`HTTP ${res.status} after ${attempts} tries`);
      console.log(`    HTTP ${res.status}; retrying in ${wait / 1000}s`);
    } catch (err) {
      if (i === attempts) throw err;
      console.log(`    ${err.message}; retrying in ${wait / 1000}s`);
    }
    await sleep(wait);
    wait *= 2;
  }
  throw new Error('unreachable');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg === -1 ? Infinity : Number(process.argv[limitArg + 1]);

  const buildings = read('src/engine/data/buildings.json').buildings;
  const geo = read('data/raw/osm-parking.geojson');
  const cityAreaIds = read('src/engine/data/umich-areas.json');

  // Rebuild the mappable-area list the same way src/engine/data/areas.ts does,
  // without importing TypeScript into a plain-node script.
  const byOsmId = new Map(geo.features.map((f) => [f.properties.osm_id, f]));
  const cityOsmIds = [
    ['ann-ashley', 'way/30838959'],
    ['fourth-washington', 'way/30839085'],
    ['fourth-william', 'way/30839105'],
    ['library-lane', 'way/30839120'],
    ['maynard', 'way/30839161'],
    ['liberty-square', 'way/30839192'],
    ['forest', 'way/30839268'],
    ['south-ashley-lot', 'way/30839328'],
    ['first-william-lot', 'way/495081613'],
  ];
  const areas = [
    ...cityOsmIds.map(([id, osmId]) => ({ id, osmId })),
    // Lots with no polygon have no centroid to route to. They ship without a
    // walk time rather than with an invented one; walkSeconds returns null and
    // ranking sorts them last on distance instead of pretending they are close.
    ...cityAreaIds.areas.filter((a) => a.osmId).map((a) => ({ id: a.id, osmId: a.osmId })),
  ]
    .filter(({ id, osmId }) => {
      if (byOsmId.has(osmId)) return true;
      console.log(`  skipping ${id}: no polygon for ${osmId}`);
      return false;
    })
    .map(({ id, osmId }) => ({ id, ...centroid(byOsmId.get(osmId)) }))
    .slice(0, limit);

  const sources = buildings.slice(0, limit).map((b) => ({ id: b.id, lat: b.lat, lon: b.lon }));

  console.log(`${sources.length} buildings x ${areas.length} areas = ${sources.length * areas.length} pairs`);

  const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
  const key = (b, a) => `${b}|${a}`;

  const targets = areas.map((a) => ({ lat: a.lat, lon: a.lon }));
  const seconds = [];
  let fromCache = 0;
  let routed = 0;
  let fellBack = 0;
  const fallbackPairs = [];

  for (let i = 0; i < sources.length; i += SOURCES_PER_REQUEST) {
    const batch = sources.slice(i, i + SOURCES_PER_REQUEST);
    const needed = batch.some((b) => areas.some((a) => cache[key(b.id, a.id)] === undefined));

    let matrix = null;
    if (needed && !dryRun) {
      process.stdout.write(`  routing buildings ${i + 1}-${i + batch.length}... `);
      try {
        const json = await postWithRetry({
          sources: batch.map((b) => ({ lat: b.lat, lon: b.lon })),
          targets,
          costing: 'pedestrian',
        });
        matrix = json.sources_to_targets;
        console.log('ok');
      } catch (err) {
        console.log(`FAILED (${err.message}) — falling back for this batch`);
      }
      await sleep(400); // be a good citizen on a free public instance
    }

    batch.forEach((b, bi) => {
      const row = [];
      areas.forEach((a, ai) => {
        const cached = cache[key(b.id, a.id)];
        if (cached !== undefined) {
          row.push(cached);
          fromCache += 1;
          return;
        }
        const cell = matrix?.[bi]?.[ai];
        let value;
        if (cell && typeof cell.time === 'number') {
          value = Math.round(cell.time);
          routed += 1;
        } else {
          value = fallbackSeconds(b, a);
          fellBack += 1;
          fallbackPairs.push(`${b.id} -> ${a.id}`);
        }
        cache[key(b.id, a.id)] = value;
        row.push(value);
      });
      seconds.push(row);
    });
  }

  console.log(`\nrouted ${routed}, from cache ${fromCache}, fell back ${fellBack}`);
  if (fellBack > 0) {
    console.log('Pairs using the straight-line estimate (first 10):');
    for (const p of fallbackPairs.slice(0, 10)) console.log(`  ${p}`);
    console.log(
      'These are estimates, not routed walks. If this count is large, investigate before shipping.'
    );
  }

  if (dryRun) {
    console.log('--dry-run: nothing written.');
    return;
  }

  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE, JSON.stringify(cache), 'utf8');

  const out = {
    _comment:
      'Generated by scripts/build-walk-matrix.mjs. Do not hand-edit; see docs/data-sources.md.',
    source: ENDPOINT,
    costing: 'pedestrian',
    license: 'Routed over OpenStreetMap data (ODbL).',
    generatedAt: new Date().toISOString().slice(0, 10),
    fallback: {
      used: fellBack,
      method: `haversine x ${DETOUR_FACTOR} at ${WALK_METRES_PER_SECOND} m/s`,
    },
    buildings: sources.map((s) => s.id),
    areas: areas.map((a) => a.id),
    /** seconds[buildingIndex][areaIndex] */
    seconds,
  };
  writeFileSync(path.join(ROOT, OUT), `${JSON.stringify(out)}\n`, 'utf8');
  console.log(`Wrote ${OUT}`);
}

await main();
