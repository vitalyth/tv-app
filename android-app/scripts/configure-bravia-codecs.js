const fs = require('node:fs');
const path = require('node:path');

const original = 'new DefaultRenderersFactory(getContext())';
const legacyReplacement = 'new TvAppRenderersFactory(getContext())';
const replacement = 'new TvAppRenderersFactory(getContext(), () -> TvAppRenderersFactory.isDenseTileBitrate(maxBitRate))';

const bitrateOriginal = `    public void setMaxBitRateModifier(int newMaxBitRate) {
        maxBitRate = newMaxBitRate;`;
const legacyBitrateReplacement = `    public void setMaxBitRateModifier(int newMaxBitRate) {
        // TVAPP_TILE_DECODER_BALANCE: a mode change must also re-evaluate an
        // existing low-resolution decoder, not just future player instances.
        boolean tileModeChanged = TvAppRenderersFactory.isDenseTileBitrate(maxBitRate)
                != TvAppRenderersFactory.isDenseTileBitrate(newMaxBitRate);
        maxBitRate = newMaxBitRate;
        if (tileModeChanged && player != null && TvAppRenderersFactory.isAffectedBravia()
                && TvAppRenderersFactory.isLightweightAvc(player.getVideoFormat())) {
            ExoPlayer currentPlayer = player;
            currentPlayer.stop();
            mainHandler.postDelayed(() -> {
                if (player == currentPlayer && !viewHasDropped) currentPlayer.prepare();
            }, 100);
        }`;

const bitrateReplacement = `    public void setMaxBitRateModifier(int newMaxBitRate) {
        // TVAPP_TILE_DECODER_CONTINUITY: select policy for future codec creation;
        // update ABR below without stopping an already-playing decoder.
        maxBitRate = newMaxBitRate;`;

function configureBraviaCodecs(source) {
  if (!source.includes(replacement)) {
    if (source.includes(legacyReplacement)) {
      source = source.replace(legacyReplacement, replacement);
    } else {
      if (source.split(original).length !== 2) {
        throw new Error('Native renderer factory changed; review the Bravia surface workaround.');
      }
      source = source.replace(original, replacement);
    }
  }
  if (source.includes(legacyBitrateReplacement)) {
    source = source.replace(legacyBitrateReplacement, bitrateReplacement);
  }
  if (!source.includes('TVAPP_TILE_DECODER_CONTINUITY')) {
    if (!source.includes(bitrateOriginal)) {
      throw new Error('Native bitrate setter changed; review tile decoder balancing.');
    }
    source = source.replace(bitrateOriginal, bitrateReplacement);
  }
  return source;
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
