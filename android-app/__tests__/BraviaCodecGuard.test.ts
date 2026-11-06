const {configureBraviaCodecs} = require('../scripts/configure-bravia-codecs');

describe('Bravia video surface release workaround', () => {
  const source = `new DefaultRenderersFactory(getContext())
    .setEnableDecoderFallback(true)
    .forceEnableMediaCodecAsynchronousQueueing();
    public void setMaxBitRateModifier(int newMaxBitRate) {
        maxBitRate = newMaxBitRate;
    }`;

  it('is safe to apply again after dependency installation', () => {
    const patched = configureBraviaCodecs(source);
    expect(configureBraviaCodecs(patched)).toBe(patched);
  });

  it('fails when the renderer factory no longer matches', () => {
    expect(() => configureBraviaCodecs('new DefaultRenderersFactory()')).toThrow('Native renderer factory changed');
    expect(() => configureBraviaCodecs(source + source)).toThrow('Native renderer factory changed');
  });

  it('upgrades an installed surface workaround and adds balancing only once', () => {
    const legacy = source.replace('new DefaultRenderersFactory(getContext())',
      'new TvAppRenderersFactory(getContext())');
    const patched = configureBraviaCodecs(legacy);
    expect(patched).toContain('new TvAppRenderersFactory(getContext(), () -> TvAppRenderersFactory.isDenseTileBitrate(maxBitRate))');
    expect(patched).toContain('TVAPP_TILE_DECODER_CONTINUITY');
    expect(patched).not.toContain('.stop()');
    expect(patched).not.toContain('.prepare()');
    expect(configureBraviaCodecs(patched)).toBe(patched);
  });

  it('removes the legacy stop/prepare policy when upgrading an existing installation', () => {
    const legacySetter = `    public void setMaxBitRateModifier(int newMaxBitRate) {
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
    const legacy = source.replace(`    public void setMaxBitRateModifier(int newMaxBitRate) {
        maxBitRate = newMaxBitRate;`, legacySetter);
    const updated = configureBraviaCodecs(legacy);
    expect(updated).toContain('TVAPP_TILE_DECODER_CONTINUITY');
    expect(updated).not.toContain('currentPlayer.stop()');
    expect(updated).not.toContain('currentPlayer.prepare()');
    expect(configureBraviaCodecs(updated)).toBe(updated);
  });

  it('rejects a changed bitrate setter rather than silently missing existing decoders', () => {
    expect(() => configureBraviaCodecs(source.replace('setMaxBitRateModifier', 'setBitRate')))
      .toThrow('Native bitrate setter changed');
  });
});
