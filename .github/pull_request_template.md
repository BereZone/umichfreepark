# What this changes

<!-- One or two sentences. Write it for someone using the app, not for someone reading the diff. -->

## Why

<!-- The parking situation or bug behind it. Link the issue if there is one. -->

## Checklist

- [ ] `CHANGELOG.md` updated under `## [Unreleased]`, written for a student using the app
- [ ] `npm test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
- [ ] Version numbers untouched by hand (`make bump` owns all four locations)

## Verified on both platforms

Web and iOS use entirely different map renderers — MapLibre and Apple Maps — so
a change that looks right on one can be wrong on the other. Tick both, or say
why it cannot affect rendering.

- [ ] Web (`npm run web`)
- [ ] iOS (`npm run ios`, or Expo Go on a device)
- [ ] Not applicable — this change cannot affect the map, the layout, or the theme

## If this touches parking data

- [ ] Every changed record has `lastVerified`, `source`, and `confidence`
- [ ] Anything marked `verified` links to a primary source (a2gov.org, a2dda.org, pcia2.com, ltp.umich.edu)
- [ ] Anything that cannot be sourced is marked `community`

## If this touches the map

- [ ] No color, stroke width, or dash pattern decided inside a renderer file — `encoding.ts` owns those
- [ ] Free vs. paid still distinguishable without color (border style and text)
