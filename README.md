# CURB

Find free and cheap parking near University of Michigan buildings — a map that knows Ann Arbor's rules change by the hour. Web and iOS.

Ann Arbor parking is a *timing* problem as much as a location problem. Meters are free evenings, Sundays, and city holidays. Structures are free from 4 a.m. Sunday to 4 a.m. Monday. CURB shows you which parking is free *right now*, what any lot's rules are, and ranks your options by cost against walking distance to the specific building you're headed to.

It covers both authorities — City of Ann Arbor and U-M — because a student standing on State Street doesn't care who owns the asphalt.

Works offline. No account, no server, no tracking.

> **Not affiliated with the University of Michigan or the City of Ann Arbor.** Parking rules change; always check posted signage. Each area in the app shows when its data was last verified.

## Quickstart

```bash
nvm use          # Node version from .nvmrc
npm install
npm run web      # web
npm run ios      # iOS simulator or Expo Go
npm test         # engine tests
```

Full setup, troubleshooting, and data-regeneration steps: [`docs/development.md`](docs/development.md).

## Docs

- [Development](docs/development.md) — prerequisites, running, testing, regenerating datasets
- [Data sources](docs/data-sources.md) — where every parking rule comes from, and what's unverified
- [Accessibility](docs/accessibility.md) — what's enforced by tests, what was checked by hand, what still needs a device
- [Releasing](docs/releasing.md) — version bumps, tagging, the release pipeline
- [Contributing](CONTRIBUTING.md) — commits, changelog, versioning
- [Spec](docs/spec.md) — the original project brief
- [Changelog](CHANGELOG.md)

## Found wrong parking data?

That's the bug we most want to hear about. [Open a data correction issue](../../issues/new?template=data-correction.yml) — a link to the posted rule is enough.

## License

MIT. See [LICENSE](LICENSE).
