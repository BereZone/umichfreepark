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
- U-M lot-by-lot enforcement hours for all four enforced campuses — 242 lots with permit tier, address, and hours.
- Verified U-M rules in `docs/data-sources.md`: parking is open to the public outside posted enforcement hours, first-years and sophomores cannot hold a commuter permit, and U-M observes a third holiday list that matches neither the city's nor PCI's.
- Rules engine calendar: Ann Arbor time-zone handling, computed floating holidays, and per-authority holiday lists for city meters, city structures, and U-M.
- Raw OpenStreetMap parking geometry for Ann Arbor — 1,646 polygons, committed unedited so hand-tagging shows up as a reviewable diff.
- Enforcement-hours parser turning U-M's 17 published spellings into evaluable schedules, with unparseable strings treated as enforced.
- Free/paid status and next-transition countdown for city meters, city structures, and U-M lots, correct across daylight saving time.
- 262 parking areas with verified rates: 7 DDA structures, 2 city lots, 9 metered surface lots, the downtown meter district, the half-price meter blocks, and 242 U-M lots.
- Nine metered surface lots — Palio, Main & Ann, City Hall, Community High, Farmer's Market, Kerrytown, Gandy Dancer, Broadway Bridge, and Depot — which cost the same as the gated lots but are free every evening and all Sunday.
- The downtown on-street meter district, drawn from the city's own published boundary, so on-street parking around Maynard, State, and Liberty appears on the map instead of being invisible.
- Precomputed walking times from all 80 buildings to all 100 areas that have a location, so ranking works with no signal.
- Eligibility, cost, and ranking by cheapest, closest, or balanced, defaulting to a first-year with no permit.
- Home-game-day warnings for U-M lots, covering the seven confirmed 2026 dates.
- Design tokens for colour, type, spacing, and motion, with light and dark schemes that both clear 4.5:1 contrast.
- Map encoding as a single pure function, so both renderers derive appearance from one place.
- Map-agnostic geometry helpers: winding normalization, bounding boxes, point-in-polygon, and a label point guaranteed to fall inside its lot.
- Shared renderer contract and drawable geometry for the 101 mapped areas, extracted to 51 KB rather than bundling the 2 MB raw dataset.
- Both map renderers: react-native-maps over Apple Maps on iOS, maplibre-gl over OpenFreeMap on web.
- Map screen with a live free-count, a per-area detail panel, and a countdown to the next free/paid change.
- List view with cheapest/closest/balanced sorting, duration selection, and trade-offs stated in words.
- Building search that matches colloquial names — "the dude", "ugli", "the big house" — not just official ones.
- Map and list share one destination and duration, so switching between them preserves the trip.
- Learn screen covering the fine schedule, the three sets of rules, permit eligibility, free buses, and what we don't know.
- Location permission requested as When In Use only, with a purpose string that says what it is for.
- Reduce-motion support and selection haptics on the map.
- Tapping a list row selects that area, the same as tapping its polygon, and the selection follows you between the map and the list.
- `docs/accessibility.md` — the accessibility audit, saying which properties are enforced by tests and which still need a real device.
- CI builds the iOS app on pushes to `main` and fails if the app declares a permission it does not request. Everything else runs on Linux and never touches the native half.

- U-M's own published lot coordinates, used to find polygons for lots OpenStreetMap has mapped but never labelled. Coordinates only — the same source's enforcement hours disagree with the parking office for 100 of the 104 lots they share, so they are not carried at all.
- The map screen now has the controls it was missing: where you're going, how long you're staying, and how to sort. Previously the map was ranked against a destination you could only set on the other tab.
- A key on the map, saying what the border styles and the fill colours mean. It draws its swatches from the same numbers the map draws with, so it cannot end up describing a map that no longer exists.
- Tapping an area now shows what your stay costs and how far the walk is, not just whether it is free right now.
- **Tell CURB who you are.** The Learn tab now takes your year and permit, and the whole app answers for that person. It always assumed a first-year with no permit, which meant a senior with a Blue permit was told they could not park in their own lot.
- CURB remembers where you were going, how long for, how you sort, and your last five destinations. Opening the app no longer starts over at Mason Hall.
- The destination field offers your recent buildings before you type.
- Selecting an area from the list now moves the map to it. It used to select something you could not see.
- On a wide screen the map keeps the ranked list beside it instead of under it, and the list and Learn screens stop stretching their text across the whole window.
- **Use my location.** CURB finds the building you are standing next to and ranks parking from there. It asks only when you press it, never on launch, and says what to do instead if you refuse — or if there is no signal, which is normal inside a structure.

### Changed

- The map draws 161 parking areas, up from 101. Sixty more U-M lots now have a boundary and a label.
- Which lots get a price label is now decided in one shared place instead of separately per platform, and the limit counts labels on your screen rather than in the whole dataset — so zooming in labels everything you can see, instead of spending the budget on lots a mile away. Labels also step aside for one another rather than stacking, and where two lots are too close to label both, the free one keeps its label.
- The downtown meter district is drawn as a light outline rather than as a lot. It is two kilometres across and contains most of the structures the map is about, so at full weight it laid a slab over all of downtown and central campus and everything inside it was read through a wash.
- The list no longer repeats the destination as a heading directly above the field that already shows it, and rows no longer all begin with the same word the price beside them is already saying.
- Callouts carry their meaning as a tinted block rather than a coloured stripe down one edge. At large text sizes a callout wraps to five lines and the stripe was only ever next to one of them.

### Deprecated

### Removed

### Fixed

- The map's tile attribution sat underneath the panel that slid up over it. Attribution is a licence condition of the tiles, so the panel now sits below the map rather than on top of it.
- Building search results were drawn behind the duration and sort buttons underneath them, so choosing a building meant reading its name through a row of chips.
- The web map drew nothing at all — no streets, no lots, no labels, just an empty rectangle. MapLibre could not locate its own background worker inside our bundle and failed without reporting it, so everything the worker draws was silently absent.
- The "free right now" count was measured against the 101 areas the map could draw rather than the 262 CURB knows about, so both the count and the total it was shown against were wrong.
- U-M's park-and-ride lots read as paid at every hour. They are free to anyone with no permit, but they also carry posted hours — the hours say who the lot is for, not what it costs — and the app was pricing the hours.
- Sixty U-M lots were absent from the map because the join only read OpenStreetMap's `name`. The lot code usually lives in `ref` (`M28`, `NC60`, `M15`), and U-M publishes coordinates for lots that carry no code at all.
- On iPhone the map labelled only 24 lots no matter how far you zoomed in, while the web labelled as many as fit. Both platforms now use the same rule.
- About 93 U-M lots, including `M28` and `NC60`, were missing entirely. A third of U-M's published rows leave the permit-tier column blank, and the parser had been discarding every row that did.
- 160 more U-M lots were absent because the map data decided whether a lot existed: a lot nobody had drawn in OpenStreetMap never appeared, even with published hours. Lots now ship with their rules whether or not anyone has mapped them.
- First & William showed no rate at all. The city publishes it as permit-only, so it now says so.
- Metered surface lots were treated as gated, showing them as paid on a Tuesday evening when they are free after 6pm.
- The iOS build failed in three places because the project path contains a space, each one a path interpolated into a shell command without quotes. Two are patched in dependencies, one in a config plugin; renaming the directory would remove the need for all three.
- The iOS app did not compile at all under Xcode 26: `expo-modules-jsi` uses Swift that the current compiler rejects. Patched locally until upstream fixes it, with a note saying when to drop the patch.
- The iOS build declared background-location and motion permissions the app never requests, two of them carrying Expo's placeholder "Allow CURB to access your location" text. Only the When In Use string ships now, and the build fails if the others come back.
- At large text sizes the list screen showed no parking at all: the header filled the screen and pushed every result out of reach. The controls now scroll with the results.
- Text at large accessibility sizes had huge gaps between lines and labels stuck to the top of their buttons, because the type scale pinned line height to a fixed number that could not scale with the reader's setting.
- List rows announced themselves as buttons to a screen reader but did nothing when activated.
- Tab bar glyphs were read aloud next to their own labels, so VoiceOver said "black diamond, Map".
- The Learn screen still listed the First & William rate as unknown after it was resolved, and hardcoded a holiday count next to a computed one.
- Polygon winding was reported backwards, and centroids double-counted the repeated closing vertex of a ring.
- Library Lane's $5 cap was applied at every hour, under-quoting a midday stay; it now applies only to arrivals after 3pm on weekdays and any time Saturday.
- Michigan Stadium's coordinate sat inside the bowl, where no walking route can reach it; moved to the north pedestrian approach.

### Security

[Unreleased]: https://github.com/BereZone/curb/commits/main
