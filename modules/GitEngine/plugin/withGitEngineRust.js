const { withPodfile, withXcodeProject } = require('@expo/config-plugins');

const PHASE_NAME = 'Build Rust (gitnotes_git2)';

/**
 * Injects a CocoaPods post_install hook that makes the UniFFI-generated
 * `GitNotesGit2FFI` clang module discoverable by the aggregate Swift target.
 * `ExpoModulesProvider.swift` does `internal import GitEngine`, and GitEngine's
 * Swift module transitively imports GitNotesGit2FFI — the consumer must be able
 * to resolve that module or the build fails with "missing required module".
 */
function withGitEngineRustPodfile(config) {
  return withPodfile(config, (podConfig) => {
    let contents = podConfig.modResults.contents;

    const gitEnginePod = "pod 'GitEngine', :path => '../modules/GitEngine/ios-local'";
    if (!contents.includes(gitEnginePod)) {
      const nativeModulesCall = 'config = use_native_modules!(config_command)';
      const insertionPoint = contents.indexOf(nativeModulesCall);
      if (insertionPoint !== -1) {
        const afterCall = insertionPoint + nativeModulesCall.length;
        contents =
          contents.slice(0, afterCall) + '\n  ' + gitEnginePod + '\n' + contents.slice(afterCall);
      }
    }

    const marker = 'post_install do |installer|';
    const hook = `${marker}\n    # [gitnotes] Expose GitNotesGit2FFI (UniFFI) module to the aggregate Swift target.\n    gitnotes_root = File.expand_path('../..', installer.sandbox.root)\n    gitnotes_ffi = File.join(gitnotes_root, 'modules', 'GitEngine', 'ios-local', 'generated')\n    installer.aggregate_targets.each do |aggregate|\n      aggregate.xcconfigs.each do |config_name, xcconfig|\n        existing = xcconfig.attributes['SWIFT_INCLUDE_PATHS'] || ''\n        unless existing.include?(gitnotes_ffi)\n          xcconfig.attributes['SWIFT_INCLUDE_PATHS'] = "$(inherited) #{gitnotes_ffi} #{existing}".strip\n          xcconfig.save_as(aggregate.xcconfig_path(config_name))\n        end\n      end\n    end\n`;
    if (contents.includes(marker) && !contents.includes('gitnotes_ffi')) {
      contents = contents.replace(marker, hook);
    }
    podConfig.modResults.contents = contents;
    return podConfig;
  });
}

/**
 * Adds a run-script build phase that compiles the Rust engine for the active
 * iOS platform/arch and copies libgitnotes_git2.a into the GitEngine module
 * before the pod's vendored staticlib is linked. This makes
 * `npx expo run:ios` / Xcode builds self-contained (no manual cargo step).
 */
function withGitEngineRust(config) {
  return withXcodeProject(config, (modConfig) => {
    const project = modConfig.modResults;
    const targetUuid = project.getFirstTarget().uuid;
    const nativeTarget = project.hash.project.objects.PBXNativeTarget[targetUuid];

    const alreadyAdded = nativeTarget.buildPhases.some((phase) => {
      const section = project.hash.project.objects.PBXShellScriptBuildPhase || {};
      const buildPhase = section[phase.value];
      return (
        buildPhase && (buildPhase.name === `"${PHASE_NAME}"` || buildPhase.name === PHASE_NAME)
      );
    });
    if (alreadyAdded) {
      return modConfig;
    }

    const shellScript = ['set -e', '"$SRCROOT/../scripts/build-rust.sh" --xcode', ''].join('\n');

    const { uuid } = project.addBuildPhase([], 'PBXShellScriptBuildPhase', PHASE_NAME, targetUuid, {
      inputPaths: [],
      outputPaths: [],
      shellPath: '/bin/sh',
      shellScript,
    });

    // addBuildPhase appends the phase last (after linking); the Rust archive
    // must exist before the vendored staticlib is linked, so move it first.
    nativeTarget.buildPhases = [
      { value: uuid, comment: PHASE_NAME },
      ...nativeTarget.buildPhases.filter((phase) => phase.value !== uuid),
    ];

    const buildConfigs = (nativeTarget.buildConfigurationList.value || [])
      .map((ref) => project.hash.project.objects.PBXBuildConfiguration[ref.value])
      .filter(Boolean);
    for (const buildConfig of buildConfigs) {
      const settings = buildConfig.buildSettings;
      if (!settings) continue;
      const existing = settings.OTHER_LDFLAGS || '$(inherited)';
      if (!existing.includes('libgitnotes_git2.a')) {
        settings.OTHER_LDFLAGS =
          '$(inherited) ' + '"$(SRCROOT)/../modules/GitEngine/ios-local/rust/libgitnotes_git2.a"';
      }
    }

    return modConfig;
  });
}

module.exports = (config) => withGitEngineRustPodfile(withGitEngineRust(config));
