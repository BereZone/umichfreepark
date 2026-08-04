#!/usr/bin/env node
/**
 * Fetch raw OSM parking geometry for Ann Arbor into data/raw/osm-parking.geojson.
 *
 * WHY OSM AT ALL
 *
 * CURB's own data files carry hand-verified enforcement rules, but they don't
 * carry polygons — drawing every lot and structure boundary by hand is slow and
 * error-prone. OpenStreetMap already has most of them traced (`amenity=parking`,
 * `building=parking`), under ODbL, with community upkeep. This script pulls that
 * geometry as a RAW, unmodified starting point; it is not a source of truth for
 * price or access rules, only for "where is the polygon." Hand-tagging which
 * polygon maps to which verified rule happens later, by a human, as a reviewable
 * diff on top of this file — which is why this script must never be the thing
 * doing that tagging.
 *
 * WHY OVERPASS, AND WHY TWO ENDPOINTS
 *
 * Overpass is the only practical way to query OSM by tag + bounding box without
 * downloading a planet extract. The public overpass-api.de instance rate-limits
 * hard under normal use — 429 (too many requests) and 504 (query timed out on a
 * busy server) are routine there, not signs of an outage. kumi.systems mirrors
 * the same data and is used as a fallback after retries on the primary are
 * exhausted, rather than failing the whole run over a transient load spike.
 *
 * WHY MANUAL GEOJSON CONVERSION
 *
 * Overpass's `out geom;` gives inline {lat, lon} coordinates on every way and
 * relation member, which is enough to build GeoJSON by hand without a
 * dependency. Ways become Polygons when closed, LineStrings otherwise.
 * Multipolygon relations (structures with an interior courtyard, lots that wrap
 * around a building) are reassembled from outer/inner member rings. Overpass
 * gives lat/lon; GeoJSON demands lon/lat — reversing that silently is the
 * single most likely way this script could ship parking lots in the Gulf of
 * Guinea, so every emitted coordinate is bounds-checked against the query bbox
 * before anything is written.
 *
 * Usage:
 *   node scripts/fetch-osm-parking.mjs           # fetch, convert, write
 *   node scripts/fetch-osm-parking.mjs --dry-run # fetch, convert, report, write nothing
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'data/raw');
const OUT = path.join(OUT_DIR, 'osm-parking.geojson');

// south, west, north, east — generous enough to cover the City of Ann Arbor and
// central/medical/north campus without pulling in Ypsilanti.
const BBOX = [42.24, -83.77, 42.32, -83.67];
const [SOUTH, WEST, NORTH, EAST] = BBOX;

const PRIMARY_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const FALLBACK_ENDPOINT = 'https://overpass.kumi.systems/api/interpreter';

// amenity=parking_space is deliberately excluded: that's per-space granularity
// (thousands of features for a handful of structures) and not what CURB draws.
const QUERY = `[out:json][timeout:90];
(
  way["amenity"="parking"](${SOUTH},${WEST},${NORTH},${EAST});
  relation["amenity"="parking"](${SOUTH},${WEST},${NORTH},${EAST});
  way["building"="parking"](${SOUTH},${WEST},${NORTH},${EAST});
  relation["building"="parking"](${SOUTH},${WEST},${NORTH},${EAST});
);
out geom;`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// overpass-api.de's Apache in front of the API 406s any request with no (or
// Node's default, near-empty) User-Agent — mod_negotiation treats it as
// "can't find an acceptable representation." curl sends one implicitly;
// Node's fetch does not, so it has to be set explicitly here.
const REQUEST_HEADERS = { 'User-Agent': 'curb-osm-parking-fetch/1.0', Accept: '*/*' };

/**
 * Retries on 429 (rate limited) and 5xx (504 gateway timeout is Overpass's
 * usual way of saying "busy," not "broken"). Fails fast on other 4xx, since
 * those mean the query itself is wrong and retrying won't help.
 */
async function postWithRetry(url, query, { attempts = 4, label = url } = {}) {
  let wait = 3000;
  for (let i = 1; i <= attempts; i++) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: REQUEST_HEADERS,
        body: new URLSearchParams({ data: query }),
      });
    } catch (err) {
      if (i === attempts) throw new Error(`${label}: network error after ${attempts} tries — ${err.message}`);
      console.log(`  ${label}: ${err.message}; retrying in ${wait / 1000}s`);
      await sleep(wait);
      wait *= 2;
      continue;
    }
    if (res.ok) return res;
    if (res.status !== 429 && res.status < 500) {
      throw new Error(`${label}: HTTP ${res.status}`);
    }
    if (i === attempts) throw new Error(`${label}: HTTP ${res.status} after ${attempts} tries`);
    console.log(`  ${label}: HTTP ${res.status}; retrying in ${wait / 1000}s`);
    await sleep(wait);
    wait *= 2;
  }
  /* c8 ignore next */
  throw new Error('unreachable');
}

/** Try the primary Overpass mirror, then fall back to kumi.systems. */
async function queryOverpass(query) {
  try {
    const res = await postWithRetry(PRIMARY_ENDPOINT, query, { label: 'overpass-api.de' });
    return { endpoint: PRIMARY_ENDPOINT, json: await res.json() };
  } catch (err) {
    console.log(`  overpass-api.de exhausted retries (${err.message}); falling back to kumi.systems`);
    const res = await postWithRetry(FALLBACK_ENDPOINT, query, { label: 'overpass.kumi.systems' });
    return { endpoint: FALLBACK_ENDPOINT, json: await res.json() };
  }
}

/** Ray-casting point-in-ring test, used only to nest inner rings inside the
 * correct outer ring of a multipolygon. [lon, lat] throughout, matching GeoJSON. */
function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** A way member's geometry as a closed [lon, lat] ring, or null if the member
 * isn't independently closed (would need multi-segment ring-merging to fix,
 * which this script deliberately does not attempt — see resolveMultipolygon). */
function closedRingFromMember(member) {
  if (member.type !== 'way' || !Array.isArray(member.geometry) || member.geometry.length < 4) return null;
  if (member.geometry.some((p) => p == null || typeof p.lat !== 'number' || typeof p.lon !== 'number')) return null;
  const coords = member.geometry.map((p) => [p.lon, p.lat]);
  const [fx, fy] = coords[0];
  const [lx, ly] = coords[coords.length - 1];
  if (fx !== lx || fy !== ly) return null;
  return coords;
}

/**
 * Builds a MultiPolygon from a multipolygon relation's outer/inner members.
 * Only handles the case where every outer/inner member is *itself* a closed
 * ring — real OSM multipolygons sometimes split one ring across several way
 * segments that only close when concatenated in the right order, and getting
 * that reassembly wrong produces a geometry that looks fine and is silently
 * corrupt. Rather than guess, such relations are skipped and counted; `skipLog`
 * receives a human-readable reason for each.
 */
function resolveMultipolygon(el, skipLog) {
  const id = `relation/${el.id}`;
  const outerRings = [];
  const innerRings = [];
  for (const m of el.members ?? []) {
    if (m.role === 'outer') {
      const ring = closedRingFromMember(m);
      if (!ring) {
        skipLog.push(`${id}: outer member way/${m.ref} is not independently closed`);
        return null;
      }
      outerRings.push(ring);
    } else if (m.role === 'inner') {
      const ring = closedRingFromMember(m);
      if (!ring) {
        skipLog.push(`${id}: inner member way/${m.ref} is not independently closed`);
        return null;
      }
      innerRings.push(ring);
    }
    // Other roles (blank, "label", etc.) don't contribute geometry; ignored.
  }
  if (outerRings.length === 0) {
    skipLog.push(`${id}: no resolvable outer ring`);
    return null;
  }

  const polygons = outerRings.map((ring) => [ring]);
  for (const inner of innerRings) {
    const idx = polygons.findIndex((poly) => pointInRing(inner[0], poly[0]));
    if (idx === -1) {
      skipLog.push(`${id}: inner ring does not nest inside any outer ring`);
      return null;
    }
    polygons[idx].push(inner);
  }
  return { type: 'MultiPolygon', coordinates: polygons };
}

function wayToFeature(el) {
  const pts = el.geometry;
  if (!Array.isArray(pts) || pts.length < 2 || pts.some((p) => p == null)) return null;
  const coords = pts.map((p) => [p.lon, p.lat]);
  const [fx, fy] = coords[0];
  const [lx, ly] = coords[coords.length - 1];
  const closed = coords.length >= 4 && fx === lx && fy === ly;
  const geometry = closed
    ? { type: 'Polygon', coordinates: [coords] }
    : { type: 'LineString', coordinates: coords };
  return {
    type: 'Feature',
    properties: { ...(el.tags ?? {}), osm_id: `way/${el.id}`, osm_type: 'way' },
    geometry,
  };
}

function relationToFeature(el, skipLog) {
  const id = `relation/${el.id}`;
  if (el.tags?.type !== 'multipolygon') {
    skipLog.push(`${id}: tags.type is '${el.tags?.type ?? '(none)'}', not 'multipolygon'`);
    return null;
  }
  const geometry = resolveMultipolygon(el, skipLog);
  if (!geometry) return null;
  return {
    type: 'Feature',
    properties: { ...(el.tags ?? {}), osm_id: id, osm_type: 'relation' },
    geometry,
  };
}

/** Every emitted coordinate must fall inside (a small margin around) the query
 * bbox. This is the check that catches a lat/lon swap before it ships. */
function assertInBounds(features) {
  const bad = [];
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      const [lon, lat] = c;
      if (lon < -84 || lon > -83 || lat < 42 || lat > 43) bad.push([lon, lat]);
    } else {
      for (const inner of c) walk(inner);
    }
  };
  for (const f of features) walk(f.geometry.coordinates);
  if (bad.length > 0) {
    throw new Error(
      `${bad.length} coordinate(s) fell outside the expected [-84,-83] lon / [42,43] lat window ` +
        `(first: ${JSON.stringify(bad[0])}). This usually means a lat/lon swap — fix before shipping.`
    );
  }
}

function tally(features, key) {
  const counts = {};
  for (const f of features) {
    const v = f.properties[key];
    if (v === undefined) continue;
    counts[v] = (counts[v] ?? 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function printTally(label, features, key) {
  const counts = tally(features, key);
  if (counts.length === 0) {
    console.log(`  ${key}: (no features carry this tag)`);
    return;
  }
  console.log(`  ${key}:`);
  for (const [v, n] of counts) console.log(`    ${String(n).padStart(4)}  ${v}`);
}

/** Ann Arbor structures worth a name-check: if these don't show up, the query
 * or bbox is probably too narrow. */
const LANDMARK_KEYWORDS = ['Maynard', 'Forest', 'Liberty Square', 'Ann Ashley', 'Fourth', 'William', 'Fourth & William'];

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log(`Querying Overpass for parking features in bbox [${BBOX.join(', ')}]...`);
  const { endpoint, json } = await queryOverpass(QUERY);
  console.log(`Served by: ${endpoint}`);

  const elements = json.elements ?? [];
  console.log(`Received ${elements.length} raw elements.`);

  const features = [];
  const skipLog = [];
  let skippedWays = 0;

  for (const el of elements) {
    if (el.type === 'way') {
      const f = wayToFeature(el);
      if (!f) {
        skippedWays += 1;
        continue;
      }
      features.push(f);
    } else if (el.type === 'relation') {
      const f = relationToFeature(el, skipLog);
      if (f) features.push(f);
    }
  }

  assertInBounds(features);

  const byGeomType = {};
  for (const f of features) byGeomType[f.geometry.type] = (byGeomType[f.geometry.type] ?? 0) + 1;

  const namedCount = features.filter((f) => f.properties.name).length;

  console.log(`\n${features.length} features total.`);
  console.log('By geometry type:');
  for (const [type, n] of Object.entries(byGeomType)) console.log(`  ${String(n).padStart(4)}  ${type}`);

  console.log('\nTag breakdown:');
  for (const key of ['amenity', 'building', 'parking', 'access', 'fee']) printTally(key, features, key);

  console.log(`\n${namedCount} of ${features.length} features carry a name tag.`);

  console.log(`\n${skipLog.length} relation(s) skipped as unresolvable:`);
  for (const line of skipLog) console.log(`  ${line}`);
  if (skippedWays > 0) console.log(`${skippedWays} way(s) skipped for missing/incomplete geometry.`);

  console.log('\nLandmark check (name contains):');
  for (const kw of LANDMARK_KEYWORDS) {
    const matches = features.filter((f) => (f.properties.name ?? '').includes(kw));
    console.log(`  ${kw}: ${matches.length ? matches.map((m) => `"${m.properties.name}"`).join(', ') : 'NOT FOUND'}`);
  }

  const out = {
    _comment:
      'Generated by scripts/fetch-osm-parking.mjs from OpenStreetMap via Overpass. Do not hand-edit; see docs/data-sources.md. Geometry only — this file is NOT a source of truth for rates, access, or enforcement.',
    source: 'https://overpass-api.de/',
    license: 'ODbL, https://www.openstreetmap.org/copyright',
    generatedAt: new Date().toISOString().slice(0, 10),
    bbox: BBOX,
    query: QUERY,
    type: 'FeatureCollection',
    features,
  };

  if (dryRun) {
    console.log('\n--dry-run: nothing written.');
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(`\nWrote ${path.relative(ROOT, OUT)}`);
}

await main();
