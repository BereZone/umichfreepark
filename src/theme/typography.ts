/**
 * Type scale and numeral handling.
 *
 * THE TABULAR-FIGURES RULE
 *
 * Every numeral the app shows — the countdown, prices, walk times — uses
 * tabular (fixed-width) figures. In a proportional face, "1" is narrower than
 * "8", so a countdown ticking 2:11 -> 2:10 -> 2:09 visibly jitters as the
 * glyph widths change. Tabular figures make each digit occupy the same
 * advance width, so only the digit changes.
 *
 * This is the single most-noticed detail in a countdown UI and it is one CSS
 * property. Do not drop it.
 */

import { Platform } from 'react-native';

/**
 * Font stacks.
 *
 * System faces on purpose: they carry the platform's full weight range and
 * numeral features, they are already on the device (so nothing blocks first
 * paint), and they respect the user's Dynamic Type settings. A downloaded
 * display face would buy very little here and cost a render-blocking fetch on
 * web.
 */
export const fontFamily = {
  /** UI and body copy. */
  sans: Platform.select({
    ios: 'System',
    android: 'sans-serif',
    default:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  })!,
  /** Numerals and rule text, echoing a parking meter's LCD. */
  mono: Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  })!,
} as const;

/**
 * The style props that turn on tabular figures.
 *
 * `fontVariant: ['tabular-nums']` is honoured by React Native on iOS and by
 * react-native-web (which maps it to `font-variant-numeric`). Spread this onto
 * any Text that renders a number.
 */
export const tabularNumbers = {
  fontVariant: ['tabular-nums' as const],
};

/**
 * Type scale.
 *
 * Sizes are unitless numbers, which React Native treats as scale-independent
 * pixels. They are NOT clamped, so iOS Dynamic Type can scale them — hardcoding
 * a size that ignores the user's accessibility text setting is exactly the
 * failure the accessibility pass exists to catch.
 */
export const type = {
  /** The countdown. The one place the app raises its voice. */
  display: { fontSize: 44, lineHeight: 48, fontWeight: '700' as const },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' as const },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
  /** Map pills and legend keys. Small, so it carries extra weight. */
  label: { fontSize: 12, lineHeight: 15, fontWeight: '700' as const },
} as const;
