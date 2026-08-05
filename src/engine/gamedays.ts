/**
 * Home football Saturdays, which invalidate the normal answer near the stadium.
 *
 * A game day is not a rate change, it is an override: lots that are normally
 * available are closed, towed, or reserved for event parking, and a ranking
 * that quietly re-sorted them would be confidently wrong. So the engine flags
 * the day rather than trying to price it.
 */

import { calendarDate, type CalendarDate } from './calendar';

/**
 * 2026 U-M home games.
 *
 * Seven of these were confirmed against the announced schedule. An eighth date
 * (November 21) appeared in the original project brief but could NOT be
 * confirmed against a primary source, so it is deliberately absent — shipping
 * it would mean warning students about a game that may not exist, and the
 * absence is easier to notice than a wrong entry.
 *
 * Ohio State on November 28 is an away game.
 *
 * Re-verify every August; this list expires annually and is the one piece of
 * data here that cannot be computed.
 */
export const HOME_GAMES_2026: readonly CalendarDate[] = [
  '2026-09-05',
  '2026-09-12',
  '2026-09-19',
  '2026-09-26',
  '2026-10-17',
  '2026-10-24',
  '2026-11-07',
];

const HOME_GAMES = new Set(HOME_GAMES_2026);

/** The last season we have data for. Past this, we must say so rather than guess. */
const COVERED_YEAR = 2026;

export type GameDayLookup =
  | { known: true; isGameDay: boolean }
  /** Outside the season we have a schedule for. Not the same as "no game". */
  | { known: false; reason: string };

export function gameDayAt(at: Date): GameDayLookup {
  const date = calendarDate(at);
  const year = Number(date.slice(0, 4));
  if (year !== COVERED_YEAR) {
    return {
      known: false,
      reason: `UMichFreePark only has the ${COVERED_YEAR} home schedule. Check before parking near the stadium.`,
    };
  }
  return { known: true, isGameDay: HOME_GAMES.has(date) };
}

/**
 * The warning to show for an area on a home game day, or null.
 *
 * Verified 2026-08-03 from LTP's Student Orange and Parking Rules pages:
 * permits "are not valid and will not be honored in any lots located south of
 * Hill Street on home football game Saturdays", and "all vehicles must exit the
 * lots on Ross Athletic Campus by 10 pm Friday… Vehicles left in the lots will
 * be towed."
 *
 * Deliberately NOT modelled: what the City does to on-street meters near the
 * stadium on a game day. The project brief asserted a restriction, but no
 * published City of Ann Arbor game-day policy could be found. An unsourced
 * warning is still a wrong answer, so this stays silent about city spaces.
 */
export function gameDayWarning(
  area: { authority: string; permitTier?: string; id: string },
  at: Date
): string | null {
  const lookup = gameDayAt(at);
  if (!lookup.known || !lookup.isGameDay) return null;
  if (area.authority !== 'umich') return null;

  // Ross Athletic lots — the ones that get towed.
  if (area.id.startsWith('umich-sc')) {
    return 'Home game today. Ross Athletic lots are closed for event parking and vehicles are towed — they had to be out by 10pm Friday.';
  }
  return 'Home game today. Permits are not honored in lots used for event parking, including anything south of Hill Street.';
}
