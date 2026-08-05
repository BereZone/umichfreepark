#!/usr/bin/env node
/**
 * The single owner of MFreePark's version numbers.
 *
 * An Expo app carries its version in four places, and they drift silently:
 * package.json looks right, CI is green, and the build that reaches TestFlight
 * reports a stale version string. Nothing catches it because nothing is
 * checking. So everything that touches a version — the Makefile, CI, a human —
 * goes through this file. There is deliberately no second implementation of
 * bump logic in this repository.
 *
 * See docs/releasing.md.
 *
 * Usage:
 *   node scripts/version.mjs check [--expect <version>]
 *   node scripts/version.mjs current
 *   node scripts/version.mjs set <version> [--force-reconcile]
 *   node scripts/version.mjs bump <major|minor|patch|prerelease> [--dry-run]
 *
 * Plain Node ESM. No dependencies, on purpose: this has to run before
 * `npm ci` in CI and from a Makefile on a machine with a cold cache.
 */

import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Strict SemVer. Deliberately stricter than the semver package's `loose` mode:
 * no leading zeros, no leading `v`, no whitespace. The `v` belongs to the git
 * tag, not to the version, and conflating the two is how `vv1.2.3` happens.
 */
export const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

/** iOS build numbers are integers-as-strings: "1", "2", "17". Never "1.0". */
const BUILD_NUMBER_RE = /^(0|[1-9]\d*)$/;

const FILES = {
  pkg: 'package.json',
  lock: 'package-lock.json',
  app: 'app.json',
};

/**
 * Every location that holds the semver. These four must always agree.
 *
 * package-lock.json holds it twice — the top-level `version` and the mirrored
 * `packages[""].version` for the root workspace. npm writes both; editing one
 * and not the other produces a lockfile that `npm ci` will happily install
 * from while reporting the wrong version, so both are tracked as first-class
 * locations rather than as one.
 */
const VERSION_LOCATIONS = [
  {
    key: 'pkg',
    file: FILES.pkg,
    field: 'version',
    get: (d) => d.version,
    set: (d, v) => {
      d.version = v;
    },
  },
  {
    key: 'lock',
    file: FILES.lock,
    field: 'version',
    get: (d) => d.version,
    set: (d, v) => {
      d.version = v;
    },
  },
  {
    key: 'lock',
    file: FILES.lock,
    field: 'packages[""].version',
    get: (d) => d.packages?.['']?.version,
    set: (d, v) => {
      if (!d.packages || !d.packages['']) {
        throw new Error(
          'package-lock.json has no packages[""] entry — the lockfile is not the shape npm writes. Run `npm install` to regenerate it.'
        );
      }
      d.packages[''].version = v;
    },
  },
  {
    key: 'app',
    file: FILES.app,
    field: 'expo.version',
    get: (d) => d.expo?.version,
    set: (d, v) => {
      if (!d.expo) throw new Error('app.json has no `expo` key.');
      d.expo.version = v;
    },
  },
];

/**
 * The build number is tracked separately from the semver, and it is NOT a
 * fifth copy of it.
 *
 * App Store Connect requires the iOS build number to strictly increase for a
 * given marketing version, and it refuses an upload that reuses one — forever,
 * even after the build is deleted. The marketing version (`expo.version`) is
 * what a user sees and can legitimately go 0.1.0 -> 0.1.0 across a re-cut
 * build; the build number cannot. Deriving it from the semver (1.2.3 -> 10203,
 * say) breaks the moment you need two uploads of the same version, which is
 * exactly what happens when a submission is rejected. So it is a monotonic
 * counter: +1 on every write, never reset, never reused.
 */
const BUILD_NUMBER_LOCATION = {
  key: 'app',
  file: FILES.app,
  field: 'expo.ios.buildNumber',
  get: (d) => d.expo?.ios?.buildNumber,
  set: (d, v) => {
    if (!d.expo?.ios) throw new Error('app.json has no `expo.ios` key.');
    d.expo.ios.buildNumber = v;
  },
};

// ---------------------------------------------------------------------------
// File IO
// ---------------------------------------------------------------------------

/**
 * Read/modify/write, never regenerate. We parse, mutate the one key we own,
 * and re-serialize with the same 2-space indent and trailing newline npm and
 * Expo write, so a version bump is a four-line diff and not a 480 kB one.
 * JSON.parse preserves key order for string keys, so nothing gets reordered.
 */
function readJsonFile(name) {
  const file = path.join(ROOT, name);
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read ${name}: ${err.message}`);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${name} is not valid JSON: ${err.message}`);
  }
  return { name, file, raw, data };
}

function serialize(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function readAll() {
  const loaded = {};
  for (const [key, name] of Object.entries(FILES)) loaded[key] = readJsonFile(name);
  return loaded;
}

/**
 * Write via temp file + rename, which is atomic per file on POSIX. All three
 * files are serialized and validated before the first byte is written, so a
 * bad value aborts before anything changes on disk. A crash between renames
 * is the one remaining window; `check` detects that state and
 * `set --force-reconcile` repairs it.
 */
function writeAllAtomically(pending) {
  const written = [];
  try {
    for (const { file, contents } of pending) {
      const tmp = `${file}.version-tmp`;
      writeFileSync(tmp, contents, 'utf8');
      renameSync(tmp, file);
      written.push(file);
    }
  } catch (err) {
    throw new Error(
      `Write failed after updating ${written.length} of ${pending.length} files: ${err.message}\n` +
        'Run `node scripts/version.mjs check` to see the current state.'
    );
  }
}

// ---------------------------------------------------------------------------
// Reading the current state
// ---------------------------------------------------------------------------

/**
 * @returns {{ locations: Array, buildNumber: {value: string, valid: boolean},
 *             values: string[], inSync: boolean, reference: string,
 *             problems: string[] }}
 */
export function inspect(loaded = readAll()) {
  const locations = VERSION_LOCATIONS.map((loc) => {
    const value = loc.get(loaded[loc.key].data);
    return {
      file: loc.file,
      field: loc.field,
      value: value === undefined ? null : value,
      label: `${loc.file} ${loc.field}`,
    };
  });

  const buildValue = BUILD_NUMBER_LOCATION.get(loaded.app.data);
  const buildNumber = {
    file: BUILD_NUMBER_LOCATION.file,
    field: BUILD_NUMBER_LOCATION.field,
    value: buildValue === undefined ? null : buildValue,
    valid: typeof buildValue === 'string' && BUILD_NUMBER_RE.test(buildValue),
  };

  // package.json is the reference: it is what npm itself reads, so when the
  // locations disagree it is the one most likely to be right, and naming a
  // single reference makes the error message say WHICH file to fix.
  const reference = locations[0].value;
  const problems = [];

  for (const loc of locations) {
    if (loc.value === null) {
      problems.push(`${loc.label} is missing entirely.`);
    } else if (typeof loc.value !== 'string' || !SEMVER.test(loc.value)) {
      problems.push(`${loc.label} is "${loc.value}", which is not strict SemVer.`);
    } else if (loc.value !== reference) {
      problems.push(
        `${loc.label} is "${loc.value}" but package.json version is "${reference}".`
      );
    }
  }

  if (!buildNumber.valid) {
    problems.push(
      `${buildNumber.file} ${buildNumber.field} is ${JSON.stringify(buildNumber.value)}, ` +
        'which is not an integer-as-string (e.g. "7").'
    );
  }

  return {
    locations,
    buildNumber,
    reference,
    inSync: problems.length === 0,
    problems,
  };
}

// ---------------------------------------------------------------------------
// SemVer arithmetic
// ---------------------------------------------------------------------------

export function parseVersion(version) {
  const m = SEMVER.exec(version);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ? m[4].slice(1) : null,
    build: m[5] ? m[5].slice(1) : null,
  };
}

export const PARTS = ['major', 'minor', 'patch', 'prerelease'];

/**
 * Compute the next version.
 *
 * Prerelease handling follows the usual SemVer reading: a prerelease is a
 * candidate FOR the version it is attached to, so releasing 1.2.0-rc.2 as a
 * minor gives 1.2.0, not 1.3.0. Bumping the prerelease of a stable version
 * targets the next patch — 0.1.0 -> 0.1.1-rc.1 — because 0.1.0-rc.1 would sort
 * BEFORE the 0.1.0 that already shipped.
 *
 * Build metadata (`+sha`) is dropped: it is not ordered by SemVer and carrying
 * a stale one forward is always wrong.
 */
export function nextVersion(current, part) {
  const v = parseVersion(current);
  if (!v) throw new Error(`Current version "${current}" is not strict SemVer.`);
  if (!PARTS.includes(part)) {
    throw new Error(`Unknown part "${part}". Expected one of: ${PARTS.join(', ')}.`);
  }

  switch (part) {
    case 'major':
      // 1.0.0-rc.1 is already a candidate for 1.0.0, so major just lands it.
      return v.prerelease && v.minor === 0 && v.patch === 0
        ? `${v.major}.0.0`
        : `${v.major + 1}.0.0`;
    case 'minor':
      return v.prerelease && v.patch === 0
        ? `${v.major}.${v.minor}.0`
        : `${v.major}.${v.minor + 1}.0`;
    case 'patch':
      return v.prerelease
        ? `${v.major}.${v.minor}.${v.patch}`
        : `${v.major}.${v.minor}.${v.patch + 1}`;
    case 'prerelease': {
      if (!v.prerelease) return `${v.major}.${v.minor}.${v.patch + 1}-rc.1`;
      const ids = v.prerelease.split('.');
      const last = ids[ids.length - 1];
      if (/^(0|[1-9]\d*)$/.test(last)) ids[ids.length - 1] = String(Number(last) + 1);
      else ids.push('1');
      return `${v.major}.${v.minor}.${v.patch}-${ids.join('.')}`;
    }
    /* c8 ignore next */
    default:
      throw new Error(`Unreachable part "${part}".`);
  }
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * Apply `version` to all four locations and increment the build number.
 * The one and only write path — `set` and `bump` both land here.
 */
export function applyVersion(version, { forceReconcile = false } = {}) {
  if (typeof version !== 'string' || !SEMVER.test(version)) {
    throw new Error(
      `"${version}" is not strict SemVer.\n` +
        'Expected MAJOR.MINOR.PATCH with optional -prerelease, e.g. 1.2.0 or 1.2.0-rc.1.\n' +
        'No leading "v" — the "v" belongs to the git tag, not to the version.'
    );
  }

  const loaded = readAll();
  const state = inspect(loaded);

  if (!state.inSync && !forceReconcile) {
    throw new Error(
      `Refusing to write: the version locations are already out of step.\n\n${state.problems
        .map((p) => `  - ${p}`)
        .join('\n')}\n\n` +
        'Reconcile before bumping. Bumping from a drifted state double-bumps whichever\n' +
        'file is already ahead, which is the exact failure this check exists to prevent.\n' +
        `Fix by hand, or: node scripts/version.mjs set ${version} --force-reconcile`
    );
  }

  // Monotonic, never derived from the semver. See BUILD_NUMBER_LOCATION.
  const currentBuild = state.buildNumber.valid ? Number(state.buildNumber.value) : 0;
  const nextBuild = String(currentBuild + 1);

  for (const loc of VERSION_LOCATIONS) loc.set(loaded[loc.key].data, version);
  BUILD_NUMBER_LOCATION.set(loaded.app.data, nextBuild);

  // Serialize everything first so a failure aborts before any file is touched.
  const pending = [];
  for (const key of Object.keys(FILES)) {
    const f = loaded[key];
    const contents = serialize(f.data);
    if (contents !== f.raw) pending.push({ file: f.file, name: f.name, contents });
  }

  writeAllAtomically(pending);

  return {
    version,
    buildNumber: nextBuild,
    previousBuildNumber: state.buildNumber.value,
    changed: pending.map((p) => p.name),
    reconciled: !state.inSync,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function pad(s, n) {
  return String(s) + ' '.repeat(Math.max(0, n - String(s).length));
}

function printState(state) {
  const rows = [
    ...state.locations.map((l) => [l.file, l.field, l.value === null ? '(missing)' : l.value]),
    [
      state.buildNumber.file,
      state.buildNumber.field,
      state.buildNumber.value === null ? '(missing)' : state.buildNumber.value,
    ],
  ];
  const w0 = Math.max(...rows.map((r) => r[0].length));
  const w1 = Math.max(...rows.map((r) => r[1].length));
  rows.forEach((r, i) => {
    const note = i === rows.length - 1 ? '   (build counter, not the semver)' : '';
    console.log(`  ${pad(r[0], w0)}  ${pad(r[1], w1)}  ${r[2]}${note}`);
  });
}

function cmdCheck(args) {
  const expectIdx = args.indexOf('--expect');
  let expected = null;
  if (expectIdx !== -1) {
    expected = args[expectIdx + 1];
    if (!expected) throw new Error('--expect needs a version, e.g. --expect 1.2.0');
  }

  const state = inspect();
  console.log('Version locations:');
  printState(state);
  console.log('');

  let ok = state.inSync;

  if (!state.inSync) {
    console.error('DRIFT — the version locations disagree:');
    for (const p of state.problems) console.error(`  - ${p}`);
    console.error('');
    console.error(
      'Reconcile, do not re-bump: node scripts/version.mjs set <version> --force-reconcile'
    );
  } else {
    console.log(`In sync: all four locations report ${state.reference}.`);
    console.log(`Build number: ${state.buildNumber.value}.`);
  }

  if (expected !== null) {
    if (!SEMVER.test(expected)) {
      console.error('');
      console.error(
        `Expected version "${expected}" is not strict SemVer.` +
          (expected.startsWith('v') ? ' Strip the leading "v" — that belongs to the tag.' : '')
      );
      ok = false;
    } else if (state.inSync && state.reference !== expected) {
      console.error('');
      console.error(`MISMATCH — expected ${expected}, but the project reports ${state.reference}:`);
      for (const loc of state.locations) {
        if (loc.value !== expected) {
          console.error(`  - ${loc.file} ${loc.field} is "${loc.value}", expected "${expected}".`);
        }
      }
      console.error('');
      console.error('This usually means the tag was cut without running `make bump`.');
      ok = false;
    } else if (state.inSync) {
      console.log(`Matches expected version ${expected}.`);
    } else {
      ok = false;
    }
  }

  return ok ? 0 : 1;
}

function cmdCurrent() {
  const state = inspect();
  // stdout stays a single bare version so callers can do `v=$(... current)`.
  console.log(state.reference ?? '');
  if (!state.inSync) {
    console.error('WARNING: version locations are out of step; printed package.json version.');
    for (const p of state.problems) console.error(`  - ${p}`);
    return 1;
  }
  return 0;
}

function cmdSet(args) {
  const flags = args.filter((a) => a.startsWith('--'));
  const positional = args.filter((a) => !a.startsWith('--'));
  const version = positional[0];
  if (!version) throw new Error('usage: node scripts/version.mjs set <version> [--force-reconcile]');
  const unknown = flags.filter((f) => f !== '--force-reconcile');
  if (unknown.length) throw new Error(`Unknown flag(s): ${unknown.join(', ')}`);

  const result = applyVersion(version, { forceReconcile: flags.includes('--force-reconcile') });
  if (result.reconciled) {
    console.log('Reconciled drifted locations by force.');
  }
  console.log(`Version set to ${result.version} in ${result.changed.length} file(s):`);
  for (const f of result.changed) console.log(`  - ${f}`);
  console.log(
    `iOS buildNumber ${result.previousBuildNumber} -> ${result.buildNumber} (monotonic counter).`
  );
  console.log('');
  console.log('Not committed and not tagged. See docs/releasing.md.');
  return 0;
}

function cmdBump(args) {
  const flags = args.filter((a) => a.startsWith('--'));
  const positional = args.filter((a) => !a.startsWith('--'));
  const part = positional[0];
  if (!part) {
    throw new Error(`usage: node scripts/version.mjs bump <${PARTS.join('|')}> [--dry-run]`);
  }
  const unknown = flags.filter((f) => f !== '--dry-run');
  if (unknown.length) throw new Error(`Unknown flag(s): ${unknown.join(', ')}`);

  const state = inspect();
  if (!state.inSync) {
    throw new Error(
      `Refusing to bump: the version locations are already out of step.\n\n${state.problems
        .map((p) => `  - ${p}`)
        .join('\n')}\n\n` +
        'That usually means a previous bump was interrupted partway.\n' +
        'Reconcile, do not re-bump: node scripts/version.mjs set <version> --force-reconcile'
    );
  }

  const target = nextVersion(state.reference, part);

  if (flags.includes('--dry-run')) {
    // Bare stdout so the Makefile can capture it and show the target before
    // asking for confirmation. Nothing is written.
    console.log(target);
    return 0;
  }

  console.log(`Bumping ${part}: ${state.reference} -> ${target}`);
  // Same code path as `set` — there is one writer.
  return cmdSet([target]);
}

function usage() {
  console.log(`scripts/version.mjs — the single owner of MFreePark's version numbers

  node scripts/version.mjs check [--expect <version>]
      Print every version location and whether they agree.
      Exit 0 if in sync, 1 if drifted. Read-only.

  node scripts/version.mjs current
      Print the current version and nothing else.

  node scripts/version.mjs set <version> [--force-reconcile]
      Write <version> to all four locations and increment the iOS build number.
      Refuses if the locations are currently drifted unless --force-reconcile.

  node scripts/version.mjs bump <${PARTS.join('|')}> [--dry-run]
      Compute the next version and apply it through the same path as \`set\`.
      --dry-run prints the computed version and writes nothing.

See docs/releasing.md. Prefer \`make bump\` — it confirms before writing.`);
}

export function main(argv) {
  const [command, ...args] = argv;
  try {
    switch (command) {
      case 'check':
        return cmdCheck(args);
      case 'current':
        return cmdCurrent();
      case 'set':
        return cmdSet(args);
      case 'bump':
        return cmdBump(args);
      case 'help':
      case '--help':
      case '-h':
        usage();
        return 0;
      case undefined:
        usage();
        return 1;
      default:
        console.error(`Unknown command: ${command}\n`);
        usage();
        return 1;
    }
  } catch (err) {
    console.error(`error: ${err.message}`);
    return 1;
  }
}

// Only run when executed directly, so tests can import the exports above.
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) process.exit(main(process.argv.slice(2)));
