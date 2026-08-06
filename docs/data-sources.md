# Data sources

Where every parking rule in UMichFreePark comes from, and — just as importantly — what we don't know.

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
| [pcia2.com](https://www.pcia2.com/) | PCI Municipal Services — operator, payment, facility detail, **which lots are metered** |
| [City ArcGIS](https://a2-mi.maps.arcgis.com/home/item.html?id=d62a590c5155496680dfa8d3f129f185) | DDA lot polygons, lot type (hourly vs permit-only), accessible-space counts, DDA parking-district boundary |

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

#### Three different free rules — do not conflate them

This is the single easiest way to ship a wrong "FREE", so it gets stated explicitly. There is no shared rule here and no shared holiday list; each authority is its own case.

| | City structures and gated lots | City on-street meters | U-M permit lots |
|---|---|---|---|
| Paid | Mon–Sat | Mon–Sat 8am–6pm | Per-lot enforcement window |
| Free | **Sunday 4am → Monday 4am** | Evenings, **all day Sunday** | Outside that lot's window — but 36 lots have none |
| Free holidays | "holidays observed by PCI Municipal Services" | 13 City-observed holidays | 5 U-M holidays + a Christmas→New Year range |

The structure window is Sunday 4am to Monday 4am, **not** midnight-to-midnight. A car parked at 2am Sunday is still in Saturday's paid period; a car still parked at 5am Monday is back in the paid period. A naive day-of-week check gets both ends wrong.

### University of Michigan

| Source | Covers |
|---|---|
| [ltp.umich.edu](https://ltp.umich.edu/) | Permit categories, eligibility, rates, enforcement hours |
| U-M campus parking map (linked from LTP) | Lot designations and locations |

The spec expected this to be the weakest link. **It isn't.** LTP publishes a lot-by-lot table — lot ID, name, address, enforcement hours, permit tier — for all four campuses it enforces. That is *more* granular than anything the city publishes. **243 rows, 242 unique lots** (Central 74, Medical 62, North 84, Ross Athletic 22), captured in `src/engine/data/umich-lots.json` by `scripts/fetch-umich-lots.mjs`.

**82 of the 242 have a polygon**; the rest are list-only until someone names them in OpenStreetMap. A lot without geometry still ships with its rules — the map cannot draw it, but the list can state its hours, which is what stops someone standing in front of it wondering.

> **The tier column is optional, and that once cost us a third of the dataset.** Roughly a third of LTP's rows omit it — service docks, loading bays, restricted areas belonging to no permit color. An earlier parser required five cells per row and silently dropped every one of them, losing about 93 lots including `M28` and `NC60`. Nothing failed; the dataset was simply short, which is the worst way for parking data to be wrong. Four cells is a valid lot with an unknown tier.

**Re-verify every August**, before the term starts. Re-running that script is the whole job.

#### Why U-M data comes through the Internet Archive

`ltp.umich.edu` sits behind Cloudflare bot protection and returns **403 to every automated request** — verified directly, including with a browser User-Agent. That is the university's call and we don't work around it.

The Internet Archive crawls the site successfully. A Wayback capture is **not a secondary source**: it is a byte-for-byte copy of LTP's own page with a recorded capture date, which is strictly more provenance than a live fetch, because the date is recorded rather than assumed. What it costs is freshness, so every record carries the capture timestamp it came from.

All four campus tables currently come from captures dated **2026-07-31** — three days before they were read. That is current for the 2026–27 year.

#### The rule that makes the U-M half of the app work — verified 2026-08-03

From the [Locations and Enforcement](https://ltp.umich.edu/parking/locations-and-enforcement/) page, verbatim:

> Parking facilities are open to the public **outside enforcement hours**.

Stated campus-wide, not as a per-lot carve-out. This is what lets UMichFreePark tell a student without a permit that a Blue lot is legal at 7pm.

The corollary matters just as much: **117 of the 242 lots are enforced "24 hrs, 7 days"** and are therefore *never* open to the public. Almost all of the Medical campus falls in this bucket. Those must never render as free.

#### Enforcement hours do not follow the permit color

Some Yellow lots and some Blue lots share identical windows; some Blue structures are `6am–5pm, Mon–Sat` and others are `24 hrs, 7 days`. **Tier does not predict hours.** Any rule of the form "Blue lots are free after 6" is wrong, and the per-lot table is the only published authority. LTP's own pages tell users to check the sign at the entrance.

The published strings are also not machine-uniform — 17 distinct formats across 150 lots, including `6am – 5pm, 7 Days` and `6am – 5pm Sun-Sat` meaning the same thing, and one lot with separate permit and visitor windows in a single cell. Parsing them is engine work, not fetch work.

#### A third holiday list — do not merge it with the other two

U-M suspends parking enforcement entirely on its own list, which matches **neither** the city's 13-day meter list nor PCI's unpublished structure list:

> The regulations are in force throughout the calendar year except for: Memorial Day, Independence Day, Labor Day, Thanksgiving Day and the following day, Christmas through New Year's Day.

Two things to encode carefully. It is much shorter than the city's list — **no MLK Day, no Presidents Day** — so a student off for MLK Day still pays at U-M. And "Christmas through New Year's Day" is a **multi-day range**, not a single date, which no other holiday rule in this app is.

Three authorities, three holiday rules. The engine needs per-authority holiday sets; a single global list would be wrong for at least two of them.

#### Class-year eligibility — verified 2026-08-03

> Student parking permits are available to junior, senior and graduate students. […] Juniors and seniors are limited to the Student Orange permit; additional options are available to graduate students. All students, including freshmen and sophomores, are eligible to purchase Student Storage parking permits.

First-years and sophomores **cannot** hold a commuter permit. Storage only, and Storage is a park-it-and-leave-it lot, not a way to get to class. This is why the default profile is *no permit, first-year* — the most restrictive case, so an unconfigured app never tells someone they can park where they can't.

The eligibility page itself was last captured 2025-06-18, but the restriction is **independently restated on the Student Orange page in the current 2026-07-31 capture** ("Juniors, Seniors and Graduate Students are eligible…"), which is what makes it `verified` rather than `community`.

#### U-M open questions

- **FY27 pricing for Student Yellow/After Hours, Student Storage, and Blue** is unconfirmed — only FY26 captures exist for those three pages. Student Orange ($96.00 for a full year bought July 1–14) and Student After Hours ($78.00) *are* confirmed for FY27. Nothing unconfirmed ships as a price.
- **No 2026–27 football parking notice** has been published or captured. The structural rules (out by 10pm Friday, two hours post-game, lots south of Hill Street) are stable across the 2024 and 2025 notices, but the 2026 home-game *dates* still need a source — this is the same gap as the unconfirmed Nov 21 date.
- **The City of Ann Arbor's own game-day policy** was not found. U-M's policy governs U-M lots; what happens to city meters near the stadium on a home Saturday is still unsourced.
- **No stable URL for a current campus-wide parking map PDF** could be confirmed.
- **`SC20` and `SC39` do not appear on LTP's pages at all.** Both are real lots students name, and both are absent from the raw HTML of all four campus tables — zero mentions, not a parsing miss. They ship not at all rather than with invented hours.

  U-M's campus map does list `SC39`, as a Park & Ride at 42.2527, -83.7435 with hours "M-F 7am-7pm", and 15 other lots LTP omits (`M27`, `M56`, `M57`, `M59`, `M76`, `M91`, `M92`, `N17`, `NC74`, `SC9`, `SC12`, `SC13`, `SC14`, `SC38`, `W5`). They still do not ship. That source is the one whose hours contradict LTP on 100 of 104 shared lots, so for a lot LTP never mentions there is nothing to check it against — the hours would be unverifiable by construction. Only one of the sixteen even has a polygon. What is now known is where they are, which is recorded here so the next person does not re-derive it.
- **Four lots publish `NA` for hours** (`N26`'s neighbours `W25`, `W28`, `W29` — Helen Newberry Dock, Perry School Loading Dock, Division Street). That is LTP declining to state them, not a string we failed to read. They ship, treated as enforced, flagged uncertain, with a note saying no hours are published.
- **Lot `M18` appears twice** in LTP's Medical table, as both "P2 University of Hospital" and "P3 Taubman Center", same address. Upstream quirk, faithfully preserved. Both are 24/7 Visitor, so it cannot produce a wrong "free" — but any join on lot ID must expect it.

#### Meter lots vs gated lots — the distinction that decides a 7pm answer

Both cost **$2.60/hr**, which makes them look like the same thing. They are not:

| | Enforced | Free |
|---|---|---|
| **Gated DDA lot** (South Ashley) | continuously | Sunday 4am → Monday 4am only |
| **Meter lot** (Kerrytown, Depot, Palio…) | Mon–Sat 8am–6pm | every evening, all Sunday, city holidays |

At 7pm on a Tuesday one costs money and the other does not. Collapsing them produces a wrong "FREE", so the split is sourced rather than inferred: a2gov states that metered parking **"on-street and in lots"** runs Mon–Sat 8am–6pm, and PCI — who operate the meters — publish which lots those are on their [Meter Lot Locations](https://pcia2.com/meter-lot-locations/) map.

Nine meter lots ship: Palio, Main & Ann, City Hall, Community High, Farmer's Market, Kerrytown, Gandy Dancer, Broadway Bridge, Depot.

`scripts/fetch-dda-parking.mjs` (`npm run data:dda`) joins PCI's list to the city's polygons. **The join is a hand-written table in the script, not a proximity match.** Broadway Bridge and Depot Street are adjacent riverside lots and nearest-centroid matching puts PCI's "Depot Lot" on the wrong one; four of the nine pairs are ambiguous by distance. The script fails loudly if either side stops matching the table.

### Geometry

Polygons come from [OpenStreetMap](https://www.openstreetmap.org/) via the [Overpass API](https://overpass-api.de/), queried by `scripts/fetch-osm-parking.mjs` (`npm run data:polygons`). Raw output is committed **un-edited** to `data/raw/osm-parking.geojson` so that hand-tagging appears as a reviewable diff.

As of 2026-08-03: **1,646 features** — 1,634 polygons and 12 multipolygons — of which only 129 carry a `name`. That count is not the target dataset. It includes every private residential and business lot in the bbox; the ~25–30 areas UMichFreePark actually models get selected by hand out of it.

`amenity=parking_space` is deliberately excluded — that is per-space granularity, thousands of features for a handful of structures, and not what UMichFreePark draws.

**This file is geometry only.** It is not a source of truth for rates, access, or enforcement. OSM `fee` and `access` tags are present and are frequently stale, incomplete, or free-text (one Ann Arbor lot tags `fee` as `yes @ (visitor AND Mo-Fr 06:00-17:00)`). Rules come from the authorities, hand-verified; OSM only answers "where is the polygon."

OSM data is ODbL-licensed, which is what permits us to ship it and to precompute walking times from it.

#### Joining U-M lots to those polygons

`scripts/build-umich-areas.mjs` runs three passes, strongest evidence first, and records which one won in each lot's `geometryVia`:

| Pass | Evidence | Lots |
|---|---|---|
| `code` | The official lot code in OSM's `ref`, `name`, or `alt_name` | 116 |
| `contains` | U-M's own published coordinate falls inside exactly one parking area | 20 |
| `near` | That coordinate sits within 25 m of an unclaimed, uncoded parking area | 6 |

Reading only `name` — which is what the first version did — found 82. `ref` is the tag OSM actually documents for a feature's code, and mappers use it that way here (`ref=NC60`, `ref=M28`); ignoring it hid 34 lots that had been mapped all along.

Guards, because a wrong polygon means a student reads the wrong lot's rules:

- Every match is checked against the campus LTP files the lot under. Five satellite lots legitimately fall outside their campus and are allowlisted individually, each with the LTP address that justifies it.
- A polygon that carries its own lot code is off limits to the coordinate passes, so a stray point cannot take a shape from a lot that named itself.
- The coordinate passes reject a polygon whose OSM `operator` names someone other than U-M. `NC37` is why: U-M's coordinate for it lands inside the **AATA-operated** Green Road Park & Ride, and accepting that would have drawn LTP's permit hours over a lot with a different authority, different signage, and a different enforcer.

#### U-M's published lot coordinates — geometry only

The official campus map at <https://maps.studentlife.umich.edu/> is backed by `https://apibuilder.studentlife.umich.edu/api/1/type/parking?limit=-1`, fetched by `scripts/fetch-umich-locations.mjs` (`npm run data:umich-locations`). 120 lots with a coordinate.

**We keep the coordinates and discard everything else.** The endpoint also carries `enforcementhours` and a permit `type`, and those disagree with LTP for **100 of the 104 lots the two sources share**. Some is formatting, some is not:

| Lot | Campus map | LTP |
|---|---|---|
| `C2` | M-F 6am-6pm | 24 hrs, 7 days |
| `W3` | M-F 6am-6pm | 6am – 6pm, Mon – Sat |
| `W9` | M-F 6am-6pm | 6am – 5pm, Mon – Sat |

Believing the campus map on `W9` would tell a student the lot goes free at 5pm on a Saturday when LTP says it does not. LTP is the parking authority; Student Life's map is a directory of where things are. On rules LTP wins, and the way we hold that line is to not carry the other numbers at all — a field that is not in the file cannot be read by mistake later.

A wrong coordinate also fails safe in a way a wrong hour does not: the join simply drops it.

#### Hand-placed lot points — also geometry only

U-M's map omits a coordinate for 89 of the lots LTP publishes, which leaves passes 2 and 3 with no input at all. `src/engine/data/umich-lot-points.json` supplies those coordinates by hand. It is the one file under `src/engine/data/` that is neither generated nor a rules source.

It is safe to hand-maintain for the same reason the campus map's coordinates are safe to trust: **a point here only decides which polygon gets drawn.** It contributes no hour, no tier, no rate. Place one badly and the map shows the wrong outline — it cannot produce a wrong "free". A rule may never be added on local knowledge; a pin may.

Published points are offered to the join first, so a hand-placed one can only fill a gap, never override the university. `geometryVia` records which kind supplied each shape (`contains (hand-placed point)`, `near 18m (hand-placed point)`), so a reviewer can re-check those first. The build refuses a pin for a lot code LTP does not publish, or for one that already has a published coordinate.

Entries under `pending` are deliberately not read by the build — a coordinate someone has flagged as doubtful must not be able to claim a polygon just because OSM later maps something nearby.

#### What is still not drawn

166 of 262 areas have a polygon. Of the 96 that do not, 95 are U-M rows, and they are overwhelmingly **loading docks rather than parking lots** — "Mason Hall Dock", "Chemistry Dock", "Pharmacy Service Center" — with addresses like `Canal Street (behind building)` or none at all. LTP lists them because they carry permit rules. Nobody has mapped them because they are not places anyone parks.

They ship with their rules and no geometry. Geocoding a building's street address and drawing a boundary there would put a lot across a lecture hall, which is a worse answer than no answer.

### Walk times

Computed at build time by `scripts/build-walk-matrix.mjs` against the public [Valhalla](https://valhalla1.openstreetmap.de/) instance, `pedestrian` costing, over OSM data. Pairs Valhalla can't route fall back to haversine distance × 1.35, and the script reports how many did.

We use an OSM-based router rather than Apple's or Google's specifically because their terms restrict retaining directions results, and this app's entire premise is shipping those results offline in the bundle.

## Open questions

### Which holidays are structures actually free? — UNRESOLVED

The DDA states structures are "free on holidays observed by PCI Municipal Services." **PCI does not appear to publish that list anywhere.** Searched `pcia2.com` — the locations, rates, FAQ, and meter pages contain no observed-holiday list for free parking.

What PCI *does* publish is a list of holidays on which **Limited/Overnight permit holders get unrestricted access**. That is a different rule about permit access hours, and it must not be borrowed as the free-parking list. Doing so would tell a student a structure is free on a day it isn't.

Until someone confirms it with PCI at (734) 761-7235, structures are modeled as **free on Sundays only**, and holiday-free status for structures is `unknown`. The engine must not claim a structure is free on a city holiday.

The meter holiday list, by contrast, is published in full on a2gov.org and is `verified`.

### Two DDA facilities have no confidently identified polygon

Seven of the eight DDA structures are tagged in OSM with `operator=PCI Municipal Services` and match their street addresses to within a few metres. Two do not ship:

- **First & Washington (215 W. Washington)** — the only OSM candidates within 100 m are unnamed, untagged surface polygons. Any of them *might* be it.
- **415 W. Washington** ($5 flat) — same problem.

Neither ships a polygon. Guessing which unnamed rectangle is a $5 flat-rate lot is exactly the kind of plausible-looking error this project treats as its worst bug class. They can be added the moment someone identifies them on the ground, or when OSM names them.

### Address conflict at First & William

PCI's facility page says 300 First St.; the DDA FAQ says 216 W. William St. Both are primary sources. Unresolved — no address ships for that lot until it is.

**Its rate is resolved** (2026-08-04). It shipped as `unknown` because PCI's page listed only monthly parking, which hinted at permit-only without saying it. The city's DDA lot layer tags this one `TypeOfParking: "Permit Only"` while every other lot in the layer reads `"Hourly"` — the operator stating it outright. It is now `permit-only`, `verified`.

## Known gaps

### On-street meters are a district, not a block list

**No authority publishes which blocks have meters.** Not the city's open data portal, not its GIS org, not the DDA, not PCI — all four were searched on 2026-08-04. OpenStreetMap does not have it either: of 317 Ann Arbor ways carrying street-parking tags, only four say anything about fees, and the downtown core is tagged almost entirely `parking:both=no`. Nothing on Maynard, State, or Liberty.

So `downtown-meters` ships as the **DDA parking-district boundary**, which the city does publish, with a note saying exactly that. It covers the downtown and campus-edge core — Maynard, State, Liberty, and Forest are inside it; North Campus and outer Packard are not.

Two consequences worth knowing:

- It carries **no walk time**. It is roughly a square kilometre, so routing to its centroid would tell someone standing at the Michigan Union that the downtown meters are a twelve-minute walk. `walkSeconds` returns null for it; see `NOT_A_DESTINATION` in `scripts/build-walk-matrix.mjs`.
- The **half-price meter blocks are separate**, because those the city *does* name: the 300 block of S. First, the 300 and 400 blocks of N. Ashley, the 300 block of W. William, the 400 block of S. Ashley, and the 700 block of Packard. They ship as their own area with no geometry, since a named block is not a drawable shape without digitizing it.

The alternative was to invent a plausible list of metered blocks. It would have looked exactly like a sourced one, and would eventually have put someone in front of a "no parking" sign holding a phone that said otherwise.

### Residential permit districts — not modeled

**A source exists** (found 2026-08-04), which the earlier note here denied. The city publishes a `ResidentalPermit` layer through its ArcGIS org — per-parcel records carrying a district name (`BURNS PARK`, `NORTHSIDE`, …), a street address, and a `PERMIT_VALID` season (`September 1 - August 31`, `April 1 - October 31`). Over 1,000 records; the default query caps there, so paginate.

It is **per-parcel, not district polygons**, so turning it into something drawable means dissolving parcels into boundaries — real work, and the reason this stays out of v1 rather than the absence of data. Still **the highest-value data the app could hold**: near-campus residential streets are where students actually circle looking for parking.

### Community-sourced areas

After-hours bank lots, county lots, and residential carve-outs will be `community` when added. They render with a visible caveat and a distinct map treatment, always.

### Data-as-of date

The app displays a "data as of" date on the Learn screen. Keep it honest — it is the user's only signal about how much to trust what they're looking at.

## Corrections

Wrong data is this project's most likely and most costly bug. Anyone can report one: [data correction issue](../../../issues/new?template=data-correction.yml). A photo of the posted sign is enough evidence.
