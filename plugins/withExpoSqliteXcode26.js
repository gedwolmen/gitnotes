const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const EXPLICIT_MODULES_WORKAROUND = `    installer.pods_project.targets.each do |target|
      next unless target.name == 'ExpoSQLite'

      target.build_configurations.each do |build_configuration|
        build_configuration.build_settings['SWIFT_ENABLE_EXPLICIT_MODULES'] = 'NO'
      end
    end
`;

const INCLUDE_PATH_WORKAROUND = `    installer.pods_project.targets.each do |target|
      next unless target.name == 'ExpoSQLite'

      target.build_configurations.each do |build_configuration|
        existing_swift_include_paths = build_configuration.build_settings['SWIFT_INCLUDE_PATHS'] || '$(inherited)'
        unless existing_swift_include_paths.include?('$(PODS_TARGET_SRCROOT)')
          build_configuration.build_settings['SWIFT_INCLUDE_PATHS'] =
            "#{existing_swift_include_paths} $(PODS_TARGET_SRCROOT)".strip
        end
      end
    end
`;

function withExpoSqliteXcode26(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      const podfile = await fs.promises.readFile(podfilePath, 'utf8');

      const hasExplicitModulesWorkaround = podfile.includes(
        "build_settings['SWIFT_ENABLE_EXPLICIT_MODULES'] = 'NO'",
      );
      const hasIncludePathWorkaround = podfile.includes(
        "build_settings['SWIFT_INCLUDE_PATHS']",
      );
      if (hasExplicitModulesWorkaround && hasIncludePathWorkaround) {
        return config;
      }

      const postInstallMarker = '    react_native_post_install(\n';
      const postInstallEndMarker = '    )\n  end\nend\n';
      if (!podfile.includes(postInstallMarker) || !podfile.includes(postInstallEndMarker)) {
        throw new Error('expo-sqlite-xcode26: could not locate the Podfile post_install hook');
      }

      let updatedPodfile = podfile;
      if (!hasExplicitModulesWorkaround) {
        updatedPodfile = updatedPodfile.replace(
          postInstallMarker,
          `${EXPLICIT_MODULES_WORKAROUND}\n${postInstallMarker}`,
        );
      }
      if (!hasIncludePathWorkaround) {
        updatedPodfile = updatedPodfile.replace(
          postInstallEndMarker,
          `    )\n\n${INCLUDE_PATH_WORKAROUND}  end\nend\n`,
        );
      }
      await fs.promises.writeFile(podfilePath, updatedPodfile);
      return config;
    },
  ]);
}

module.exports = withExpoSqliteXcode26;
