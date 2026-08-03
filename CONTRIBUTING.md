# Contributing to CURB

Setup and local development live in [`docs/development.md`](docs/development.md). This file covers how we commit, changelog, and version.

## The most valuable contribution

**Wrong parking data.** It is this project's most likely and most costly bug class — a wrong "FREE" costs a student a $70 ticket. If you notice a rate, an enforcement window, or a lot boundary that doesn't match the sign on the street, open a [data correction issue](../../issues/new?template=data-correction.yml). A photo of the posted sign or a link to the city or U-M page is plenty. You do not need to write any code.

## Commit messages

We follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

```
<type>(<optional scope>): <description>

<optional body>

<optional footer>
```

Types used in this project:

| Type | Use for | Version impact |
|---|---|---|
| `feat` | A new user-facing capability | MINOR |
| `fix` | A bug fix | PATCH |
| `data` | Parking rules, polygons, buildings, walk matrix | PATCH, or MINOR if new areas are added |
| `docs` | Documentation only | none |
| `test` | Adding or correcting tests | none |
| `refactor` | Code change that is neither a fix nor a feature | none |
| `perf` | Performance improvement | PATCH |
| `style` | Formatting, whitespace, no logic change | none |
| `build` | Build system, dependencies, Expo config | none |
| `ci` | GitHub Actions and automation | none |
| `chore` | Anything else, including version bumps | none |

A breaking change gets a `!` after the type (`feat!:`) **and** a `BREAKING CHANGE:` footer explaining what breaks and what to do instead.

Scopes we use: `engine`, `map`, `data`, `theme`, `list`, `learn`, `a11y`, `release`.

Examples:

```
feat(map): flip polygon borders from dashed to solid at the free/paid transition

data: correct Maynard structure hourly rate to $1.65

  Verified against a2dda.org 2026-08-03. Previous value predated the
  July 1 2026 increase.

fix(engine): count DST transitions when computing time until free

  A countdown spanning "spring forward" was reporting one hour too long
  because it did wall-clock arithmetic on a UTC instant.

feat(engine)!: rank() now requires a user profile

  BREAKING CHANGE: rank() takes a `profile` argument. Callers that
  previously relied on the implicit permissive default must now pass
  DEFAULT_PROFILE explicitly, which is the most restrictive case.
```

Why bother: the changelog and the release notes are written by hand, but the commit log is what you read when you're trying to work out *when* a parking rate changed and why. Vague subjects make that archaeology impossible.

## Changelog

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

- Every user-visible change gets an entry under `## [Unreleased]`, in the same PR or commit that makes the change. Not later.
- Use the standard subheadings: Added, Changed, Deprecated, Removed, Fixed, Security.
- Write for a student using the app, not for a developer reading a diff. "Structures now show the Sunday free window" beats "add structuresFree()".
- Do **not** generate this file from commit history. If it could be generated, it isn't earning its place.
- At release time, `## [Unreleased]` is renamed to `## [x.y.z] - YYYY-MM-DD` and a fresh empty `## [Unreleased]` goes above it. Add the comparison link at the bottom.

## Versioning

[Semantic Versioning](https://semver.org/spec/v2.0.0.html). This is an app rather than a library, so we read the contract as being with the *user*, not with a caller:

- **MAJOR** — the app works in a way that invalidates what someone already knew. A redesigned map encoding, a changed permission model, dropping a platform.
- **MINOR** — new capability, backward compatible. A new screen, a new ranking mode, a new city authority covered.
- **PATCH** — fixes and data corrections. Most `data:` commits land here.

Pre-1.0 (where we are now), MINOR absorbs breaking changes and PATCH absorbs everything else.

**Never edit version numbers by hand.** An Expo app carries its version in four places and they drift silently. Use `make bump` — see [`docs/releasing.md`](docs/releasing.md).

## Before you push

```bash
npm run typecheck
npm run lint
npm test
```

CI runs these on every push to `main`. Pushing directly to `main` is the expected workflow here; there is no pull-request requirement.
