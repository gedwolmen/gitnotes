module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-worklets/plugin must be the LAST plugin per the
    // react-native-worklets / Reanimated 4 docs.
    plugins: ['react-native-worklets/plugin'],
  };
};
