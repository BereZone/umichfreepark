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

#### Verified city rates — checked 2026-08-03

Read directly off [a2dda.org/parking-rates](https://www.a2dda.org/parking-rates/) and [a2gov.org/services/parking](https://www.a2gov.org/services/parking/).

| Item | Rate |
|---|---|
| Parking structures | $1.80/hr |
| Parking lots | $2.60/hr |
| On-street meters | $2.60/hr |
| Half-price meters | $1.30/hr, 10-hour limit |
| Library Lane | $5.00 after 3pm, out by 6am |
| 415 W. Washington | $5/entry flat |
| Monthly permit, standard | $265/mo |
| Monthly permit, reserved | $365/mo |

Half-price meters are on the 300 block of S. First, the 300 and 400 blocks of N. Ashley, the 300 block of W. William, the 400 block of S. Ashley, and the 700 block of Packard.

**Fines:** $15 by end of next business day, $25 within 14 days, **$60 after 14 days**, $70 after 30. Plus a $3.50 service charge for online or phone payment.

#### Two different free rules — do not conflate them

This is the single easiest way to ship a wrong "FREE", so it gets stated explicitly.

| | Structures and gated lots | On-street meters |
|---|---|---|
| Paid | Mon–Sat | Mon–Sat 8am–6pm |
| Free | **Sunday 4am → Monday 4am** | Evenings, **all day Sunday** |
| Free holidays | "holidays observed by PCI Municipal Services" | 13 City-observed holidays |

The structure window is Sunday 4am to Monday 4am, **not** midnight-to-midnight. A car parked at 2am Sunday is still in Saturday's paid period; a car still parked at 5am Monday is back in the paid period. A naive day-of-week check gets both ends wrong.

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

## Open questions

### Which holidays are structures actually free? — UNRESOLVED

The DDA states structures are "free on holidays observed by PCI Municipal Services." **PCI does not appear to publish that list anywhere.** Searched `pcia2.com` — the locations, rates, FAQ, and meter pages contain no observed-holiday list for free parking.

What PCI *does* publish is a list of holidays on which **Limited/Overnight permit holders get unrestricted access**. That is a different rule about permit access hours, and it must not be borrowed as the free-parking list. Doing so would tell a student a structure is free on a day it isn't.

Until someone confirms it with PCI at (734) 761-7235, structures are modeled as **free on Sundays only**, and holiday-free status for structures is `unknown`. The engine must not claim a structure is free on a city holiday.

The meter holiday list, by contrast, is published in full on a2gov.org and is `verified`.

### Address conflict at First & William

PCI's facility page says 300 First St.; the DDA FAQ says 216 W. William St. Both are primary sources. Unresolved — no address ships for that lot until it is.

Its hourly rate is also unclear: the PCI page lists only monthly parking, which suggests it may be permit-only. Not modeled as hourly until confirmed.

## Known gaps

### Residential permit districts — not modeled

Not present in OpenStreetMap; they must be hand-digitized from City of Ann Arbor sources. This is simultaneously **the highest-value data the app could hold** — near-campus residential streets are where students actually circle looking for parking — and the largest single piece of work remaining. Deliberately out of scope for v1.

### Community-sourced areas

After-hours bank lots, county lots, and residential carve-outs will be `community` when added. They render with a visible caveat and a distinct map treatment, always.

### Data-as-of date

The app displays a "data as of" date on the Learn screen. Keep it honest — it is the user's only signal about how much to trust what they're looking at.

## Corrections

Wrong data is this project's most likely and most costly bug. Anyone can report one: [data correction issue](../../../issues/new?template=data-correction.yml). A photo of the posted sign is enough evidence.
