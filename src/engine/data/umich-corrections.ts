/**
 * Hand corrections to LTP's published lot table.
 *
 * WHY THIS FILE EXISTS SEPARATELY
 *
 * `umich-areas.json` is generated: `npm run data:umich-lots` re-scrapes LTP and
 * `npm run data:umich-areas` rebuilds the join. Editing that file by hand would
 * work until the next regeneration and then silently revert, which is the worst
 * possible failure for parking data — a correction that disappears without
 * anyone noticing. Corrections live here and are applied downstream in
 * `areas.ts`, so a regeneration cannot lose them.
 *
 * WHEN A CORRECTION IS ALLOWED TO OVERRIDE A PRIMARY SOURCE
 *
 * LTP is the parking authority and its table is the source of record. A report
 * from the ground can still be right — tables go stale, and LTP's own pages say
 * the sign at the entrance is what governs — but it cannot be laundered into
 * looking authoritative. So every entry here carries its own `confidence`, and
 * anything that contradicts LTP without a published source is `community`,
 * which the app renders with a visible caveat.
 *
 * THE ONE-WAY RULE
 *
 * A correction may make the app MORE cautious on an unverified report. It must
 * not make it less. Turning "free after 5pm" into "enforced around the clock"
 * costs someone a walk if the report is wrong; the reverse costs them a $70
 * ticket if it is wrong. That asymmetry is the whole reason this app exists, so
 * it is the test any entry below has to pass.
 */

import type { Confidence } from '../types';

export interface UmichCorrection {
  /** Replaces the posted string, and so the parsed schedule. */
  enforcementHours?: string;
  /**
   * Replaces the permit tier. `null` clears it — for a lot no permit admits
   * you to, which is different from a lot LTP simply left blank.
   */
  permitTier?: string | null;
  /** Shown in place of the generated "Posted enforcement: …" note. */
  note: string;
  confidence: Confidence;
  /** Where this came from. A URL when there is one, a plain description when not. */
  source: string;
  /** ISO date the correction was made. Drives the "checked" line in the UI. */
  correctedOn: string;
}

export const UMICH_CORRECTIONS: Record<string, UmichCorrection> = {
  /*
   * C5 — Libraries Service Areas.
   *
   * LTP's table lists this as Blue, enforced 6am–5pm Mon–Fri, which would make
   * it free to anyone on a weekday evening or at any hour of the weekend.
   * Reported from the ground as a service-only lot monitored around the clock.
   *
   * Not verifiable against the source: ltp.umich.edu returns 403 to automated
   * requests, and the most recent Wayback capture is the same 2026-07-31 one
   * this dataset was built from, which still says Blue / 6am–5pm. So this is
   * `community`, and the app says so.
   *
   * Applied anyway because it only ever narrows what the app offers. It stops
   * MFreePark telling a student that a service lot is free on a Saturday, and
   * the lot's own published name — "Libraries Service Areas" — is consistent
   * with the report. The tier moves to Restricted because no student permit
   * admits you to a service area; leaving it Blue would tell a Blue holder to
   * park there.
   */
  'umich-c5': {
    enforcementHours: '24 hrs, 7 days',
    permitTier: 'Restricted',
    note: 'Service vehicles only, monitored around the clock. U-M’s published table still lists this as a Blue lot enforced 6am–5pm Mon–Fri; we think that is out of date. Check the sign.',
    confidence: 'community',
    source: 'Reported on the ground, 2026-08-06. Contradicts the LTP table, which could not be re-verified: ltp.umich.edu blocks automated requests and the newest archive capture is the one this dataset already uses.',
    correctedOn: '2026-08-06',
  },
};
