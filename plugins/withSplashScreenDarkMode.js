const { withDangerousMod } = require('@expo/config-plugins');
const { Parser } = require('xml2js');
const fs = require('fs');
const path = require('path');

/**
 * Removes appearance="light" from <device ...> elements in an iOS SplashScreen storyboard.
 * This allows the storyboard to respect the system appearance (light/dark) instead of
 * being locked to light mode by expo-splash-screen SDK 56's generator template.
 *
 * @param {string} xmlString - Raw XML string of the storyboard
 * @returns {string} - XML with appearance="light" removed from <device> elements
 */
function removeAppearanceLight(xmlString) {
  if (typeof xmlString !== 'string') {
    throw new Error('removeAppearanceLight: xmlString must be a string');
  }
  // Match appearance="light" or appearance='light' as a standalone attribute on any element
  // We target the <device> element specifically since that's what expo-splash-screen generates
  const lightPattern = /\s+appearance=["']light["']/g;
  if (!lightPattern.test(xmlString)) {
    throw new Error(
      'removeAppearanceLight: No appearance="light" marker found in storyboard XML. ' +
        'The generated storyboard structure may have changed.',
    );
  }
  return xmlString.replace(lightPattern, '');
}

/**
 * Expo Config Plugin: Post-processes the generated iOS SplashScreen.storyboard
 * to remove the forced appearance="light" attribute after expo-splash-screen runs.
 * Registered after expo-splash-screen in app.json, this runs on every expo prebuild
 * and keeps the fix durable across native regeneration.
 */
const withSplashScreenDarkMode = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const storyboardPath = path.join(
        config.modRequest.platformProjectRoot,
        config.modRequest.projectName || 'GitNotes',
        'SplashScreen.storyboard',
      );

      const raw = await fs.promises.readFile(storyboardPath, 'utf8');
      const updated = removeAppearanceLight(raw);

      // Sanity check: ensure we actually changed something
      if (raw === updated) {
        throw new Error(
          'withSplashScreenDarkMode: Storyboard was not modified. ' +
            'Expected appearance="light" was not found.',
        );
      }

      // Verify the result is valid XML (basic parse check)
      const parser = new Parser();
      try {
        await parser.parseStringPromise(updated);
      } catch {
        throw new Error('withSplashScreenDarkMode: Modified storyboard is not valid XML.');
      }

      await fs.promises.writeFile(storyboardPath, updated, 'utf8');
      return config;
    },
  ]);
};

module.exports = withSplashScreenDarkMode;
module.exports.removeAppearanceLight = removeAppearanceLight;
