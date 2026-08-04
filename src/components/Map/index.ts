/**
 * The map, resolved by platform.
 *
 * Metro picks `Map.native.tsx` on iOS and `Map.web.tsx` on web via platform
 * suffixes; callers import from here and never learn which they got. That is
 * what keeps screen code identical across platforms.
 */

export { default as Map } from './Map';
export { MAP_AREAS, mapAreaById } from './geometry';
export { encodeArea, hueFor, priceLabel, type AreaEncoding, type BorderStyle } from './encoding';
export {
  DEFAULT_CAMERA,
  MAX_VISIBLE_PILLS,
  PILL_MIN_ZOOM,
  type MapArea,
  type MapCamera,
  type MapProps,
} from './types';
