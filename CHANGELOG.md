# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This file is hand-maintained. It is not generated from commit history — the point
is to describe what changed for a *user*, which commit subjects do not do.

## [Unreleased]

### Added

- Expo SDK 57 project skeleton with Expo Router, TypeScript `strict`, and a minimal app shell.
- Repository conventions: Conventional Commits, Keep a Changelog, Semantic Versioning.
- `AGENTS.md` documenting the engine purity rule, the `encoding.ts` anti-drift rule, and the data-sourcing rules.
- Verified City of Ann Arbor parking rates, enforcement windows, and holiday lists in `docs/data-sources.md`, including the two different "free" rules for structures and meters.
- 80 campus buildings with colloquial aliases ("the Dude", "UgLi", "the Big House"), coordinates sourced from OpenStreetMap.
- `scripts/version.mjs` as the single owner of every version location, with drift detection that refuses to bump from an inconsistent state.
- `make` targets for `bump`, `tag`, `untag`, and `check-version`, all delegating to that script.
- CI on pushes to `main` and on pull requests; a tag-triggered release workflow that validates the tag, verifies version metadata, and builds a web export.
- Issue templates, including a phone-friendly **parking data is wrong** report that asks only what the sign says and accepts a photo.
- U-M lot-by-lot enforcement hours for all four enforced campuses — 150 lots with permit tier, address, and hours.
- Verified U-M rules in `docs/data-sources.md`: parking is open to the public outside posted enforcement hours, first-years and sophomores cannot hold a commuter permit, and U-M observes a third holiday list that matches neither the city's nor PCI's.
- Rules engine calendar: Ann Arbor time-zone handling, computed floating holidays, and per-authority holiday lists for city meters, city structures, and U-M.
- Raw OpenStreetMap parking geometry for Ann Arbor — 1,646 polygons, committed unedited so hand-tagging shows up as a reviewable diff.
- Enforcement-hours parser turning U-M's 17 published spellings into evaluable schedules, with unparseable strings treated as enforced.
- Free/paid status and next-transition countdown for city meters, city structures, and U-M lots, correct across daylight saving time.

### Changed

### Deprecated

### Removed

### Fixed

### Security

[Unreleased]: https://github.com/BereZone/curb/commits/main
