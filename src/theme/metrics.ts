/**
 * Scalar design tokens: spacing, radii, target size, motion.
 *
 * Split out of the barrel for the same reason colors.ts is. The barrel
 * re-exports typography.ts, which imports `Platform` from react-native, so
 * anything that must stay testable without a renderer imports from here
 * directly. These are plain numbers; type tokens are not.
 *
 * Component code should still import from '../theme' — the barrel re-exports
 * everything below, so there is one import path in the app and one escape hatch
 * for tests.
 */

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
 * 44pt is Apple's Human Interface Guidelines floor and matches WCAG 2.5.5's
 * target size. It is not a suggestion: below this, a moving thumb misses, and
 * this app gets used one-handed.
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
