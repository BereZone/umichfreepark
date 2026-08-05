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
 *
 * DO NOT ADD `lineHeight` HERE.
 *
 * These entries used to carry explicit line heights — `title` was
 * `{ fontSize: 28, lineHeight: 34 }` and so on. It looked tidy and it broke the
 * app at large Dynamic Type settings: line boxes grew out of proportion to the
 * glyphs, so headings gained enormous gaps, chips became tall boxes with their
 * label stuck at the top, and on the list screen the header alone filled the
 * viewport. At the accessibility sizes a user saw ZERO parking results on the
 * view that is supposed to be the accessible equivalent of the map.
 *
 * Verified on the Simulator at every content size: leaving line height to the
 * platform, which derives it from the already-scaled font size, is correct at
 * default AND at accessibility sizes. A fixed number cannot be, because it
 * cannot know the scale factor the user chose.
 *
 * If a specific block genuinely needs tighter leading, set `lineHeight` on that
 * one component as a multiple of its own scaled size — never as a constant, and
 * never here where it applies to everything.
 */
export const type = {
  /** The countdown. The one place the app raises its voice. */
  display: { fontSize: 44, fontWeight: '700' as const },
  title: { fontSize: 28, fontWeight: '700' as const },
  heading: { fontSize: 20, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  bodyStrong: { fontSize: 16, fontWeight: '600' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
  /** A caption carrying state — a selected chip, a row's active label. */
  captionStrong: { fontSize: 13, fontWeight: '600' as const },
  /** Map pills and legend keys. Small, so it carries extra weight. */
  label: { fontSize: 12, fontWeight: '700' as const },
} as const;
