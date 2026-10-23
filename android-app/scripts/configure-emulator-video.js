const fs = require('node:fs');
const path = require('node:path');

const original = 'private val playerView = PlayerView(context).apply {';
const replacement = `// TVAPP_EMULATOR_TEXTURE: keep emulator video inside the UI compositor.
    private val playerView = (if (android.os.Build.HARDWARE in listOf("ranchu", "goldfish")) {
        android.view.LayoutInflater.from(context).inflate(
            com.brentvatne.react.R.layout.tvapp_texture_player_view, this, false
        ) as PlayerView
    } else PlayerView(context)).apply {`;

function configureEmulatorVideo(source) {
  if (source.includes('TVAPP_EMULATOR_TEXTURE')) {
    return source;
  }
  // Upstream implementations already handle the requested surface type.
  if (!source.includes('// TODO: Implement proper surface type switching if needed')) {
    return source;
  }
  if (!source.includes(original)) {
    throw new Error('Custom native video view changed; review emulator surface handling.');
  }
  return source.replace(original, replacement);
}

if (require.main === module) {
  const nativeRoot = path.join(__dirname, '../node_modules/react-native-video/android/src/main');
  const filename = path.join(nativeRoot, 'java/com/brentvatne/exoplayer/ExoPlayerView.kt');
  if (fs.existsSync(filename)) {
    const source = fs.readFileSync(filename, 'utf8');
    const updated = configureEmulatorVideo(source);
    if (updated.includes('TVAPP_EMULATOR_TEXTURE')) {
      const layoutRoot = path.join(nativeRoot, 'res/layout');
      fs.mkdirSync(layoutRoot, { recursive: true });
      fs.copyFileSync(
        path.join(__dirname, 'native-video/tvapp_texture_player_view.xml'),
        path.join(layoutRoot, 'tvapp_texture_player_view.xml'),
      );
    }
    if (updated !== source) {
      fs.writeFileSync(filename, updated);
      console.info('Configured emulator-only TextureView rendering.');
    }
  }
}

module.exports = { configureEmulatorVideo };
