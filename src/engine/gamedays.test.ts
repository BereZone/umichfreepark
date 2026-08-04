import { describe, expect, it } from 'vitest';

import { dayOfWeek } from './calendar';
import { HOME_GAMES_2026, gameDayAt, gameDayWarning } from './gamedays';

const utc = (iso: string) => new Date(iso);
const noonOn = (date: string) => utc(`${date}T16:00:00Z`);

describe('the 2026 home schedule', () => {
  it('is every-one-a-Saturday', () => {
    for (const date of HOME_GAMES_2026) {
      expect(dayOfWeek(noonOn(date)), date).toBe(6);
    }
  });

  it('omits the date that could not be confirmed', () => {
    // November 21 appeared in the project brief but no primary source
    // confirmed it. A missing warning is easier to notice than a wrong one.
    expect(HOME_GAMES_2026).not.toContain('2026-11-21');
  });

  it('omits the Ohio State away game', () => {
    expect(HOME_GAMES_2026).not.toContain('2026-11-28');
  });

  it('flags a game day and only a game day', () => {
    expect(gameDayAt(noonOn('2026-09-12'))).toEqual({ known: true, isGameDay: true });
    expect(gameDayAt(noonOn('2026-09-13'))).toEqual({ known: true, isGameDay: false });
    expect(gameDayAt(noonOn('2026-08-08'))).toEqual({ known: true, isGameDay: false });
  });

  it('says it does not know rather than guessing outside the season it has', () => {
    // A hardcoded schedule expires. Returning "no game" for 2027 would be a
    // confident wrong answer on eight Saturdays.
    const result = gameDayAt(noonOn('2027-09-11'));
    expect(result.known).toBe(false);
    if (!result.known) expect(result.reason).toMatch(/2026/);
  });
});

describe('game day warnings', () => {
  const rossLot = { authority: 'umich', permitTier: 'Orange', id: 'umich-sc7' };
  const northLot = { authority: 'umich', permitTier: 'Orange', id: 'umich-nc51' };
  const structure = { authority: 'city-structure', id: 'maynard' };

  it('warns about towing on Ross Athletic lots', () => {
    const warning = gameDayWarning(rossLot, noonOn('2026-09-12'));
    expect(warning).toMatch(/towed/i);
    expect(warning).toMatch(/10pm Friday/i);
  });

  it('warns more generally about other U-M lots', () => {
    expect(gameDayWarning(northLot, noonOn('2026-09-12'))).toMatch(/Hill Street/i);
  });

  it('says nothing on a normal Saturday', () => {
    expect(gameDayWarning(rossLot, noonOn('2026-09-19'))).not.toBeNull();
    expect(gameDayWarning(rossLot, noonOn('2026-10-03'))).toBeNull();
  });

  it('stays silent about city spaces, which we could not source', () => {
    // The brief claimed on-street restrictions near the stadium, but no
    // published City of Ann Arbor game-day policy was found. An unsourced
    // warning is still a wrong answer.
    expect(gameDayWarning(structure, noonOn('2026-09-12'))).toBeNull();
  });

  it('says nothing outside the season it has data for', () => {
    expect(gameDayWarning(rossLot, noonOn('2027-09-11'))).toBeNull();
  });
});
