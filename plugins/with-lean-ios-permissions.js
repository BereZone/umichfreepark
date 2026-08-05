/**
 * Strip iOS permission strings the app does not use.
 *
 * WHY THIS EXISTS
 *
 * `expo-location` adds three usage descriptions to Info.plist whether you want
 * them or not, and two of them arrive with Expo's default placeholder text:
 *
 *   NSLocationAlwaysUsageDescription            "Allow $(PRODUCT_NAME) to …"
 *   NSLocationAlwaysAndWhenInUseUsageDescription "Allow $(PRODUCT_NAME) to …"
 *   NSMotionUsageDescription                     "Allow $(PRODUCT_NAME) to …"
 *
 * MFreePark requests When In Use and nothing else. It never asks for background
 * location and never reads motion. Shipping those keys is wrong twice over: a
 * vague purpose string is the thing App Review rejects by name, and declaring a
 * capability you do not use invites the reviewer to ask why.
 *
 * The two location keys can be suppressed through the plugin's own options, and
 * are — see app.json. `NSMotionUsageDescription` has no such option, so it is
 * deleted here, after every other plugin has run.
 *
 * This also fails the build if an Always key ever comes back. That is the
 * point: a future expo-location release could reintroduce them, and the failure
 * mode is silent — nothing breaks, the app just starts declaring permissions it
 * does not want. Better to stop the build than to find out in review.
 *
 * ORDERING: THIS PLUGIN MUST BE LISTED FIRST IN app.json
 *
 * Backwards from how it reads, and load-bearing. Expo's mod chain wraps, so the
 * most recently registered `withInfoPlist` action runs FIRST. Listing this last
 * — the obvious place for a cleanup pass — makes it run before expo-location
 * has added anything, so it deletes nothing and silently passes. Listed first,
 * it runs last and actually sees the finished plist.
 *
 * Verified by inspecting the generated ios/MFreePark/Info.plist, which is the only
 * way to know: both orderings "succeed".
 */

const { withInfoPlist } = require('expo/config-plugins');

/** Permissions MFreePark genuinely does not use. */
const UNUSED = ['NSMotionUsageDescription'];

/** Permissions that must never appear, whatever a dependency thinks. */
const FORBIDDEN = [
  'NSLocationAlwaysUsageDescription',
  'NSLocationAlwaysAndWhenInUseUsageDescription',
];

module.exports = function withLeanIosPermissions(config) {
  return withInfoPlist(config, (mod) => {
    for (const key of UNUSED) delete mod.modResults[key];

    const reintroduced = FORBIDDEN.filter((key) => mod.modResults[key] !== undefined);
    if (reintroduced.length > 0) {
      throw new Error(
        `Info.plist declares background-location permissions MFreePark does not request: ` +
          `${reintroduced.join(', ')}. A dependency added them back. Suppress them in ` +
          `the expo-location plugin options in app.json rather than deleting them here — ` +
          `if the app genuinely needs Always now, that is a decision to make deliberately.`
      );
    }

    // The one permission we do request has to say what it is actually for.
    const whenInUse = mod.modResults.NSLocationWhenInUseUsageDescription;
    if (!whenInUse || whenInUse.includes('$(PRODUCT_NAME)')) {
      throw new Error(
        'NSLocationWhenInUseUsageDescription is missing or still the Expo placeholder. ' +
          'App Review rejects vague purpose strings; say what the location is used for.'
      );
    }

    return mod;
  });
};
