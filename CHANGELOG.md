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
- 75 parking areas with verified rates and polygons: 7 DDA structures, 2 city lots, 2 meter zones, and 64 U-M lots joined to OpenStreetMap by lot code.
- Precomputed walking times from all 80 buildings to all 73 mapped areas, so ranking works with no signal.
- Eligibility, cost, and ranking by cheapest, closest, or balanced, defaulting to a first-year with no permit.
- Home-game-day warnings for U-M lots, covering the seven confirmed 2026 dates.
- Design tokens for colour, type, spacing, and motion, with light and dark schemes that both clear 4.5:1 contrast.
- Map encoding as a single pure function, so both renderers derive appearance from one place.
- Map-agnostic geometry helpers: winding normalization, bounding boxes, point-in-polygon, and a label point guaranteed to fall inside its lot.
- Shared renderer contract and drawable geometry for the 73 mapped areas, extracted to 32 KB rather than bundling the 2 MB raw dataset.
- Both map renderers: react-native-maps over Apple Maps on iOS, maplibre-gl over OpenFreeMap on web.
- Map screen with a live free-count, a per-area detail panel, and a countdown to the next free/paid change.
- List view with cheapest/closest/balanced sorting, duration selection, and trade-offs stated in words.
- Building search that matches colloquial names — "the dude", "ugli", "the big house" — not just official ones.
- Map and list share one destination and duration, so switching between them preserves the trip.
- Learn screen covering the fine schedule, the three sets of rules, permit eligibility, free buses, and what we don't know.

### Changed

### Deprecated

### Removed

### Fixed

- Polygon winding was reported backwards, and centroids double-counted the repeated closing vertex of a ring.
- Library Lane's $5 cap was applied at every hour, under-quoting a midday stay; it now applies only to arrivals after 3pm on weekdays and any time Saturday.
- Michigan Stadium's coordinate sat inside the bowl, where no walking route can reach it; moved to the north pedestrian approach.

### Security

[Unreleased]: https://github.com/BereZone/curb/commits/main
