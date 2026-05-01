module.exports = function (api) {
  api.cache(true);

  const isProduction =
    process.env.BABEL_ENV === 'production' ||
    process.env.NODE_ENV === 'production';

  const plugins = [];
  if (isProduction) {
    plugins.push(['transform-remove-console', { exclude: ['error', 'warn'] }]);
  }
  // react-native-worklets/plugin must be the LAST plugin per the
  // react-native-worklets / Reanimated 4 docs.
  plugins.push('react-native-worklets/plugin');

  return {
    presets: ['babel-preset-expo'],
    plugins,
  };
};
