/**
 * The web map is blank without these files, and nothing says so at runtime.
 *
 * MapLibre cannot locate its own worker under Metro (see the comment in
 * scripts/sync-maplibre-worker.mjs), so `Map.web.tsx` points `setWorkerUrl` at
 * a copy we serve from public/. If that copy is missing or belongs to a
 * different maplibre-gl version, the worker fails to load and the map paints
 * the basemap's background color and nothing else — no tiles, no labels, no
 * polygons, and no error. The whole failure mode is that it looks fine.
 *
 * These assertions are the alarm. They run on Linux in CI with no browser,
 * because the thing being checked is a file on disk, not a rendering.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const PUBLIC_DIR = path.join(ROOT, 'public', 'maplibre');
const DIST_DIR = path.join(ROOT, 'node_modules', 'maplibre-gl', 'dist');

/** The worker, and the shared chunk its first line imports. */
const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

describe('the MapLibre worker asset', () => {
  it.each(FILES)('%s is served from public/', (file) => {
    expect(
      existsSync(path.join(PUBLIC_DIR, file)),
      'Run `node scripts/sync-maplibre-worker.mjs` — postinstall normally does this.'
    ).toBe(true);
  });

  it.each(FILES)('%s matches the installed maplibre-gl', (file) => {
    // A stale copy is worse than a missing one: the app loads one version of
    // the library and talks to a worker from another, which fails in ways much
    // harder to read than a blank map.
    const shipped = readFileSync(path.join(PUBLIC_DIR, file));
    const installed = readFileSync(path.join(DIST_DIR, file));
    expect(shipped.equals(installed)).toBe(true);
  });

  it('is the path Map.web.tsx actually asks for', () => {
    // Two constants that must agree and live in different files. If someone
    // moves the destination directory, this fails instead of the map.
    const source = readFileSync(path.join(ROOT, 'src/components/Map/Map.web.tsx'), 'utf8');
    expect(source).toContain("'/maplibre/maplibre-gl-worker.mjs'");
    expect(source).toContain('maplibregl.setWorkerUrl(');
  });

  it('imports the shared chunk as a sibling, which is why both are copied', () => {
    // If maplibre ever inlines the chunk or renames it, copying two files stops
    // being right and this points at the reason rather than at a blank map.
    const worker = readFileSync(path.join(DIST_DIR, 'maplibre-gl-worker.mjs'), 'utf8');
    expect(worker).toContain('./maplibre-gl-shared.mjs');
  });
});
