const {configureBraviaCodecs} = require('../scripts/configure-bravia-codecs');

describe('Bravia video surface release workaround', () => {
  const source = `new DefaultRenderersFactory(getContext())
    .setEnableDecoderFallback(true)
    .forceEnableMediaCodecAsynchronousQueueing();`;

  it('is safe to apply again after dependency installation', () => {
    const patched = configureBraviaCodecs(source);
    expect(configureBraviaCodecs(patched)).toBe(patched);
  });

  it('fails when the renderer factory no longer matches', () => {
    expect(() => configureBraviaCodecs('new DefaultRenderersFactory()')).toThrow('Native renderer factory changed');
    expect(() => configureBraviaCodecs(source + source)).toThrow('Native renderer factory changed');
  });
});
