/**
 * How an area should look on the map. THE ANTI-DRIFT MECHANISM.
 *
 * This is a pure function of (area, status, eligibility, theme). Both renderers
 * call it and translate the result into their own primitives — Apple Maps
 * `lineDashPattern` on iOS, MapLibre `line-dasharray` on web.
 *
 * NEVER decide a colour, stroke width, or dash pattern inside a renderer file.
 * Two implementations that each own a design decision will silently diverge:
 * someone tweaks the dash on web, nobody touches iOS, and six months later the
 * two platforms disagree about what "free" looks like. Putting the decision
 * here means there is exactly one place to change and it is unit-testable
 * without a map on screen.
 *
 * THE COLOURBLIND CONSTRAINT, ENFORCED HERE
 *
 * Hue encodes WHICH AUTHORITY — and for U-M, which permit tier. Free vs. paid
 * rides on BORDER STYLE and TEXT, never on hue. That separation is what keeps
 * the map readable with red-green colour deficiency, and it is the property the
 * tests in this directory protect. Do not "simplify" it by making free green
 * and paid red.
 */

// Imported from theme/colors directly, NOT from the theme barrel. The barrel
// re-exports typography.ts, which imports `Platform` from react-native — and
// this file has to stay free of React Native so it can be unit-tested without
// a renderer. Colour tokens are pure data; type tokens are not.
import { colorsFor, type ThemeName } from '../../theme/colors';
import type { Eligibility, ParkingStatus, ResolvedArea } from '../../engine';

export type BorderStyle = 'solid' | 'dashed';

export interface AreaEncoding {
  /** Polygon fill. */
  fillColor: string;
  fillOpacity: number;
  /** Outline. Carries the free/paid bit via `borderStyle`, not via colour. */
  borderColor: string;
  borderStyle: BorderStyle;
  borderWidth: number;
  /**
   * Dash pattern in points, or null for a solid line. Both renderers take a
   * length array; expressing it here keeps them identical.
   */
  dashPattern: number[] | null;
  /** Centroid pill text. Short enough to read at a glance while driving. */
  label: string;
  labelColor: string;
  labelBackground: string;
  /** True when the area should read as closed to this user. */
  muted: boolean;
  /** Screen-reader description. The map's accessible equivalent starts here. */
  accessibilityLabel: string;
}

/** Free is solid and heavier; paid is dashed and lighter. */
const FREE_BORDER_WIDTH = 3;
const PAID_BORDER_WIDTH = 1.5;
const PAID_DASH: number[] = [4, 3];

/**
 * Hue by authority and permit tier.
 *
 * U-M tiers use the university's own colour names so the legend matches the
 * signs students already read. City parking takes a neutral slate, because it
 * belongs to no permit system and should not imply one.
 */
export function hueFor(area: ResolvedArea, theme: ThemeName): string {
  const c = colorsFor(theme);
  if (area.authority !== 'umich') return c.cityNeutral;
  switch (area.permitTier) {
    case 'Blue':
      return c.permitBlue;
    case 'Yellow':
      return c.permitYellow;
    case 'Orange':
      return c.permitOrange;
    case 'Gold':
      return c.permitGold;
    case 'Restricted':
      return c.permitRestricted;
    case 'Park & Ride':
      return c.free;
    default:
      return c.cityNeutral;
  }
}

/** Money as the shortest honest string. "$1.80/hr", "$5 max", "FREE". */
export function priceLabel(area: ResolvedArea, status: ParkingStatus): string {
  if (!status.paid) return 'FREE';
  switch (area.rate.kind) {
    case 'free':
      return 'FREE';
    case 'hourly': {
      const dollars = area.rate.centsPerHour / 100;
      // Trim a trailing .00 so "$5/hr" does not become "$5.00/hr".
      const text = dollars % 1 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`;
      return `${text}/hr`;
    }
    case 'flat':
      return `$${(area.rate.cents / 100).toFixed(2)}`;
    case 'permit-only':
      if (!area.permitTier) return 'PERMIT';
      // "Restricted" and "Visitor" already describe themselves; appending
      // PERMIT makes a pill too long to read at a glance and says nothing.
      if (area.permitTier === 'Restricted') return 'RESTRICTED';
      if (area.permitTier === 'Visitor') return 'VISITORS';
      return `${area.permitTier.toUpperCase()} PERMIT`;
    case 'unknown':
      // Never render a guess as a number. "?" invites a tap for the caveat.
      return 'SEE SIGN';
  }
}

export function encodeArea(
  area: ResolvedArea,
  status: ParkingStatus,
  eligibility: Eligibility,
  theme: ThemeName
): AreaEncoding {
  const c = colorsFor(theme);
  const hue = hueFor(area, theme);
  const free = !status.paid;
  const muted = !eligibility.eligible;

  const label = priceLabel(area, status);

  // Ineligible areas are desaturated and dimmed but never hidden. A lot you can
  // see out the window needs an explanation, not an absence.
  const fillOpacity = muted ? 0.08 : free ? 0.28 : 0.16;

  const borderColor = muted ? c.ineligible : free ? c.free : hue;

  const accessibilityLabel = [
    area.name,
    free ? 'free right now' : label.toLowerCase(),
    eligibility.eligible ? null : `not available to you: ${eligibility.reason}`,
    status.certain ? null : 'this one is uncertain',
  ]
    .filter(Boolean)
    .join(', ');

  return {
    fillColor: muted ? c.ineligible : hue,
    fillOpacity,
    borderColor,
    // The load-bearing line: free/paid is border style, not hue.
    borderStyle: free ? 'solid' : 'dashed',
    borderWidth: free ? FREE_BORDER_WIDTH : PAID_BORDER_WIDTH,
    dashPattern: free ? null : PAID_DASH,
    label,
    labelColor: free ? c.textInverse : c.text,
    labelBackground: free ? c.free : c.surface,
    muted,
    accessibilityLabel,
  };
}
