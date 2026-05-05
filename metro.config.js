const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true,
  },
});

// Stop Metro from walking into sibling git worktrees, which carry their own
// `node_modules` (sometimes with broken symlinks like skia's tvOS frameworks)
// and flood logs with ENOENT noise that has nothing to do with this project.
config.resolver.blockList = [
  /.*\/\.worktrees\/.*/,
  /.*\/\.claude\/worktrees\/.*/,
];
config.watchFolders = [__dirname];

// `isomorphic-git`'s package main resolves to `index.cjs`, which does
// `require('crypto')` at top level. Hermes/Metro have no Node std lib so the
// bundle blows up. The library also publishes a self-contained UMD bundle
// (`index.umd.min.js`) that has its own SHA-1 and never touches `crypto`.
// Redirect the bare specifier to the UMD bundle so RN can consume it.
//
// On newer Metro the package's `exports."."` -> `./index.cjs` mapping fires
// before our hook runs against the bare specifier, so we also have to catch
// the post-exports-resolution sub-path forms.
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

module.exports = config;
