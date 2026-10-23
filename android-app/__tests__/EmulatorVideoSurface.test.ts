const { configureEmulatorVideo } = require('../scripts/configure-emulator-video');

describe('emulator video rendering', () => {
  const source = `private val playerView = PlayerView(context).apply {
    // TODO: Implement proper surface type switching if needed
  }`;

  it('uses a texture only on emulator hardware and preserves physical-device rendering', () => {
    const patched = configureEmulatorVideo(source);
    expect(patched).toContain('android.os.Build.HARDWARE in listOf("ranchu", "goldfish")');
    expect(patched).toContain('R.layout.tvapp_texture_player_view');
    expect(patched).toContain('else PlayerView(context)');
    expect(patched).not.toContain('.setPlayer(');
    expect(configureEmulatorVideo(patched)).toBe(patched);
  });

  it('does not modify upstream implementations with working surface selection', () => {
    const upstream = 'class ExoPlayerView { fun updateSurfaceView(type: Int) {} }';
    expect(configureEmulatorVideo(upstream)).toBe(upstream);
  });

  it('fails explicitly when the custom view no longer matches', () => {
    expect(() => configureEmulatorVideo(
      '// TODO: Implement proper surface type switching if needed',
    )).toThrow('Custom native video view changed');
  });
});
