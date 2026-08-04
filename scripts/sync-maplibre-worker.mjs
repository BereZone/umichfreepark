#!/usr/bin/env node
/**
 * Copy MapLibre's web worker into public/ so the web map can start it.
 *
 * WHY THIS EXISTS
 *
 * MapLibre v6 works out its own worker URL from `import.meta.url`:
 *
 *     function getWorkerUrl() {
 *       const self = import.meta.url;
 *       if (!/^https?:/.test(self)) return '';          // <- us
 *       return new URL('./maplibre-gl-worker.mjs', self).href;
 *     }
 *
 * That assumes the library is served as an ES module sitting next to its own
 * worker file. Metro bundles everything into one script, so `import.meta.url`
 * is not an http URL and the function returns an empty string. MapLibre then
 * calls `new Worker('', { type: 'module' })`, which the browser resolves
 * against the document — it loads the HTML page as a module script, the worker
 * dies on a syntax error, and nothing reports it.
 *
 * The failure is invisible and total. The main thread still fetches the style,
 * the sprite and the TileJSON, so the network log looks healthy; but tiles,
 * glyphs and our own polygons are all parsed in the worker, so the map paints
 * the style's background colour and nothing else. A blank beige rectangle.
 *
 * So we serve the worker ourselves and hand MapLibre the URL. Both files are
 * needed: the worker is an ES module that imports the shared chunk beside it.
 *
 * WHY COPIED AT INSTALL RATHER THAN COMMITTED
 *
 * These are build artifacts of a dependency. Committing them means a silent
 * version skew the day someone bumps maplibre-gl — the app would load a v6
 * bundle against a v5 worker, which fails in ways far more confusing than a
 * blank map. Copying on postinstall makes them impossible to get out of step.
 * `src/components/Map/worker-asset.test.ts` fails if this has not run.
 *
 * Usage:
 *   node scripts/sync-maplibre-worker.mjs [--check]
 */

import { copyFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Kept in step with WORKER_PUBLIC_PATH in src/components/Map/Map.web.tsx. */
const DEST_DIR = path.join(ROOT, 'public', 'maplibre');
const SRC_DIR = path.join(ROOT, 'node_modules', 'maplibre-gl', 'dist');

/**
 * The worker, and the shared chunk it imports.
 *
 * `maplibre-gl-worker.mjs` starts with `import { ... } from
 * './maplibre-gl-shared.mjs'`, resolved relative to the worker's own URL, so
 * the two have to stay siblings. Copying only the worker produces a worker
 * that fails to load — the same blank map, one step later.
 */
const FILES = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

function main() {
  const check = process.argv.includes('--check');

  if (!existsSync(SRC_DIR)) {
    // `npm ci` runs postinstall after the tree is in place, so this only
    // happens if someone runs the script by hand without installing.
    console.error(`maplibre-gl is not installed at ${SRC_DIR}. Run npm install first.`);
    process.exit(1);
  }

  mkdirSync(DEST_DIR, { recursive: true });

  let stale = 0;
  for (const file of FILES) {
    const from = path.join(SRC_DIR, file);
    const to = path.join(DEST_DIR, file);
    const same = existsSync(to) && readFileSync(to).equals(readFileSync(from));
    if (same) continue;
    stale += 1;
    if (check) {
      console.error(`${path.relative(ROOT, to)} is missing or does not match the installed maplibre-gl.`);
      continue;
    }
    copyFileSync(from, to);
    console.log(`Copied ${file} -> ${path.relative(ROOT, to)}`);
  }

  if (check && stale > 0) {
    console.error('Run: node scripts/sync-maplibre-worker.mjs');
    process.exit(1);
  }
  if (stale === 0) console.log('MapLibre worker assets are up to date.');
}

main();
