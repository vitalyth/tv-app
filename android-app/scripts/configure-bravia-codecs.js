const fs = require('node:fs');
const path = require('node:path');

const original = 'new DefaultRenderersFactory(getContext())';
const replacement = 'new TvAppRenderersFactory(getContext())';

function configureBraviaCodecs(source) {
  if (source.includes(replacement)) {
    return source;
  }
  if (source.split(original).length !== 2) {
    throw new Error('Native renderer factory changed; review the Bravia surface workaround.');
  }
  return source.replace(original, replacement);
}

if (require.main === module) {
  const nativeRoot = path.join(__dirname,
    '../node_modules/react-native-video/android/src/main/java/com/brentvatne/exoplayer');
  const filename = path.join(nativeRoot, 'ReactExoplayerView.java');
  if (fs.existsSync(filename)) {
    const source = fs.readFileSync(filename, 'utf8');
    const updated = configureBraviaCodecs(source);
    fs.copyFileSync(path.join(__dirname, 'native-video/TvAppRenderersFactory.java'),
      path.join(nativeRoot, 'TvAppRenderersFactory.java'));
    if (updated !== source) {
      fs.writeFileSync(filename, updated);
      console.info('Configured Sony Android 12 video surface release workaround.');
    }
  }
}

module.exports = {configureBraviaCodecs};
