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
 * How far text pinned to the map is allowed to grow with Dynamic Type.
 *
 * THIS IS A NARROW EXCEPTION AND IT IS NOT A LICENCE TO CLAMP ANYTHING ELSE.
 *
 * typography.ts explains at length why sizes are never clamped: the list screen
 * once pinned line heights and showed a user at the largest accessibility
 * setting zero parking results. Nothing here reverses that. Body copy, list
 * rows, the detail panel and every control still scale without limit.
 *
 * Map chrome is the one place where that fails on its own terms. A price pill
 * is drawn at a geographic point, and pills cannot reflow — at the largest
 * setting they grew to roughly 30pt and a dozen of them covered central campus
 * completely, so the labels ate the thing they were labelling. The free-count
 * card did the same to the map behind it and pushed the key off screen.
 *
 * 1.6 is still a large increase — a 12pt pill becomes 19pt — and it is bounded
 * only for text sitting on top of the map. The list view carries every one of
 * these areas at unbounded size, which is exactly why it is the accessible
 * equivalent rather than a convenience.
 */
export const MAX_MAP_TEXT_SCALE = 1.6;

/**
 * The one layout breakpoint, in points.
 *
 * Above it the map screen puts the ranked list in a sidebar beside the map
 * instead of in a sheet over it. One number rather than a scale, because the
 * app has exactly one layout decision to make: is there room for the map and
 * the list at the same time, or does one have to cover the other.
 *
 * 900 is where that stops being true. The sidebar is 380 and the map needs
 * roughly 520 before a lot and the street it is on stop fitting in the same
 * glance — below that the sidebar is winning space from the thing it annotates.
 */
export const WIDE_LAYOUT_MIN_WIDTH = 900;

/** The sidebar's width in the wide layout. Wide enough for a price and a walk time on one line. */
export const SIDEBAR_WIDTH = 380;

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
