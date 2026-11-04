const {configureSurfaceSelection} = require('../scripts/configure-surface-selection');

describe('native surface selection patch', () => {
  const source = `private val playerView = PlayerView(context).apply {}
    fun updateSurfaceView(viewType: Int) {
        // TODO: Implement proper surface type switching if needed
    }`;

  it('upgrades the recognized no-op and is safe to apply again', () => {
    const patched = configureSurfaceSelection(source);
    expect(patched).toContain('private var playerView');
    expect(patched).toContain('previous.player?.let { PlayerView.switchTargetView(it, previous, next) }');
    expect(patched).toContain('ranchu');
    expect(configureSurfaceSelection(patched)).toBe(patched);
  });

  it('leaves upstream surface handling alone and rejects changed custom implementations', () => {
    const upstream = 'fun updateSurfaceView(viewType: Int) { setSurface(viewType) }';
    expect(configureSurfaceSelection(upstream)).toBe(upstream);
    expect(() => configureSurfaceSelection(source.replace('private val', 'private var')))
      .toThrow('Custom native video view changed');
  });
});
