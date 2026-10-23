const { hideNativeLiveBadge } = require('../scripts/hide-native-live-badge');

describe('native LIVE badge', () => {
  const source = 'private val liveBadge: TextView\nliveBadge.visibility = if (isLive) View.VISIBLE else View.GONE';

  it('hides the native overlay and can be applied repeatedly', () => {
    const patched = hideNativeLiveBadge(source);
    expect(patched).toContain('liveBadge.visibility = View.GONE');
    expect(patched).not.toContain('View.VISIBLE');
    expect(hideNativeLiveBadge(patched)).toBe(patched);
  });

  it('leaves upstream implementations without a custom badge unchanged', () => {
    expect(hideNativeLiveBadge('class ExoPlayerView {}')).toBe('class ExoPlayerView {}');
  });

  it('requires review if the custom badge implementation changes', () => {
    expect(() => hideNativeLiveBadge('private val liveBadge: TextView')).toThrow(
      'Native LIVE badge implementation changed',
    );
  });
});
