/**
 * Building search.
 *
 * Matching aliases rather than only official names is the feature that beats
 * the alternatives. Nobody types "Duderstadt Center Media Union" — they type
 * "the dude". A search that only knows official names is a search students
 * stop using after one try.
 */

import buildingData from './data/buildings.json';

export interface Building {
  id: string;
  name: string;
  aliases: string[];
  lat: number;
  lon: number;
  campus: string;
}

export const BUILDINGS: Building[] = buildingData.buildings.map((b) => ({
  id: b.id,
  name: b.name,
  aliases: b.aliases ?? [],
  lat: b.lat,
  lon: b.lon,
  campus: b.campus,
}));

export const buildingById = new Map(BUILDINGS.map((b) => [b.id, b]));

/**
 * Fold to a comparable form: lowercase, no punctuation, and no leading "the".
 *
 * Dropping "the" matters more than it looks. Half the colloquial names for
 * campus buildings carry one ("the Dude", "the Big House", "the Union") and
 * half of those get typed without it.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^the /, '');
}

/**
 * Subsequence match: do the characters of `query` appear in order in `target`?
 *
 * This is what makes "dud" find "Duderstadt" and "mich stad" find "Michigan
 * Stadium" without a full fuzzy-distance library. It is generous, which is
 * correct for a search box with a short list behind it — the ranking below is
 * what keeps the generous matches from outranking the good ones.
 */
function isSubsequence(query: string, target: string): boolean {
  let i = 0;
  for (let j = 0; j < target.length && i < query.length; j++) {
    if (query[i] === target[j]) i++;
  }
  return i === query.length;
}

/**
 * The building nearest a coordinate, and how far away it is in metres.
 *
 * This is how "use my location" works without adding anything to the engine's
 * shape. Every walking time UMichFreePark knows is precomputed from a building, so a raw
 * GPS fix cannot be ranked against — but the building you are standing next to
 * can be, and the answer is the same one you would have typed.
 *
 * Returns null past `maxMetres`, and that is a real answer rather than an
 * error: a student at home in Detroit is genuinely not near any of these, and
 * silently handing back the closest one — a building forty miles away — would
 * rank every lot in Ann Arbor as a reasonable walk from where they are.
 *
 * Straight-line distance on purpose. This picks which building you are at, not
 * how long anything takes to walk to; over the couple of hundred metres that
 * decides between two neighbouring buildings, routing would change nothing.
 */
export function nearestBuilding(
  lat: number,
  lon: number,
  maxMetres = 2_000
): { building: Building; metres: number } | null {
  let best: { building: Building; metres: number } | null = null;

  for (const building of BUILDINGS) {
    // Equirectangular approximation. Exact enough at this scale and far cheaper
    // than haversine over every building on every location fix.
    const eastWest = (building.lon - lon) * Math.cos((lat * Math.PI) / 180) * 111_320;
    const northSouth = (building.lat - lat) * 110_540;
    const metres = Math.hypot(eastWest, northSouth);
    if (!best || metres < best.metres) best = { building, metres };
  }

  if (!best || best.metres > maxMetres) return null;
  return best;
}

export interface BuildingMatch {
  building: Building;
  /** Lower is better. */
  score: number;
  /** The name or alias that matched, for showing why a result is there. */
  matchedOn: string;
}

/**
 * Score one candidate string against the query. Lower is better; null is no
 * match at all.
 *
 * The tiers matter: an exact match must beat a prefix, which must beat a
 * substring, which must beat a scattered subsequence. Without that ordering,
 * typing "union" surfaces every building containing those letters in order
 * before it surfaces the Michigan Union.
 */
function scoreCandidate(query: string, candidate: string): number | null {
  const target = normalize(candidate);
  if (target === query) return 0;
  if (target.startsWith(query)) return 1 + target.length / 1000;
  // Word-boundary match: "ross school" finding "Ross School of Business".
  if (target.includes(` ${query}`)) return 2 + target.length / 1000;
  if (target.includes(query)) return 3 + target.length / 1000;
  if (isSubsequence(query, target)) return 4 + target.length / 1000;
  return null;
}

/**
 * Search buildings by name or alias.
 *
 * An empty query returns nothing rather than everything: a list of all 80
 * buildings is not a search result, and showing it makes the box look broken.
 */
export function searchBuildings(rawQuery: string, limit = 8): BuildingMatch[] {
  const query = normalize(rawQuery);
  if (query.length === 0) return [];

  const matches: BuildingMatch[] = [];
  for (const building of BUILDINGS) {
    let best: { score: number; matchedOn: string } | null = null;
    for (const candidate of [building.name, ...building.aliases]) {
      const score = scoreCandidate(query, candidate);
      if (score === null) continue;
      // An alias match is worth slightly less than the official name at the
      // same tier, so "Michigan Union" outranks something merely aliased that way.
      const adjusted = candidate === building.name ? score : score + 0.1;
      if (!best || adjusted < best.score) best = { score: adjusted, matchedOn: candidate };
    }
    if (best) matches.push({ building, score: best.score, matchedOn: best.matchedOn });
  }

  return matches
    .sort((a, b) => a.score - b.score || a.building.name.localeCompare(b.building.name))
    .slice(0, limit);
}
