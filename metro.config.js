const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativewind } = require('nativewind/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true,
  },
});

config.resolver.blockList = [
  // No worktree blocking — worktrees serve themselves
  /.*\/dogfood-output\/.*/,
];
config.resolver.unstable_conditionNames = ['require', 'default'];
config.watchFolders = [__dirname];

module.exports = withNativewind(config);
