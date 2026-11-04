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
    expect(patched).toContain('tileModeChanged && player != null && TvAppRenderersFactory.isAffectedBravia()');
    expect(patched).toContain('TvAppRenderersFactory.isLightweightAvc(player.getVideoFormat())');
    expect(configureBraviaCodecs(patched)).toBe(patched);
  });

  it('rejects a changed bitrate setter rather than silently missing existing decoders', () => {
    expect(() => configureBraviaCodecs(source.replace('setMaxBitRateModifier', 'setBitRate')))
      .toThrow('Native bitrate setter changed');
  });
});
