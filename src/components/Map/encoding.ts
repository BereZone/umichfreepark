/**
 * How an area should look on the map. THE ANTI-DRIFT MECHANISM.
 *
 * This is a pure function of (area, status, eligibility, theme). Both renderers
 * call it and translate the result into their own primitives — Apple Maps
 * `lineDashPattern` on iOS, MapLibre `line-dasharray` on web.
 *
 * NEVER decide a color, stroke width, or dash pattern inside a renderer file.
 * Two implementations that each own a design decision will silently diverge:
 * someone tweaks the dash on web, nobody touches iOS, and six months later the
 * two platforms disagree about what "free" looks like. Putting the decision
 * here means there is exactly one place to change and it is unit-testable
 * without a map on screen.
 *
 * THE COLORBLIND CONSTRAINT, ENFORCED HERE
 *
 * Hue encodes WHICH AUTHORITY — and for U-M, which permit tier. Free vs. paid
 * rides on BORDER STYLE and TEXT, never on hue. That separation is what keeps
 * the map readable with red-green color deficiency, and it is the property the
 * tests in this directory protect. Do not "simplify" it by making free green
 * and paid red.
 */

// Imported from theme/colors directly, NOT from the theme barrel. The barrel
// re-exports typography.ts, which imports `Platform` from react-native — and
// this file has to stay free of React Native so it can be unit-tested without
// a renderer. Color tokens are pure data; type tokens are not.
import { colorsFor, type ThemeName } from '../../theme/colors';
import type { Eligibility, ParkingStatus, ResolvedArea } from '../../engine';

export type BorderStyle = 'solid' | 'dashed';

export interface AreaEncoding {
  /** Polygon fill. */
  fillColor: string;
  fillOpacity: number;
  /** Outline. Carries the free/paid bit via `borderStyle`, not via color. */
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
  /**
   * Whether this area gets a centroid pill at all.
   *
   * False for districts. A pill is drawn at one point and reads as a claim
   * about that point — "FREE, here" — which is true of a lot and false of the
   * downtown meter boundary, where the centroid is very likely a building. The
   * outline still draws and the area is still tappable, so nothing is hidden;
   * what goes away is a specific-sounding answer at a place you cannot park.
   *
   * The decision lives here rather than in the renderers for the usual reason:
   * two implementations each holding "districts are different" is two chances
   * to disagree about it.
   */
  showsPill: boolean;
  /** True when the area should read as closed to this user. */
  muted: boolean;
  /** Screen-reader description. The map's accessible equivalent starts here. */
  accessibilityLabel: string;
}

/**
 * Free is solid and heavier; paid is dashed and lighter.
 *
 * Exported because the legend has to draw the same two lines. A key that
 * demonstrates a 2pt dash while the map draws a 3pt one is a key that teaches
 * the wrong thing, and it is the map's most load-bearing distinction.
 */
export const FREE_BORDER_WIDTH = 3;
export const PAID_BORDER_WIDTH = 1.5;
export const PAID_DASH: number[] = [4, 3];

/**
 * How much lighter a district is drawn than a lot.
 *
 * A third of the fill and half the line. Enough that you can still see where
 * the meter district begins and ends, little enough that the sixty lots inside
 * it are read directly rather than through it.
 */
const DISTRICT_FILL_SCALE = 0.35;
const DISTRICT_LINE_SCALE = 0.5;

/**
 * Longest string that stays legible in a centroid pill at map scale. Measured
 * against the widest real label the data produces ("YELLOW PERMIT", 13); the
 * ceiling is set slightly above so a modestly longer tier still fits, and
 * anything past it falls back rather than overflowing.
 */
const MAX_PILL_LENGTH = 16;

/**
 * Hue by authority and permit tier.
 *
 * U-M tiers use the university's own color names so the legend matches the
 * signs students already read. City parking takes a neutral slate, because it
 * belongs to no permit system and should not imply one.
 */
export function hueFor(area: ResolvedArea, theme: ThemeName): string {
  if (area.authority !== 'umich') return colorsFor(theme).cityNeutral;
  return tierHue(area.permitTier, theme);
}

/**
 * The permit tiers the legend lists, in the order it lists them.
 *
 * Roughly the order a student meets them: the two they might actually hold,
 * then the ones they will see on a sign and cannot use, then the free one.
 */
export const LEGEND_TIERS = [
  'Blue',
  'Yellow',
  'Orange',
  'Gold',
  'Restricted',
  'Park & Ride',
] as const;

/**
 * A permit tier's color, split out of `hueFor` so the legend and the map read
 * it from the same place.
 *
 * A legend with its own copy of this switch is the same failure mode as a
 * renderer with its own copy: it stays right until someone changes one of them,
 * and then the map's key is quietly lying about the map.
 */
export function tierHue(tier: string | null | undefined, theme: ThemeName): string {
  const c = colorsFor(theme);
  switch (tier) {
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
    case 'permit-only': {
      if (!area.permitTier) return 'PERMIT';
      const tier = area.permitTier.toUpperCase();
      // Some tier names already describe themselves; appending PERMIT makes the
      // pill longer without saying anything more.
      if (tier === 'RESTRICTED') return 'RESTRICTED';
      if (tier === 'VISITOR') return 'VISITORS';
      const full = `${tier} PERMIT`;
      // A pill has to be readable at a glance from a moving car. Rather than
      // enumerating every tier that happens to be long, fall back to the tier
      // alone whenever the full form would not fit — so a tier added upstream
      // later cannot quietly produce an unreadable pill.
      return full.length <= MAX_PILL_LENGTH ? full : tier;
    }
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

  /*
   * A district is drawn as context, not as a place you drive into.
   *
   * The downtown meter zone is the city's published boundary for on-street
   * parking — roughly two kilometres across, containing hundreds of the very
   * lots it overlaps. Given a lot's own treatment it laid a solid slab over all
   * of downtown and central campus and traced the whole thing in a 3pt border,
   * so every structure inside it was read through a wash and the map's most
   * useful area became its least legible.
   *
   * Scale is the reason, so scale is what changes: same hue, same free/paid
   * border style, a third of the fill and a thinner line. The colorblind
   * constraint is untouched — free is still solid, paid is still dashed.
   */
  const isDistrict = area.kind === 'meter-zone';

  // Ineligible areas are desaturated and dimmed but never hidden. A lot you can
  // see out the window needs an explanation, not an absence.
  const lotOpacity = muted ? 0.08 : free ? 0.28 : 0.16;
  const fillOpacity = isDistrict ? lotOpacity * DISTRICT_FILL_SCALE : lotOpacity;

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
    borderWidth:
      (free ? FREE_BORDER_WIDTH : PAID_BORDER_WIDTH) * (isDistrict ? DISTRICT_LINE_SCALE : 1),
    dashPattern: free ? null : PAID_DASH,
    label,
    labelColor: free ? c.textInverse : c.text,
    labelBackground: free ? c.free : c.surface,
    showsPill: !isDistrict,
    muted,
    accessibilityLabel,
  };
}
