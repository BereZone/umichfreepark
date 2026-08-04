/**
 * Design tokens. Import from here in component code.
 *
 * ONE EXCEPTION: this barrel re-exports typography.ts, which imports
 * `Platform` from react-native. Anything that must stay free of React Native —
 * notably src/components/Map/encoding.ts, which is unit-tested without a
 * renderer — should import from './colors' or './metrics' directly instead.
 * Colour and scalar tokens are pure data; type tokens are not.
 */

export {
  colorsFor,
  darkColors,
  lightColors,
  type ColorScheme,
  type ThemeName,
} from './colors';
export { MIN_TOUCH_TARGET, duration, radius, space } from './metrics';
export { fontFamily, tabularNumbers, type } from './typography';
