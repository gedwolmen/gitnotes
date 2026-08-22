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
  /.*\/\.worktrees\/.*/,
  /.*\/\.claude\/worktrees\/.*/,
  /.*\/dogfood-output\/.*/,
];
config.resolver.unstable_conditionNames = ['require', 'default'];
config.watchFolders = [__dirname];

const isoGitUmd = path.resolve(
  __dirname,
  'node_modules/isomorphic-git/index.umd.min.js',
);
const baseResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === 'isomorphic-git' ||
    moduleName === 'isomorphic-git/index.cjs' ||
    moduleName === 'isomorphic-git/index.js'
  ) {
    return { type: 'sourceFile', filePath: isoGitUmd };
  }
  if (baseResolveRequest) {
    return baseResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativewind(config);
