/**
 * Type declaration for the platform-resolved map component.
 *
 * Metro swaps in `Map.native.tsx` or `Map.web.tsx` at build time based on the
 * platform suffix, but TypeScript does not model that resolution — it just
 * sees an import of `./Map` with no such file. This declaration is what makes
 * the indirection type-safe.
 *
 * It is also a second enforcement point for the contract: both renderers must
 * satisfy exactly `MapProps`, and neither can widen its own signature without
 * changing this shared file.
 */

import type { ComponentType } from 'react';

import type { MapProps } from './types';

declare const Map: ComponentType<MapProps>;
export default Map;
