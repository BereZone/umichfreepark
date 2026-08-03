# Data sources

Where every parking rule in CURB comes from, and — just as importantly — what we don't know.

## The rule

Every record in `src/engine/data/` carries:

| Field | Meaning |
|---|---|
| `lastVerified` | Date a human opened the source and confirmed the value |
| `source` | URL of the **primary** source — the authority's own page |
| `confidence` | `'verified'` or `'community'` |

`verified` means someone opened that URL and read that number. It does not mean it seemed right, or that another app agrees. Anything else is `community`, and renders in the app with a visible caveat and a distinct map treatment.

**A wrong "FREE" costs a student a $70 ticket.** That asymmetry drives every decision here: when in doubt, downgrade the confidence rather than the caveat.

## What we model, and what we don't

We model the **published rules from the authorities themselves**. We do not pull from SpotAngels, MGoPark, ParkMe, or Parkopedia. Their compiled datasets are their product, and copying them would be both wrong and unverifiable — you can't cite a competitor's guess.

## Primary sources

### City of Ann Arbor / DDA

| Source | Covers |
|---|---|
| [a2gov.org/services/parking](https://www.a2gov.org/services/parking/) | On-street meter rates, enforcement hours, city-observed holidays |
| [a2dda.org](https://www.a2dda.org/getting-around/drive/) | DDA structures and surface lots, rates, monthly permits |
| [pcia2.com](https://www.pcia2.com/) | PCI Municipal Services — operator, payment, facility detail |

City rules are published as prose and hand-encoded into typed data. They are the **stronger** half of this dataset: rates are current, clearly stated, and centrally published.

Rates were last raised **July 1, 2026**.

### University of Michigan

| Source | Covers |
|---|---|
| [ltp.umich.edu](https://ltp.umich.edu/) | Permit categories, eligibility, rates, enforcement hours |
| U-M campus parking map (linked from LTP) | Lot designations and locations |

**Expect this to be the weakest link.** Lot-by-lot color designations and enforcement hours are less consistently published than the city's rates, and they change between academic years. Where enforcement hours aren't clearly published, the record is `community` with a caveat — not a guess dressed as a fact.

**Re-verify every August**, before the term starts.

### Geometry

Polygons come from [OpenStreetMap](https://www.openstreetmap.org/) via the [Overpass API](https://overpass-api.de/), queried by `scripts/fetch-osm-parking.mjs`. Most Ann Arbor lots and structures are already tagged `amenity=parking`. Raw output is committed un-edited so that hand-tagging appears as a reviewable diff.

OSM data is ODbL-licensed, which is what permits us to ship it and to precompute walking times from it.

### Walk times

Computed at build time by `scripts/build-walk-matrix.mjs` against the public [Valhalla](https://valhalla1.openstreetmap.de/) instance, `pedestrian` costing, over OSM data. Pairs Valhalla can't route fall back to haversine distance × 1.35, and the script reports how many did.

We use an OSM-based router rather than Apple's or Google's specifically because their terms restrict retaining directions results, and this app's entire premise is shipping those results offline in the bundle.

## Known gaps

### Residential permit districts — not modeled

Not present in OpenStreetMap; they must be hand-digitized from City of Ann Arbor sources. This is simultaneously **the highest-value data the app could hold** — near-campus residential streets are where students actually circle looking for parking — and the largest single piece of work remaining. Deliberately out of scope for v1.

### Community-sourced areas

After-hours bank lots, county lots, and residential carve-outs will be `community` when added. They render with a visible caveat and a distinct map treatment, always.

### Data-as-of date

The app displays a "data as of" date on the Learn screen. Keep it honest — it is the user's only signal about how much to trust what they're looking at.

## Corrections

Wrong data is this project's most likely and most costly bug. Anyone can report one: [data correction issue](../../../issues/new?template=data-correction.yml). A photo of the posted sign is enough evidence.
