# AGENTS.md

Instructions for coding agents working in this repository. Read this before changing anything.

## What MFreePark is

A parking app for University of Michigan students in Ann Arbor. One Expo codebase, web and iOS. It answers "what can I park in right now, for how much, near this building?" by unifying City of Ann Arbor and U-M parking rules — two authorities no existing app covers together.

**No backend, no database, no auth.** Every rule and polygon ships in the bundle. The app must work with zero signal inside a parking structure, because that is exactly where it gets used.

## Standards

- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).
- `CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/). It is **hand-maintained** — never generate it from commit history.
- Versions follow [Semantic Versioning](https://semver.org/).

See `CONTRIBUTING.md` for the full workflow.

## Documentation

Documentation lives in `docs/`. `README.md` stays lean — a description, a quickstart, and links out. **Do not let the README grow into a manual.** If you are adding more than a few lines of explanation to the README, it belongs in `docs/` instead.

## Architecture rules — non-negotiable

### 1. The engine is pure TypeScript

`src/engine/` imports nothing from React, React Native, Expo, MapLibre, or any map library. Pure functions only. This is what makes the iOS port nearly free and the logic testable without rendering.

If you want `useState` in `src/engine/`, the boundary is wrong. Move the state outward, not the logic inward.

### 2. No engine function calls `new Date()`

Every engine function takes an explicit `at: Date` parameter. This makes tests deterministic and gives the time-scrubber feature for free.

All date math computes in **`America/Detroit`**, never the device time zone, via `@date-fns/tz`. A student home in California over break must still get Ann Arbor's answer.

### 3. `encoding.ts` is the anti-drift mechanism

`src/components/Map/encoding.ts` is a pure function: `(area, status) → { hue, borderStyle, borderWidth, label }`. Both map renderers call it and translate the result into their own primitives.

**Never let a color, stroke width, or dash pattern be decided inside a renderer file.** That is how two implementations silently diverge. `Map.native.tsx` and `Map.web.tsx` both satisfy the contract in `types.ts`; neither one owns a design decision.

### 4. Rendering is separated from geometry

`src/geo/` holds map-agnostic helpers — centroids, bounding boxes, point-in-polygon. It may import Turf, but not React and not any map library.

The layering: the engine decides *what is true*, `encoding.ts` decides *how it should look*, the renderers decide *how to draw it*, components decide *how it behaves*.

## Data rules

Every record in `src/engine/data/` carries `lastVerified` (date), `source` (URL), and `confidence: 'verified' | 'community'`.

- **`verified` requires a working URL to a primary source** — `a2gov.org`, `a2dda.org`, `pcia2.com`, `ltp.umich.edu`. Not a secondary aggregator, not recollection.
- Anything you cannot source is `community`, and renders with a visible caveat and a distinct map treatment.
- **Never present unverified parking as certain.** A wrong "FREE" costs a student a $70 ticket. That is this project's most likely and most costly bug class.
- Do not pull from SpotAngels, MGoPark, ParkMe, or Parkopedia. Their compiled datasets are their product; model the published rules from the authorities themselves.

## Accessibility is a build requirement

- The list view is the accessible equivalent of the map, not a nice-to-have. Every polygon selectable by tap must also be reachable there.
- `accessibilityRole` and `accessibilityLabel` on every interactive element; `accessibilityLiveRegion` on the countdown.
- Free vs. paid is encoded by **border style and text**, never by hue alone — that is what keeps the map legible to colorblind users. Preserve that property.
- 4.5:1 contrast minimum. 44×44pt minimum touch targets. Honor reduce-motion.

## Conventions

- No raw hex in component files. Colors come from `src/theme/`.
- Tabular figures on all numerals so the countdown does not jitter.
- Comment the *why* on non-obvious logic, especially time math and map style expressions. Skip comments that restate code.
- Copy is design material: "Free in 2h 18m," not "Enforcement window terminates." Buttons name what happens: "Check another time," not "Submit."
