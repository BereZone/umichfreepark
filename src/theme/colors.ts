/**
 * Color tokens.
 *
 * No raw hex outside this file. A component that hardcodes `#1B7F4B` is a
 * component that cannot be themed and will drift from its counterpart on the
 * other platform.
 *
 * VISUAL DIRECTION
 *
 * Borrowed from the subject's own vernacular: regulatory parking signage and
 * parking-meter displays. Signage greens and reds, sign-blank white, the
 * near-black of a meter's LCD. Deliberately NOT the default generative-design
 * palette — no cream background, no terracotta accent, no high-contrast serif.
 *
 * THE COLORBLIND CONSTRAINT
 *
 * Free vs. paid is never encoded by hue alone. Hue carries WHICH AUTHORITY and,
 * for U-M, which permit; free/paid rides on border style and text. Roughly 8%
 * of men have some red-green color deficiency, which is exactly the axis a
 * naive green/red parking app would put its most important bit on.
 * See encoding.ts, which is where that rule is actually enforced.
 */

export interface ColorScheme {
  /** Page and sheet backgrounds. */
  background: string;
  surface: string;
  surfaceRaised: string;

  /** Text, in descending emphasis. All meet 4.5:1 on `background`. */
  text: string;
  textMuted: string;
  textInverse: string;

  border: string;
  borderStrong: string;

  /** Status. Paired with a border style and a word, never used alone. */
  free: string;
  paid: string;
  ineligible: string;
  caution: string;

  /**
   * U-M permit tiers, matching the university's own color names. Students
   * learn this vocabulary in their first week, so borrowing it means the
   * legend is half-learned before the app is opened.
   */
  permitBlue: string;
  permitYellow: string;
  permitOrange: string;
  permitGold: string;
  permitRestricted: string;

  /** City-run parking takes a neutral slate — it belongs to no permit system. */
  cityNeutral: string;

  /** Focus ring, for keyboard navigation on web. */
  focus: string;
}

export const lightColors: ColorScheme = {
  background: '#F7F7F5',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',

  text: '#16181A',
  textMuted: '#5A6068',
  textInverse: '#FFFFFF',

  border: '#D6D9DC',
  borderStrong: '#16181A',

  // Regulatory green: "permitted". Darkened from sign green to clear 4.5:1.
  free: '#0F7A3D',
  // Meter-display charcoal rather than red. Paid is not a prohibition, and
  // reserving red for genuine prohibition keeps the map honest.
  paid: '#3A4046',
  // Prohibition red, used only where parking is actually not allowed to you.
  ineligible: '#B3261E',
  caution: '#8A5A00',

  permitBlue: '#00274C', // U-M official blue
  permitYellow: '#8A6D00', // darkened from maize; maize on white fails contrast
  permitOrange: '#B24A00',
  permitGold: '#7A5C00',
  permitRestricted: '#6B2E2A',

  cityNeutral: '#4A5560',

  focus: '#0B62D0',
};

export const darkColors: ColorScheme = {
  background: '#0E1012',
  surface: '#191C1F',
  surfaceRaised: '#22262A',

  text: '#F2F4F6',
  textMuted: '#A8B0B8',
  textInverse: '#0E1012',

  border: '#333A40',
  borderStrong: '#F2F4F6',

  free: '#3FD07E',
  paid: '#B8C0C8',
  ineligible: '#FF6B61',
  caution: '#FFC65C',

  permitBlue: '#7FA8D9',
  permitYellow: '#FFCB05', // maize works on dark, where it has the contrast
  permitOrange: '#FF9552',
  permitGold: '#E8C34A',
  permitRestricted: '#E08A84',

  cityNeutral: '#9AA7B4',

  focus: '#7FB4FF',
};

export type ThemeName = 'light' | 'dark';

export const colorsFor = (theme: ThemeName): ColorScheme =>
  theme === 'dark' ? darkColors : lightColors;

/**
 * A token at partial opacity, as an 8-digit hex string.
 *
 * Two callers need this and they must agree: Apple Maps wants alpha baked into
 * the fill color rather than supplied as a separate prop, and callouts tint
 * their surface with the status color they are about. Both are translations of
 * an existing token, not new colors — which is why this lives beside the
 * tokens instead of in either caller.
 *
 * Kept free of React Native along with the rest of this file, so encoding.ts
 * can use it without dragging a renderer into its tests.
 */
export const withAlpha = (hex: string, alpha: number): string => {
  const clamped = Math.round(Math.min(Math.max(alpha, 0), 1) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${clamped}`;
};
