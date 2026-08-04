import { describe, expect, it } from 'vitest';

import { AREAS, DEFAULT_PROFILE, areaById, eligibilityFor, statusAt } from '../../engine';
import { colorsFor, lightColors, darkColors, type ThemeName } from '../../theme/colors';
import { encodeArea, hueFor, priceLabel } from './encoding';

const utc = (iso: string) => new Date(iso);
const WEEKDAY_NOON = utc('2026-08-04T16:00:00Z');
const SUNDAY_NOON = utc('2026-08-09T16:00:00Z');

const encode = (id: string, at: Date, theme: ThemeName = 'light') => {
  const area = areaById.get(id)!;
  const status = statusAt(area.authority, area.schedule, at);
  return encodeArea(area, status, eligibilityFor(area, DEFAULT_PROFILE, status), theme);
};

describe('free vs paid never rides on hue alone', () => {
  /**
   * This is the property that keeps the map readable with red-green colour
   * deficiency. If someone "simplifies" the encoding to green-means-free, these
   * tests are what should stop them.
   */

  it('changes border style between free and paid', () => {
    const paid = encode('maynard', WEEKDAY_NOON);
    const free = encode('maynard', SUNDAY_NOON);
    expect(paid.borderStyle).toBe('dashed');
    expect(free.borderStyle).toBe('solid');
  });

  it('changes the label text too, so the bit survives in monochrome', () => {
    expect(encode('maynard', SUNDAY_NOON).label).toBe('FREE');
    expect(encode('maynard', WEEKDAY_NOON).label).toBe('$1.80/hr');
  });

  it('makes free heavier, so it reads without colour at a glance', () => {
    expect(encode('maynard', SUNDAY_NOON).borderWidth).toBeGreaterThan(
      encode('maynard', WEEKDAY_NOON).borderWidth
    );
  });

  it('gives paid a dash pattern and free none', () => {
    expect(encode('maynard', WEEKDAY_NOON).dashPattern).toEqual([4, 3]);
    expect(encode('maynard', SUNDAY_NOON).dashPattern).toBeNull();
  });

  it('still distinguishes free from paid with hue removed entirely', () => {
    // Simulate total colour loss: compare only the non-colour channels.
    const shape = (e: ReturnType<typeof encode>) => ({
      style: e.borderStyle,
      width: e.borderWidth,
      dash: e.dashPattern,
      label: e.label,
    });
    expect(shape(encode('maynard', SUNDAY_NOON))).not.toEqual(
      shape(encode('maynard', WEEKDAY_NOON))
    );
  });
});

describe('hue carries authority and permit tier', () => {
  it('gives city parking a neutral that belongs to no permit system', () => {
    const maynard = areaById.get('maynard')!;
    expect(hueFor(maynard, 'light')).toBe(lightColors.cityNeutral);
  });

  it('uses U-M’s own permit colours, which students already read on signs', () => {
    const blue = AREAS.find((a) => a.permitTier === 'Blue')!;
    const orange = AREAS.find((a) => a.permitTier === 'Orange')!;
    expect(hueFor(blue, 'light')).toBe(lightColors.permitBlue);
    expect(hueFor(orange, 'light')).toBe(lightColors.permitOrange);
    expect(hueFor(blue, 'light')).not.toBe(hueFor(orange, 'light'));
  });

  it('does not change hue when the clock changes', () => {
    // Hue is a property of the authority, not of the current status.
    const blue = AREAS.find((a) => a.permitTier === 'Blue')!;
    expect(hueFor(blue, 'light')).toBe(hueFor(blue, 'light'));
    expect(encode('maynard', WEEKDAY_NOON).fillColor).toBe(
      encode('maynard', SUNDAY_NOON).fillColor
    );
  });

  it('resolves a hue for every area in both themes', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const area of AREAS) {
        expect(hueFor(area, theme), `${area.id} ${theme}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });
});

describe('ineligible areas are dimmed, never hidden', () => {
  const orangeLot = AREAS.find((a) => a.permitTier === 'Orange')!;

  it('mutes a lot a first-year cannot use', () => {
    const status = statusAt(orangeLot.authority, orangeLot.schedule, WEEKDAY_NOON);
    const e = encodeArea(
      orangeLot,
      status,
      eligibilityFor(orangeLot, DEFAULT_PROFILE, status),
      'light'
    );
    expect(e.muted).toBe(true);
    expect(e.fillOpacity).toBeLessThan(0.1);
  });

  it('still renders it — opacity is never zero', () => {
    for (const area of AREAS) {
      const status = statusAt(area.authority, area.schedule, WEEKDAY_NOON);
      const e = encodeArea(
        area,
        status,
        eligibilityFor(area, DEFAULT_PROFILE, status),
        'light'
      );
      expect(e.fillOpacity, area.id).toBeGreaterThan(0);
    }
  });

  it('un-mutes the same lot once it opens to the public', () => {
    const status = statusAt(orangeLot.authority, orangeLot.schedule, SUNDAY_NOON);
    const e = encodeArea(
      orangeLot,
      status,
      eligibilityFor(orangeLot, DEFAULT_PROFILE, status),
      'light'
    );
    expect(e.muted).toBe(false);
  });
});

describe('labels', () => {
  it('never renders a guessed price as a number', () => {
    // Built here rather than pulled from the dataset on purpose. This used to
    // reach for First & William, the one lot whose rate was unsourced — then
    // the city's GIS answered it and the test started asserting nothing. The
    // rule belongs to the `unknown` rate itself, not to whichever record
    // happens to be unresolved this month.
    const unsourced = { ...areaById.get('maynard')!, rate: { kind: 'unknown' } as const };
    const status = statusAt(unsourced.authority, unsourced.schedule, WEEKDAY_NOON);
    expect(priceLabel(unsourced, status)).toBe('SEE SIGN');
  });

  it('names the permit rather than implying a price', () => {
    const blue = AREAS.find((a) => a.permitTier === 'Blue')!;
    const status = statusAt(blue.authority, blue.schedule, WEEKDAY_NOON);
    expect(priceLabel(blue, status)).toBe('BLUE PERMIT');
  });

  it('trims a pointless trailing .00', () => {
    const status = statusAt('city-meter', null, WEEKDAY_NOON);
    expect(priceLabel({ rate: { kind: 'hourly', centsPerHour: 500 } } as never, status)).toBe(
      '$5/hr'
    );
    expect(priceLabel({ rate: { kind: 'hourly', centsPerHour: 180 } } as never, status)).toBe(
      '$1.80/hr'
    );
  });

  it('stays short enough to read at a glance', () => {
    for (const area of AREAS) {
      const status = statusAt(area.authority, area.schedule, WEEKDAY_NOON);
      expect(priceLabel(area, status).length, area.id).toBeLessThanOrEqual(16);
    }
  });
});

describe('accessibility labels', () => {
  it('describes state in words, not colour', () => {
    const free = encode('maynard', SUNDAY_NOON);
    expect(free.accessibilityLabel).toContain('Maynard');
    expect(free.accessibilityLabel).toContain('free right now');
  });

  it('says why an area is unavailable', () => {
    const orangeLot = AREAS.find((a) => a.permitTier === 'Orange')!;
    const status = statusAt(orangeLot.authority, orangeLot.schedule, WEEKDAY_NOON);
    const e = encodeArea(
      orangeLot,
      status,
      eligibilityFor(orangeLot, DEFAULT_PROFILE, status),
      'light'
    );
    expect(e.accessibilityLabel).toMatch(/not available to you/);
  });

  it('surfaces uncertainty rather than hiding it', () => {
    // Structures on a possible PCI holiday.
    const e = encode('maynard', utc('2026-12-25T17:00:00Z'));
    expect(e.accessibilityLabel).toMatch(/uncertain/);
  });

  it('gives every area a non-empty label in both themes', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const area of AREAS) {
        const status = statusAt(area.authority, area.schedule, WEEKDAY_NOON);
        const e = encodeArea(
          area,
          status,
          eligibilityFor(area, DEFAULT_PROFILE, status),
          theme
        );
        expect(e.accessibilityLabel.length, `${area.id} ${theme}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('contrast', () => {
  /** WCAG relative luminance. */
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const f = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };

  it('meets 4.5:1 for body text on background in both themes', () => {
    for (const scheme of [lightColors, darkColors]) {
      expect(ratio(scheme.text, scheme.background)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(scheme.textMuted, scheme.background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('meets 4.5:1 for status colours on background', () => {
    for (const scheme of [lightColors, darkColors]) {
      for (const key of ['free', 'paid', 'ineligible', 'caution'] as const) {
        expect(ratio(scheme[key], scheme.background), key).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps the free pill legible — its label sits on the free colour', () => {
    for (const theme of ['light', 'dark'] as const) {
      const c = colorsFor(theme);
      const e = encode('maynard', SUNDAY_NOON, theme);
      expect(ratio(e.labelColor, e.labelBackground), theme).toBeGreaterThanOrEqual(4.5);
      expect(c.free).toBeTruthy();
    }
  });
});
