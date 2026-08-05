/**
 * Core engine types.
 *
 * Nothing in src/engine/ imports React, React Native, Expo, or any map library.
 * These are plain data shapes so the same logic runs in a test, on iOS, and on
 * the web without change.
 */

/**
 * Who sets the rules for a given parking area.
 *
 * This is a discriminant, not a label. The three authorities do not share an
 * enforcement model and — critically — do not share a holiday list, so nothing
 * in the engine may treat them interchangeably. See docs/data-sources.md.
 */
export type Authority =
  /** City of Ann Arbor on-street meters. Free evenings, Sundays, and 13 city holidays. */
  | 'city-meter'
  /** DDA structures and gated lots. Free Sunday 4am → Monday 4am. Holiday list unpublished. */
  | 'city-structure'
  /** U-M permit lots. Free outside that lot's posted enforcement window. */
  | 'umich';

/**
 * How much we trust a record.
 *
 * `verified` requires that a human opened the cited primary-source URL and read
 * the value there. Not that it seemed right, and not that another app agrees.
 * A wrong "FREE" costs a student a $70 ticket, so when in doubt this gets
 * downgraded rather than the caveat softened.
 */
export type Confidence = 'verified' | 'community';

/** Provenance carried by every data record. Enforced by review, not by types alone. */
export interface Provenance {
  /** Date a human confirmed the value at `source`. ISO `YYYY-MM-DD`. */
  lastVerified: string;
  /** URL of the authority's own page. Not an aggregator. */
  source: string;
  confidence: Confidence;
}

/**
 * What it costs.
 *
 * Money is in whole cents, never floating-point dollars. $1.80/hr as 1.8
 * survives one multiplication and then starts producing 5.401 for three hours.
 * Integers make the arithmetic exact and the display code responsible for
 * formatting.
 */
export type Rate =
  | {
      kind: 'hourly';
      centsPerHour: number;
      /**
       * Some facilities cap the hourly rate, but only for cars that ENTER
       * inside a particular window — Library Lane is $5.00 after 3pm on
       * weekdays and all day Saturday, provided you exit by 6am.
       *
       * `windows` is not decoration. Applying the cap unconditionally
       * under-quotes the price at every other hour, which is the wrong
       * direction to be wrong: it tells a student parking is cheaper than it
       * is. Empty `windows` means the cap always applies.
       *
       * The cap is also not a flat fee — below it you still pay by the hour.
       */
      cap?: {
        cents: number;
        note: string;
        /** Entry-time windows in which the cap applies. Evaluated against arrival. */
        windows: import('./enforcement').EnforcementSchedule[];
      };
    }
  /** A flat charge per entry, regardless of duration. */
  | { kind: 'flat'; cents: number }
  /** No hourly option — permit holders only. Not the same as "free". */
  | { kind: 'permit-only' }
  | { kind: 'free' }
  /** We could not source a rate. Must render as a caveat, never as a number. */
  | { kind: 'unknown' };

export type AreaKind = 'structure' | 'lot' | 'meter-zone';

/**
 * One parkable area: a structure, a lot, or a block of on-street meters.
 *
 * `schedule` is deliberately allowed to be null — that means the authority's
 * published hours could not be confidently parsed, and the engine treats it as
 * enforced. See enforcement.ts for why that direction and not the other.
 */
export interface ParkingArea {
  id: string;
  name: string;
  authority: Authority;
  kind: AreaKind;
  /** `way/30839161` — joins this record to a polygon in data/raw/osm-parking.geojson. */
  osmId: string | null;
  rate: Rate;
  /** U-M permit color ("Blue", "Orange", …). Absent for city areas. */
  permitTier?: string;
  provenance: Provenance;
  /** Shown to the user verbatim when present. Keep it plain-language. */
  note?: string;
}
