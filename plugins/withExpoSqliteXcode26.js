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

function withExpoSqliteXcode26(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      const podfile = await fs.promises.readFile(podfilePath, 'utf8');

      if (podfile.includes("build_settings['SWIFT_ENABLE_EXPLICIT_MODULES'] = 'NO'")) {
        return config;
      }

      const marker = '    react_native_post_install(\n';
      if (!podfile.includes(marker)) {
        throw new Error('expo-sqlite-xcode26: could not locate the Podfile post_install hook');
      }

      await fs.promises.writeFile(
        podfilePath,
        podfile.replace(marker, `${EXPLICIT_MODULES_WORKAROUND}\n${marker}`),
      );
      return config;
    },
  ]);
}

module.exports = withExpoSqliteXcode26;
