module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      // react-native-worklets/plugin must be listed LAST (Reanimated 4).
      'react-native-worklets/plugin',
    ],
  };
};
