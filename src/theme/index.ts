/**
 * Design tokens. Import from here in component code.
 *
 * ONE EXCEPTION: this barrel re-exports typography.ts, which imports
 * `Platform` from react-native. Anything that must stay free of React Native —
 * notably src/components/Map/encoding.ts, which is unit-tested without a
 * renderer — should import from './colors' or './metrics' directly instead.
 * Color and scalar tokens are pure data; type tokens are not.
 */

export {
  colorsFor,
  darkColors,
  lightColors,
  withAlpha,
  type ColorScheme,
  type ThemeName,
} from './colors';
export {
  MAX_MAP_TEXT_SCALE,
  MIN_TOUCH_TARGET,
  SIDEBAR_WIDTH,
  WIDE_LAYOUT_MIN_WIDTH,
  duration,
  radius,
  space,
} from './metrics';
export { fontFamily, tabularNumbers, type } from './typography';
