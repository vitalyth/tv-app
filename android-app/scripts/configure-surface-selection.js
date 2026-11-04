const fs = require('node:fs');
const path = require('node:path');

const original = `    fun updateSurfaceView(viewType: Int) {
        // TODO: Implement proper surface type switching if needed
    }`;

const replacement = `    // TVAPP_SELECTABLE_SURFACE: extra tiles can bypass texture composition.
    fun updateSurfaceView(viewType: Int) {
        // Keep the known working emulator path and pre-N animation behavior.
        val texture = viewType == 0 || android.os.Build.VERSION.SDK_INT < 24 ||
            android.os.Build.HARDWARE in listOf("ranchu", "goldfish")
        if ((playerView.videoSurfaceView is android.view.TextureView) == texture) return
        val previous = playerView
        val next = (if (texture) android.view.LayoutInflater.from(context).inflate(
            com.brentvatne.react.R.layout.tvapp_texture_player_view, this, false
        ) as PlayerView else PlayerView(context)).apply {
            layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
            setShutterBackgroundColor(Color.TRANSPARENT)
            useController = previous.useController
            resizeMode = previous.resizeMode
            setUseArtwork(false)
            setShowSubtitleButton(false)
            isFocusable = previous.isFocusable
        }
        (next.videoSurfaceView as? android.view.SurfaceView)?.setSecure(viewType == 2)
        addView(next, 0)
        // Attach the new target before detaching the old one; keep the player,
        // its listeners, buffer, and playback position.
        previous.player?.let { PlayerView.switchTargetView(it, previous, next) }
        removeView(previous)
        playerView = next
        setSubtitleStyle(localStyle)
        requestLayout()
    }`;

function configureSurfaceSelection(source) {
  if (source.includes('TVAPP_SELECTABLE_SURFACE')) return source;
  if (!source.includes('// TODO: Implement proper surface type switching if needed')) return source;
  if (!source.includes(original) || !source.includes('private val playerView =')) {
    throw new Error('Custom native video view changed; review surface selection.');
  }
  return source.replace('private val playerView =', 'private var playerView =')
    .replace(original, replacement);
}

if (require.main === module) {
  const filename = path.join(__dirname,
    '../node_modules/react-native-video/android/src/main/java/com/brentvatne/exoplayer/ExoPlayerView.kt');
  if (fs.existsSync(filename)) {
    const source = fs.readFileSync(filename, 'utf8');
    const updated = configureSurfaceSelection(source);
    if (updated !== source) fs.writeFileSync(filename, updated);
  }
}

module.exports = {configureSurfaceSelection};
