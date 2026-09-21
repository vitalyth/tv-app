const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

 /**
+ * Metro configuration
+ * https://facebook.github.io/metro/docs/configuration
  *
+ * @type {import('metro-config').MetroConfig}
  */
const config = {
  watchFolders: [path.resolve(__dirname, '../..', 'src')],
  resolver: {
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(__dirname, '../..', 'node_modules'),
    ],
    sourceExts: ['kepler.tsx', 'kepler.ts', 'kepler.js', 'tsx', 'ts', 'js', 'json'],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
