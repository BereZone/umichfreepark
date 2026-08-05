/**
 * The single layout question this app asks: is there room for the map and the
 * ranked list at the same time?
 *
 * A hook rather than a media query so both platforms answer it the same way.
 * On web this is a browser window; on iPad it is a split-view pane; the answer
 * has to come from the same number either way, and `useWindowDimensions`
 * re-renders on rotation and on resize without any listener bookkeeping.
 */

import { useWindowDimensions } from 'react-native';

import { WIDE_LAYOUT_MIN_WIDTH } from '../theme';

/**
 * True when the map can afford a sidebar beside it rather than a sheet over it.
 *
 * Deliberately not a device check. A 1440pt browser and a landscape iPad want
 * the same layout, and a phone in landscape does not — width is the thing that
 * actually decides, so width is what we ask.
 */
export function useIsWideLayout(): boolean {
  const { width } = useWindowDimensions();
  return width >= WIDE_LAYOUT_MIN_WIDTH;
}
