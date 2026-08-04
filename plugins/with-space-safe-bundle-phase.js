/**
 * Make the "Bundle React Native code and images" build phase survive a space in
 * the project path.
 *
 * THE BUG
 *
 * Expo's prebuild template ends that build phase with a backticked command:
 *
 *   `"$NODE_BINARY" --print "…dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'"`
 *
 * Backticks run the *output* as a command. The output is an absolute path, so
 * when the checkout lives somewhere with a space in it the shell word-splits
 * that path and tries to execute the first half:
 *
 *   Script-00DD1BFF….sh: line 40: /Users/you/Documents/Projects/UMich: No such file or directory
 *
 * Every line of Swift and C++ compiles first, so this lands at the very end of
 * a long build and looks like a bundler problem rather than a quoting one.
 *
 * THE FIX
 *
 * Capture the path into a variable and invoke it quoted. Same command, one word.
 *
 * WHY A PLUGIN AND NOT A PATCH
 *
 * The script is written into the generated `ios/` project rather than read from
 * `node_modules`, so `patch-package` cannot reach it — prebuild would overwrite
 * the fix every time. This runs as part of prebuild instead, which means it
 * cannot drift out of sync with the file it edits.
 *
 * THE REAL FIX IS TO RENAME THE DIRECTORY
 *
 * This is the third space-in-path bug this project has hit; `patches/README.md`
 * documents the other two in expo-constants. React Native and Expo's build
 * scripts are simply not written to be space-safe, and each new dependency is
 * another chance to find one. A checkout at a path with no spaces needs none of
 * this. Keeping the plugin costs little and helps anyone who clones into
 * "My Projects", but it is a workaround, not a solution.
 */

const { withXcodeProject } = require('expo/config-plugins');

/** The backticked invocation, as it appears in the generated build phase. */
const BACKTICKED = /`((?:\\")?\$NODE_BINARY(?:\\")?[^`]*)`/;

module.exports = function withSpaceSafeBundlePhase(config) {
  return withXcodeProject(config, (mod) => {
    const phases = mod.modResults.hash.project.objects.PBXShellScriptBuildPhase ?? {};
    let fixed = 0;

    for (const phase of Object.values(phases)) {
      if (!phase || typeof phase !== 'object' || typeof phase.shellScript !== 'string') continue;
      if (!BACKTICKED.test(phase.shellScript)) continue;

      phase.shellScript = phase.shellScript.replace(
        BACKTICKED,
        (_, command) => `RN_XCODE_SCRIPT=$(${command})\\n/bin/sh \\"$RN_XCODE_SCRIPT\\"`
      );
      fixed += 1;
    }

    // Silence rather than a wrong build is the failure mode worth avoiding: if
    // Expo restructures the template, this should say so rather than quietly
    // doing nothing and letting the space bug come back.
    if (fixed === 0) {
      console.warn(
        '[with-space-safe-bundle-phase] Found no backticked build phase to fix. ' +
          'Either Expo fixed the quoting upstream — in which case delete this plugin — ' +
          'or the template changed and this needs updating.'
      );
    }

    return mod;
  });
};
