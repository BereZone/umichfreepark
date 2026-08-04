#!/usr/bin/env node
/**
 * Fetch U-M's published lot-by-lot enforcement tables into
 * src/engine/data/umich-lots.json.
 *
 * WHY THIS GOES THROUGH THE WAYBACK MACHINE
 *
 * ltp.umich.edu sits behind Cloudflare bot protection and returns 403 to every
 * automated request — WebFetch, curl, curl with a browser User-Agent, all of
 * it. That is the university's call to make and we are not going to work around
 * it. The Internet Archive, however, crawls the site successfully and holds
 * captures of every page we need, several from within days of this script being
 * written.
 *
 * A Wayback capture is not a secondary source. It is a byte-for-byte copy of
 * LTP's own page, with a timestamp attached — which is strictly more provenance
 * than a live fetch gives us, because the capture date is recorded rather than
 * assumed. What it costs us is freshness: a capture can lag the live site, and
 * enforcement hours change between academic years. So every record carries the
 * capture timestamp it came from, and `docs/data-sources.md` says to re-run
 * this each August.
 *
 * If LTP ever drops the challenge, point BASE at the live site and delete the
 * archive plumbing. The parsing below does not care where the HTML came from.
 *
 * Usage:
 *   node scripts/fetch-umich-lots.mjs           # resolve newest capture per page
 *   node scripts/fetch-umich-lots.mjs --dry-run # report, write nothing
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/engine/data/umich-lots.json');

const BASE = 'https://ltp.umich.edu/parking/locations-and-enforcement';

/**
 * The four campuses LTP publishes enforcement hours for. The landing page names
 * exactly these; there is no fifth.
 */
const CAMPUSES = [
  { id: 'central', slug: 'central-campus' },
  { id: 'medical', slug: 'medical-campus' },
  { id: 'north', slug: 'north-campus' },
  { id: 'ross-athletic', slug: 'ross-athletic-campus' },
];

const CDX = 'http://web.archive.org/cdx/search/cdx';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The Internet Archive rate-limits, and it does so by returning 503 rather than
 * 429 — indistinguishable from a real outage without retrying. Four sequential
 * page fetches plus four CDX lookups is enough to trip it, so a single un-retried
 * run fails perhaps half the time. Without this, the August re-verification
 * would look like a broken script instead of a busy server.
 */
async function fetchWithRetry(url, { attempts = 5, label = url } = {}) {
  let wait = 2000;
  for (let i = 1; i <= attempts; i++) {
    let res;
    try {
      res = await fetch(url);
    } catch (err) {
      if (i === attempts) throw new Error(`${label}: network error after ${attempts} tries — ${err.message}`);
      console.log(`  ${label}: ${err.message}; retrying in ${wait / 1000}s`);
      await sleep(wait);
      wait *= 2;
      continue;
    }
    if (res.ok) return res;
    // 5xx and 429 are transient; 404 and friends are not, so fail fast on those.
    if (res.status < 500 && res.status !== 429) {
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

/** Newest successful capture of a URL, as a Wayback timestamp string. */
async function newestCapture(url) {
  const q = `${CDX}?url=${encodeURIComponent(url)}&filter=statuscode:200&limit=-1&fl=timestamp`;
  const res = await fetchWithRetry(q, { label: `CDX lookup for ${url}` });
  const ts = (await res.text()).trim().split('\n').pop()?.trim();
  if (!/^\d{14}$/.test(ts ?? '')) throw new Error(`No archived capture found for ${url}`);
  return ts;
}

/**
 * `id_` asks Wayback for the original bytes without its own toolbar injection,
 * which keeps the markup exactly as LTP served it.
 */
const archiveUrl = (ts, url) => `https://web.archive.org/web/${ts}id_/${url}`;

/** ISO-8601 from a Wayback timestamp, so the JSON carries a readable date. */
function isoFromTimestamp(ts) {
  const [, y, mo, d, h, mi, s] = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(ts);
  return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
}

const stripTags = (html) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Rows are (Lot, Name, Address, Enforcement Hours[, Tier]).
 *
 * THE TIER COLUMN IS OPTIONAL AND THAT MATTERS.
 *
 * Roughly a third of LTP's rows omit it — service docks, loading bays and
 * restricted areas that belong to no permit colour. An earlier version of this
 * parser required five cells and silently dropped every one of them, losing
 * about 93 lots including M28 and NC60. Nothing failed; the dataset was simply
 * short, which is the worst way for parking data to be wrong.
 *
 * So: four cells is a valid lot with an unknown tier. The arity check is still
 * what separates lot rows from the page's nav and layout tables, but the floor
 * is four, not five.
 */
function parseLots(html) {
  const lots = [];
  for (const [, rowHtml] of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) =>
      stripTags(m[1])
    );
    if (cells.length < 4) continue;
    const [rawLot, name, address, hours] = cells;
    // Absent tier is recorded as null rather than guessed. A lot with no
    // published permit colour is not a Blue lot.
    const tier = cells.length >= 5 && cells[4] ? cells[4] : null;
    if (!rawLot || rawLot === 'Lot') continue;
    // A row with no enforcement hours is not usable and must not become a lot
    // whose schedule silently parses to null-means-enforced.
    if (!hours) continue;

    // A trailing asterisk marks a footnote on the page (relocated accessible
    // spaces, mostly). Keep the flag, drop it from the id so the id joins
    // cleanly against polygon data.
    const footnoted = rawLot.endsWith('*');
    lots.push({
      lot: footnoted ? rawLot.slice(0, -1) : rawLot,
      name,
      address,
      enforcementHours: hours,
      tier,
      ...(footnoted ? { footnoted: true } : {}),
    });
  }
  return lots;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const campuses = [];
  let total = 0;

  for (const { id, slug } of CAMPUSES) {
    const url = `${BASE}/${slug}/`;
    const ts = await newestCapture(url);
    const res = await fetchWithRetry(archiveUrl(ts, url), { label: `${slug} @ ${ts}` });
    const lots = parseLots(await res.text());
    if (lots.length === 0) {
      throw new Error(
        `Parsed 0 lots from ${url} @ ${ts}. The table markup probably changed — ` +
          'fix the parser rather than shipping an empty campus.'
      );
    }
    const tiers = {};
    for (const l of lots) {
      const key = l.tier ?? '(no tier published)';
      tiers[key] = (tiers[key] ?? 0) + 1;
    }
    console.log(`${id.padEnd(14)} ${String(lots.length).padStart(3)} lots  capture ${ts}`);
    console.log(`               ${JSON.stringify(tiers)}`);
    campuses.push({ campus: id, source: url, capturedAt: isoFromTimestamp(ts), lots });
    total += lots.length;
  }

  const out = {
    _comment:
      'Generated by scripts/fetch-umich-lots.mjs from LTP pages via the Internet Archive. Do not hand-edit; see docs/data-sources.md.',
    source: BASE,
    retrievedVia: 'https://web.archive.org/ (ltp.umich.edu returns 403 to automated requests)',
    generatedAt: new Date().toISOString().slice(0, 10),
    note: 'Enforcement hours are per-lot and are NOT predictable from the tier. The sign at the lot entrance is the authority; these tables are the closest published equivalent.',
    campuses,
  };

  console.log(`\n${total} lots across ${campuses.length} campuses.`);
  if (dryRun) {
    console.log('--dry-run: nothing written.');
    return;
  }
  writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${path.relative(ROOT, OUT)}`);
}

await main();
