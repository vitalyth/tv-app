const { configureEmulatorVideo } = require('../scripts/configure-emulator-video');

describe('animated TV video rendering', () => {
  const source = `private val playerView = PlayerView(context).apply {
    // TODO: Implement proper surface type switching if needed
  }`;

  it('keeps a compositor-backed texture on physical TVs and emulators without changing the player', () => {
    const patched = configureEmulatorVideo(source);
    expect(patched).toContain('TVAPP_ANIMATED_TEXTURE');
    expect(patched).toContain('R.layout.tvapp_texture_player_view');
    expect(patched).not.toContain('else PlayerView(context)');
    expect(patched).not.toContain('.setPlayer(');
    expect(configureEmulatorVideo(patched)).toBe(patched);
  });

  it('upgrades an existing emulator-only installation without duplicating the patch', () => {
    const legacy = `// TVAPP_EMULATOR_TEXTURE: keep emulator video inside the UI compositor.
    private val playerView = (if (android.os.Build.HARDWARE in listOf("ranchu", "goldfish")) {
        android.view.LayoutInflater.from(context).inflate(
            com.brentvatne.react.R.layout.tvapp_texture_player_view, this, false
        ) as PlayerView
    } else PlayerView(context)).apply {
      // TODO: Implement proper surface type switching if needed
    }`;
    const patched = configureEmulatorVideo(legacy);
    expect(patched).not.toContain('TVAPP_EMULATOR_TEXTURE');
    expect(patched).not.toContain('Build.HARDWARE');
    expect(patched).toContain('TVAPP_ANIMATED_TEXTURE');
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
