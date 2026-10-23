const fs = require('node:fs');
const path = require('node:path');

const visibleBadge = 'liveBadge.visibility = if (isLive) View.VISIBLE else View.GONE';
const hiddenBadge = 'liveBadge.visibility = View.GONE';

function hideNativeLiveBadge(source) {
  // Some local react-native-video builds add a badge outside the controller.
  if (!source.includes('private val liveBadge:')) {
    return source;
  }
  if (source.includes(visibleBadge)) {
    return source.replace(visibleBadge, hiddenBadge);
  }
  if (source.includes(hiddenBadge)) {
    return source;
  }
  throw new Error('Native LIVE badge implementation changed; review its visibility handling.');
}

if (require.main === module) {
  const filename = path.join(
    __dirname,
    '../node_modules/react-native-video/android/src/main/java/com/brentvatne/exoplayer/ExoPlayerView.kt',
  );
  if (fs.existsSync(filename)) {
    const source = fs.readFileSync(filename, 'utf8');
    const updated = hideNativeLiveBadge(source);
    if (updated !== source) {
      fs.writeFileSync(filename, updated);
      console.info('Disabled the native video LIVE overlay.');
    }
  }
}

module.exports = { hideNativeLiveBadge };
