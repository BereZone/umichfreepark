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
