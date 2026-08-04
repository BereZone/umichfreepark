/**
 * Design tokens. Import from here in component code.
 *
 * ONE EXCEPTION: this barrel re-exports typography.ts, which imports
 * `Platform` from react-native. Anything that must stay free of React Native —
 * notably src/components/Map/encoding.ts, which is unit-tested without a
 * renderer — should import from './colors' directly instead. Colour tokens are
 * pure data; type tokens are not.
 */

export {
  colorsFor,
  darkColors,
  lightColors,
  type ColorScheme,
  type ThemeName,
} from './colors';
export { fontFamily, tabularNumbers, type } from './typography';

/**
 * Spacing, on a 4pt grid.
 *
 * Named by role rather than by size, so "tighten this up" is a token change
 * rather than a hunt for every `12` in the codebase.
 */
export const space = {
  hair: 2,
  tight: 4,
  snug: 8,
  base: 12,
  comfortable: 16,
  roomy: 24,
  loose: 32,
  section: 48,
} as const;

export const radius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 14,
  /** Map pills and chips. */
  pill: 999,
} as const;

/**
 * The minimum size of anything tappable.
 *
 * 44pt is Apple's Human Interface Guidelines floor and roughly matches WCAG
 * 2.2's target-size guidance. It is not a suggestion: below this, a moving
 * thumb misses, and this app gets used one-handed in a car.
 */
export const MIN_TOUCH_TARGET = 44;

/**
 * Motion durations, in milliseconds.
 *
 * All of these must collapse to 0 when the user has asked for reduced motion.
 * The 6pm sweep is the one orchestrated moment in the app, and it still has to
 * degrade to an instant state change rather than being merely faster.
 */
export const duration = {
  instant: 0,
  quick: 120,
  standard: 220,
  /** The free/paid sweep across the map. */
  sweep: 600,
} as const;
