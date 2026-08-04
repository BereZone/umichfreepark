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
 * Three passes, strongest evidence first. A lot takes the first one that hits.
 *
 *   1. CODE      OSM tags the lot with its official code, in `ref`, `name` or
 *                `alt_name` — `ref=NC60`, "U of M Lot NC 47".
 *   2. CONTAINS  U-M's own campus map publishes a coordinate for the lot, and
 *                exactly one mapped parking area contains that point.
 *   3. NEAR      the same coordinate falls just outside a parking area that
 *                claims no lot code of its own, within NEAR_LIMIT_M.
 *
 * Pass 2 is the one that changed the numbers. Reading only the OSM name found
 * 82 lots; adding `ref` found 116; asking "which mapped parking area contains
 * the point the university itself publishes" found 22 more that carry no code
 * in OSM at all. It is also the strongest of the three — a containment test
 * cannot match the wrong lot the way a regex over prose can.
 *
 * Pass 3 exists because a coordinate dropped at a lot's entrance can land on
 * the pavement just outside the polygon. It is deliberately timid: only
 * unclaimed, uncoded polygons are eligible, so it can never steal a shape from
 * a lot that named itself, and NEAR_LIMIT_M is short enough that the answer is
 * "the parking area you are standing at the edge of" rather than "the nearest
 * parking area". Relaxing either guard reintroduces exactly the mis-join this
 * ordering exists to prevent: at 200m the nearest polygon to N8 is lot N13.
 *
 * Every match from any pass is then checked against the campus LTP assigns it
 * to: a lot the table calls North Campus whose polygon sits on Ross Athletic is
 * a bad join and is dropped, not shipped.
 *
 * Two lots legitimately fall outside their campus envelope and are allowlisted
 * below with the address that justifies them.
 *
 * WHAT IS STILL NOT DRAWN, AND WHY THAT IS CORRECT
 *
 * About 89 rows end with no geometry from any pass, and they are overwhelmingly
 * loading docks rather than parking lots: "Mason Hall Dock", "Chemistry Dock",
 * "Pharmacy Service Center". LTP lists them because they have permit rules;
 * their addresses are things like "Canal Street (behind building)". Nobody has
 * mapped them because they are not places anyone parks, and inventing a shape
 * at the building's street address would put a boundary across a lecture hall.
 * They ship with their rules and no polygon, which is the honest answer.
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
  SC17: 'Wolverine Tower, 3003 S. State St — an office building two miles south of the athletic campus.',
  // NC37 is genuinely out there — 1919 Green Road, east of North Campus — but
  // it currently has no polygon to accept: the only parking area at that point
  // is AATA's park-and-ride, which couldBeUmich() rejects. Kept so the day
  // someone maps the U-M lot, the campus check does not then throw it away.
  NC37: 'Printing Services, 1919 Green Road — the Green Road service cluster, east of North Campus.',
  NC62: 'North Campus Facilities Services Bldg, 3231 Baxter Rd — same service cluster, east of North Campus.',
  // NC103 (Housing Services) is deliberately absent. LTP publishes no address
  // for it, so there is nothing to justify the exception with, and U-M's map
  // puts its point inside the same polygon as NC62 — one shape cannot be two
  // lots. It ships with its rules and no geometry.
};

/** Lot codes as OSM spells them: "SC7", "NC 47", "M-22". */
const LOT_CODE = /\b((?:NC|SC|NW|EC|M|N|S|W|E|C)\s?-?\d{1,3})\b/;

/**
 * Tags that can carry the lot code, in the order we trust them.
 *
 * `ref` is the one OSM actually documents for this — "the reference number or
 * code" of a feature — and mappers use it exactly that way here: `ref=NC60`,
 * `ref=M28`. Reading only `name` cost us 34 lots that OSM had mapped all
 * along, M28 and NC60 among them, because those ways are named for the place
 * ("Pierpont Commons parking") with the code filed under `ref` where it
 * belongs. The lots looked like a gap in the source; the gap was here.
 *
 * `ref` is checked before `name` because a name is prose and can mention a
 * neighbouring lot; a ref is the identifier of this feature.
 */
const CODE_TAGS = ['ref', 'name', 'alt_name'];

/**
 * The lot code a feature claims, or null.
 *
 * Semicolons are OSM's list separator, so `ref=NC1;NC2` is two refs, and each
 * part is matched on its own rather than letting the regex pick whichever it
 * reaches first in the joined string.
 */
function lotCodeOf(properties) {
  for (const tag of CODE_TAGS) {
    const value = properties[tag];
    if (!value) continue;
    for (const part of String(value).toUpperCase().split(/[;,/]/)) {
      const match = LOT_CODE.exec(part.replace(/\s+/g, ' '));
      if (match) return match[1].replace(/[\s-]/g, '');
    }
  }
  return null;
}

/**
 * Could this polygon be a U-M lot, judging by who OSM says runs it?
 *
 * Only the coordinate passes ask. A polygon carrying the lot code in `ref` has
 * identified itself and needs no corroboration; a coordinate that merely lands
 * inside a shape does, because adjacent lots on the same street belong to
 * different authorities and the point does not know that.
 *
 * NC37 is the case that put this here. LTP files it as "Printing Services, 1919
 * Green Road"; U-M's coordinate for it falls inside the Green Road Park & Ride,
 * which OSM records as operated by the Ann Arbor Area Transportation Authority.
 * Accepting that join would have drawn LTP's permit hours over AATA's lot —
 * a lot with different rules, different signage, and a different enforcer.
 *
 * An absent operator is not evidence either way and stays eligible; most U-M
 * lots in OSM carry no operator at all. This rejects only positive evidence to
 * the contrary.
 */
function couldBeUmich(properties) {
  const operator = properties.operator ?? properties['operator:short'];
  if (!operator) return true;
  return /michigan|\bU\s?of\s?M\b|\bUM\b/i.test(operator);
}

/** What to call a feature in a rejection message, when it may have no name. */
function describe(properties) {
  const label = properties.name ?? properties.ref ?? properties.alt_name;
  // osm_id already reads "way/12345", so do not prefix osm_type again.
  return label ? `"${label}"` : String(properties.osm_id);
}

/**
 * How far outside a polygon a published point may sit and still be that lot.
 *
 * 25 m is about the width of a driveway. Two cars' length past the kerb is a
 * coordinate dropped at the entrance; a hundred metres is a different lot.
 */
const NEAR_LIMIT_M = 25;

/** Every ring of a feature, Polygon or MultiPolygon, as [exterior, ...holes][]. */
function partsOf(feature) {
  return feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates;
}

/** Ray casting. Standard even-odd test; the shared closing vertex is harmless here. */
function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** True when the point is inside the feature and not inside one of its holes. */
function featureContains(feature, point) {
  return partsOf(feature).some(
    (part) => pointInRing(point, part[0]) && !part.slice(1).some((hole) => pointInRing(point, hole))
  );
}

/**
 * Metres from a point to the nearest vertex of a feature.
 *
 * Vertex distance rather than true distance-to-edge: it over-estimates on a
 * long straight side, which only ever makes the NEAR pass more conservative.
 * Equirectangular, because at 25 m in Ann Arbor the error is millimetres.
 */
function metresToFeature([lon, lat], feature) {
  const scale = Math.cos((lat * Math.PI) / 180) * 111_320;
  let best = Infinity;
  for (const part of partsOf(feature)) {
    for (const ring of part) {
      for (const [vlon, vlat] of ring) {
        best = Math.min(best, Math.hypot((vlon - lon) * scale, (vlat - lat) * 110_540));
      }
    }
  }
  return best;
}

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
  // Coordinates only. This file carries no rules by design — see
  // scripts/fetch-umich-locations.mjs for why we throw the rest away.
  const locations = read('src/engine/data/umich-locations.json').locations;

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

  /**
   * Accept a feature as a lot's polygon, unless its centroid sits on the wrong
   * campus. Shared by all three passes so no pass can skip the check.
   */
  function claim(code, feature, via) {
    const lot = table.get(code);
    if (!lot || polygonByCode.has(code)) return false;

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
        `${code}: polygon at ${lat.toFixed(4)},${lon.toFixed(4)} is outside ${lot.campus} — ${describe(feature.properties)} (via ${via})`
      );
      return false;
    }
    polygonByCode.set(code, {
      osmId: feature.properties.osm_id,
      osmName: feature.properties.name ?? null,
      via,
    });
    return true;
  }

  // --- pass 1: the lot code, as OSM tags it --------------------------------
  for (const feature of geo.features) {
    const code = lotCodeOf(feature.properties);
    if (code) claim(code, feature, 'code');
  }

  /**
   * Polygons that named themselves are off limits to the coordinate passes.
   *
   * If a way carries `ref=NC51`, it is lot NC51's shape and no coordinate for
   * some other lot may take it — even a containing one, which would mean U-M's
   * point is simply misplaced. This is what keeps pass 3 from handing NC81 the
   * polygon belonging to NC51.
   */
  const spokenFor = new Set(
    geo.features.filter((f) => lotCodeOf(f.properties)).map((f) => f.properties.osm_id)
  );
  const taken = new Set([...polygonByCode.values()].map((p) => p.osmId));

  // --- pass 2: U-M's published point, inside a polygon ---------------------
  const unlocated = [];
  for (const location of locations) {
    if (polygonByCode.has(location.lot) || !table.has(location.lot)) continue;
    const point = [location.lon, location.lat];
    const inside = geo.features.filter(
      (f) => featureContains(f, point) && !taken.has(f.properties.osm_id)
    );
    const hits = inside.filter((f) => couldBeUmich(f.properties));
    if (hits.length === 0) {
      // Say so when the only candidate was somebody else's lot, rather than
      // letting it look identical to "no polygon exists here".
      for (const f of inside) {
        rejected.push(
          `${location.lot}: point falls inside ${describe(f.properties)}, operated by ${f.properties.operator} — not U-M`
        );
      }
      unlocated.push(location);
      continue;
    }
    if (hits.length > 1) {
      // Nested or overlapping parking areas: no way to tell which is meant, and
      // guessing is the mis-join this whole file is arranged to avoid.
      rejected.push(`${location.lot}: point falls inside ${hits.length} parking areas — ambiguous`);
      continue;
    }
    if (claim(location.lot, hits[0], 'contains')) taken.add(hits[0].properties.osm_id);
  }

  // --- pass 3: U-M's published point, just outside an unclaimed polygon ----
  for (const location of unlocated) {
    if (polygonByCode.has(location.lot)) continue;
    const point = [location.lon, location.lat];
    let best = null;
    let bestMetres = Infinity;
    for (const feature of geo.features) {
      const id = feature.properties.osm_id;
      if (taken.has(id) || spokenFor.has(id)) continue;
      if (!couldBeUmich(feature.properties)) continue;
      const metres = metresToFeature(point, feature);
      if (metres < bestMetres) {
        bestMetres = metres;
        best = feature;
      }
    }
    if (!best || bestMetres > NEAR_LIMIT_M) continue;
    if (claim(location.lot, best, `near ${Math.round(bestMetres)}m`)) {
      taken.add(best.properties.osm_id);
    }
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
      // Which pass supplied the shape. Kept in the file so a reviewer can see
      // at a glance which polygons rest on a coordinate rather than on a tag,
      // and re-check those first when a lot looks wrong on the map.
      geometryVia: polygon?.via ?? null,
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
  const byPass = {};
  for (const a of areas) {
    if (!a.geometryVia) continue;
    const key = a.geometryVia.startsWith('near') ? 'near' : a.geometryVia;
    byPass[key] = (byPass[key] ?? 0) + 1;
  }

  console.log(`${areas.length} lots shipped; ${withPolygon} have a polygon and can be drawn.`);
  console.log(`${areas.length - withPolygon} are list-only — mostly loading docks nobody has mapped.`);
  console.log('Geometry by pass:', JSON.stringify(byPass));
  console.log('By permit tier:', JSON.stringify(tiers));
  console.log(`Rejected ${rejected.length} join(s):`);
  for (const r of rejected) console.log(`  ${r}`);

  const out = {
    _comment:
      'Generated by scripts/build-umich-areas.mjs. Do not hand-edit; see docs/data-sources.md.',
    source: lots.source,
    retrievedVia: lots.retrievedVia,
    generatedAt: new Date().toISOString().slice(0, 10),
    locationSource: read('src/engine/data/umich-locations.json').source,
    note: 'Lots are joined to OSM polygons in three passes — the lot code in the OSM ref/name/alt_name tag, then U-M\'s own published coordinate falling inside a parking area, then that coordinate within 25m of an unclaimed one. Every match is validated against the campus LTP assigns it to. `geometryVia` records which pass won. Rules come from LTP only; the coordinate source is never read for hours or permit tier.',
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
