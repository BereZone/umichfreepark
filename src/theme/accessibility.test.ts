/**
 * The accessibility audit, as tests rather than as a checklist someone ran once.
 *
 * A contrast audit done by eye is a snapshot of one afternoon. The next person
 * to nudge a hue has no idea which pairs were checked or what the margins were,
 * so the audit quietly expires. These assert the pairs the screens actually
 * render, so a token change that breaks one fails in CI instead of shipping.
 *
 * WHAT CANNOT BE TESTED HERE
 *
 * VoiceOver rotor order, focus behaviour after the detail panel opens, and
 * whether a control is reachable one-handed all need a real device and a real
 * person. Those stay manual; see docs/accessibility.md. What lives here is
 * everything that is a pure function of the tokens.
 */

import { describe, expect, it } from 'vitest';

// Not from the barrel: it re-exports typography.ts, which imports react-native.
import { darkColors, lightColors, type ColorScheme } from './colors';
import { MIN_TOUCH_TARGET, duration } from './metrics';

/** WCAG 2.1 relative luminance. */
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const ratio = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

const themes: [string, ColorScheme][] = [
  ['light', lightColors],
  ['dark', darkColors],
];

/**
 * Every (foreground, background) pair a screen actually puts on top of another,
 * traced from the components rather than guessed.
 *
 * The three surfaces are separate entries on purpose. `textMuted` on
 * `background` passing tells you nothing about `textMuted` on `surfaceRaised`,
 * which is where the detail panel puts it, and in dark mode those differ by a
 * full point of ratio.
 */
const TEXT_PAIRS: [keyof ColorScheme, keyof ColorScheme, string][] = [
  ['text', 'background', 'body text'],
  ['textMuted', 'background', 'secondary text'],
  ['text', 'surface', 'text on a card'],
  ['textMuted', 'surface', 'secondary text on a card'],
  ['text', 'surfaceRaised', 'text in the detail panel'],
  ['textMuted', 'surfaceRaised', 'notes and provenance in the detail panel'],
  ['textInverse', 'text', 'label on a selected chip'],
  ['textInverse', 'free', 'the FREE pill'],
  ['free', 'background', 'free price in a list row'],
  ['free', 'surface', 'free price on a card'],
  ['free', 'surfaceRaised', 'the word Free in the detail panel'],
  ['paid', 'background', 'paid price'],
  ['paid', 'surfaceRaised', 'the word Paid in the detail panel'],
  ['ineligible', 'background', 'why you cannot park here'],
  ['ineligible', 'surface', 'ineligibility on a card'],
  ['ineligible', 'surfaceRaised', 'ineligibility in the detail panel'],
  ['caution', 'background', 'uncertainty warning'],
  ['caution', 'surface', 'uncertainty on a card'],
  ['caution', 'surfaceRaised', 'uncertainty in the detail panel'],
  // `focus` was previously only asserted at 3:1, as a non-text ring. The "use
  // my location" action renders it as actual words, which is a 4.5:1 pair — and
  // it is the label on the app's only permission prompt, so it has to be
  // readable before someone decides whether to grant it.
  ['focus', 'surface', 'the use-my-location action'],
  ['focus', 'surfaceRaised', 'the use-my-location action in the sheet'],
];

describe('color contrast', () => {
  it('clears 4.5:1 for every text pair the screens render', () => {
    for (const [themeName, c] of themes) {
      for (const [fg, bg, what] of TEXT_PAIRS) {
        expect(ratio(c[fg], c[bg]), `${themeName}: ${what} (${fg} on ${bg})`).toBeGreaterThanOrEqual(
          4.5
        );
      }
    }
  });

  it('clears 3:1 for the hues that carry meaning without text', () => {
    // WCAG 1.4.11. These are polygon fills and outlines on the map, so they are
    // non-text — but they are the only thing distinguishing one authority's
    // parking from another's, which is exactly what 1.4.11 covers.
    const meaningful: (keyof ColorScheme)[] = [
      'permitBlue',
      'permitYellow',
      'permitOrange',
      'permitGold',
      'permitRestricted',
      'cityNeutral',
      'free',
      'focus',
      'borderStrong',
    ];
    for (const [themeName, c] of themes) {
      for (const key of meaningful) {
        expect(ratio(c[key], c.background), `${themeName}: ${key}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('leaves the decorative hairline alone, deliberately', () => {
    // `border` is a separator between list rows and the outline of a card whose
    // contents are already visible. It does not identify a control or a state,
    // so 1.4.11 does not apply and darkening it to 3:1 would make every screen
    // heavier for no one's benefit. `borderStrong` exists for the cases that do
    // need to carry meaning, and is asserted above.
    //
    // This is written as a test so the next person to run a contrast checker
    // finds the reasoning instead of "fixing" it.
    for (const [themeName, c] of themes) {
      expect(ratio(c.border, c.background), themeName).toBeLessThan(3);
      expect(ratio(c.borderStrong, c.background), themeName).toBeGreaterThanOrEqual(3);
    }
  });

  /*
   * NOT ASSERTED HERE: that `free` and `paid` are far apart in luminance.
   *
   * It is tempting — greyscale separation sounds like the colorblind test. It
   * is the wrong test for this design. In dark mode the two sit 0.04 apart and
   * that is fine, because free vs paid never rides on color at all: the map
   * carries it in border style, and every surface that shows it also writes the
   * word "Free" or "Paid". Requiring luminance separation would constrain the
   * palette to protect a channel the app does not use.
   *
   * The real guarantee lives in encoding.test.ts, which asserts that a free
   * area and a paid area differ in `borderStyle` and in `label` — the two
   * channels a user actually reads. Do not re-add a threshold here; tune the
   * one that measures the property being relied on.
   */
});

describe('touch targets', () => {
  it('is at least 44pt, the documented minimum on both platforms', () => {
    // Apple's HIG says 44x44pt; WCAG 2.5.5 says 44x44 CSS px. They agree, which
    // is why one constant serves both renderers.
    expect(MIN_TOUCH_TARGET).toBeGreaterThanOrEqual(44);
  });
});

describe('motion', () => {
  it('offers an instant duration for every animation to collapse to', () => {
    // Reduce-motion has to mean "no movement", not "less movement". A component
    // that halves its duration under the setting still moves, and vestibular
    // symptoms do not care that it was quicker.
    expect(duration.instant).toBe(0);
    for (const [name, ms] of Object.entries(duration)) {
      if (name === 'instant') continue;
      expect(ms, name).toBeGreaterThan(0);
    }
  });
});
