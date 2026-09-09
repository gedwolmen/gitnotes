const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SWIFTUI_PRIVATE_AUTOLINK_FLAGS =
  '-Xfrontend -disable-autolink-framework -Xfrontend SwiftUICore ' +
  '-Xfrontend -disable-autolink-framework -Xfrontend UIUtilities';

const SQLITE_EXPLICIT_MODULES_WORKAROUND = `    installer.pods_project.targets.each do |target|
      next unless target.name == 'ExpoSQLite'

      target.build_configurations.each do |build_configuration|
        build_configuration.build_settings['CLANG_ENABLE_EXPLICIT_MODULES'] = 'NO'
        build_configuration.build_settings['SWIFT_ENABLE_EXPLICIT_MODULES'] = 'NO'
      end
    end

`;

const SWIFTUICORE_WORKAROUND = `    installer.aggregate_targets.each do |aggregate_target|
      next unless aggregate_target.user_project

      aggregate_target.user_project.native_targets.each do |target|
        target.build_configurations.each do |build_configuration|
          swift_flags = build_configuration.build_settings['OTHER_SWIFT_FLAGS'] || '$(inherited)'
          swift_flags = swift_flags.join(' ') if swift_flags.is_a?(Array)
          unless swift_flags.include?('${SWIFTUI_PRIVATE_AUTOLINK_FLAGS}')
            build_configuration.build_settings['OTHER_SWIFT_FLAGS'] = "\#{swift_flags} ${SWIFTUI_PRIVATE_AUTOLINK_FLAGS}"
          end
        end
      end

      aggregate_target.user_project.save
    end

    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_configuration|
        swift_flags = build_configuration.build_settings['OTHER_SWIFT_FLAGS'] || '$(inherited)'
        swift_flags = swift_flags.join(' ') if swift_flags.is_a?(Array)
        unless swift_flags.include?('${SWIFTUI_PRIVATE_AUTOLINK_FLAGS}')
          build_configuration.build_settings['OTHER_SWIFT_FLAGS'] = "\#{swift_flags} ${SWIFTUI_PRIVATE_AUTOLINK_FLAGS}"
        end
      end
    end
`;

const EXPLICIT_MODULES_WORKAROUND = `${SQLITE_EXPLICIT_MODULES_WORKAROUND}
${SWIFTUICORE_WORKAROUND}`;

function withExpoSqliteXcode26(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let podfile = await fs.promises.readFile(podfilePath, 'utf8');

      const clangSetting =
        "build_configuration.build_settings['CLANG_ENABLE_EXPLICIT_MODULES'] = 'NO'";
      const swiftSetting =
        "build_configuration.build_settings['SWIFT_ENABLE_EXPLICIT_MODULES'] = 'NO'";
      const legacySwiftSetting = "build_settings['SWIFT_ENABLE_EXPLICIT_MODULES'] = 'NO'";
      const marker = '    react_native_post_install(\n';
      if (!podfile.includes(marker)) {
        throw new Error('expo-sqlite-xcode26: could not locate the Podfile post_install hook');
      }

      if (podfile.includes(legacySwiftSetting)) {
        podfile = podfile.replace(legacySwiftSetting, swiftSetting);
      }

      if (podfile.includes(SWIFTUI_PRIVATE_AUTOLINK_FLAGS)) {
        await fs.promises.writeFile(podfilePath, podfile);
        return config;
      }

      if (podfile.includes(clangSetting)) {
        await fs.promises.writeFile(
          podfilePath,
          podfile.replace(marker, `${SWIFTUICORE_WORKAROUND}\n${marker}`),
        );
        return config;
      }

      if (podfile.includes(swiftSetting)) {
        const migratedPodfile = podfile.replace(
          swiftSetting,
          `${clangSetting}\n        ${swiftSetting}`,
        );
        await fs.promises.writeFile(
          podfilePath,
          migratedPodfile.replace(marker, `${SWIFTUICORE_WORKAROUND}\n${marker}`),
        );
        return config;
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
