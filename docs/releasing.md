# Releasing

## Why this is more careful than it looks

An Expo app carries its version in **four** places, and `package-lock.json` mirrors it twice, so there are five values to keep straight:

| Location | Field | Kind |
|---|---|---|
| `package.json` | `version` | semver |
| `package-lock.json` | `version` | semver |
| `package-lock.json` | `packages[""].version` | semver (npm writes both) |
| `app.json` | `expo.version` | semver |
| `app.json` | `expo.ios.buildNumber` | **counter, not a semver** |

Drift between them is the classic Expo release bug: `package.json` looks correct, CI is green, and the build that reaches TestFlight reports a stale version string. Nothing catches it, because nothing was checking.

The build number is the odd one out and is deliberately **not** derived from the version. App Store Connect refuses an upload that reuses a build number — permanently, even after that build is deleted — so it has to be a monotonic counter that increments on every write. Deriving it from the semver breaks the first time a rejected submission needs a second upload of the same version.

So: **never edit a version by hand.** `scripts/version.mjs` owns every location, and both the Makefile and CI read from it. There is deliberately no second implementation of bump logic anywhere in this repo.

## The procedure

### 1. Update `CHANGELOG.md`

Rename `## [Unreleased]` to `## [x.y.z] - YYYY-MM-DD`, add a fresh empty `## [Unreleased]` above it, and add the comparison link at the bottom.

Do this **first**. The release workflow extracts this section verbatim as the GitHub release body and fails the release if there is no section matching the tag — a release with no changelog entry is a mistake, not a valid state.

### 2. Bump

```bash
make bump PART=minor      # major | minor | patch | prerelease
make bump VERSION=1.2.0   # or set an explicit version
make check-version        # confirms every location agrees
```

`make bump` prints the current and computed target version, then requires you to **type the target version** to confirm before it writes anything. Anything else aborts and nothing is touched.

If the locations already disagree when you start, `bump` stops and reports the drift rather than bumping, and offers to reconcile them to one version you type. That usually means a previous bump was interrupted partway. **Reconcile, don't re-bump** — double-bumping is exactly the failure this check exists to prevent.

### 3. Commit

```bash
git add -A
git commit -m "chore(release): 1.2.0"
```

`make bump` deliberately does not commit or tag. Those are yours.

### 4. Tag

```bash
make tag VERSION=v1.2.0
```

This refuses to proceed if:

- the version isn't strict SemVer,
- you doubled the `v` (`vv1.2.3`) or omitted it (`1.2.3`),
- the working tree is dirty,
- the tag doesn't match what's in `package.json`, the lockfile, and `app.json`.

Tags are **annotated** (`git tag -a`), so `git push --follow-tags` behaves as you'd expect. `make tag` prints the push command rather than pushing — pushing a tag ships something, and that should be a decision you make on purpose.

### 5. Push

```bash
git push --follow-tags
```

## What the release workflow does

`.github/workflows/release.yml` triggers on tags matching `v*`:

1. **Validates the tag** against strict SemVer, with an explicit error for the doubled-`v` mistake.
2. **Verifies metadata is in sync** — the tag minus `v` must equal `package.json`, the lockfile, and `app.json` `expo.version`. Fails naming the file that's out of step. This is the guard against tagging a release you forgot to bump.
3. **Runs the test suite.** Never publishes an untested tag.
4. **Extracts the changelog section** for exactly this version and uses it as the release body. Fails if absent.
5. **Builds the web export** (`npx expo export -p web`) and zips `dist/` as a release asset.
6. **Publishes** via `softprops/action-gh-release`.

### Draft policy

Configured as a single step at the top of the workflow so it's easy to change:

| Release | Behavior |
|---|---|
| MAJOR (`X.0.0`) | `draft: true` — manual approval |
| MINOR (`x.Y.0`) | auto-publish |
| PATCH (`x.y.Z`) | auto-publish |
| Prerelease (`-rc.1`) | `prerelease: true`, auto-publish |

## Recovering from a bad release

The release action **upserts**. Re-running it against an existing tag updates that release rather than creating a duplicate. That makes most recovery cheap.

**Tagged the wrong commit, or forgot to bump:**

```bash
make untag VERSION=v1.2.0   # deletes local + remote tag, with confirmation
# fix the problem, commit
make tag VERSION=v1.2.0
git push --follow-tags
```

`make untag` checks whether a GitHub release already exists for the tag and asks whether to delete it or leave it. **Leaving it is usually correct** — the release action upserts on re-tag, so the existing release gets updated in place, and deleting it loses any download counts and breaks links people may already have.

**Released with a broken changelog or wrong notes:** edit `CHANGELOG.md`, commit, then re-push the tag to the corrected commit. The workflow re-extracts and updates the release body.

**Published something genuinely broken:** don't delete the release. Ship a patch. Deleting a published release breaks anyone who linked to it, and SemVer's whole premise is that versions are immutable once out. Mark the bad release as deprecated in the changelog under the next version's `Fixed` section.

**A major version auto-published when it should have drafted:** check the draft-policy step — that's the single place it's decided.
