import { resolveBackdropUrl, resolvePosterUrl } from '../src/api/channels';
import { API_BASE_URL, SERVICE_BASE_URL, SERVICE_REFERER } from '../src/config/api';

describe('Image resolution priority ladder', () => {
  it('resolves tier 1: Program backdrop when available', () => {
    const backdrop = resolveBackdropUrl(
      { backdrop: 'https://example.com/backdrop.jpg', image: 'https://example.com/image.jpg' },
      { artwork: 'https://example.com/artwork.jpg', logo: 'logo.png' },
    );
    expect(backdrop).toBe(
      `${API_BASE_URL}/proxy?url=${encodeURIComponent('https://example.com/backdrop.jpg')}&referer=${encodeURIComponent(SERVICE_REFERER)}`,
    );
  });

  it('resolves tier 1 alt: Program backdrop_image', () => {
    const backdrop = resolveBackdropUrl(
      { backdrop_image: 'https://example.com/backdrop2.jpg' },
      { artwork: 'https://example.com/artwork.jpg', logo: 'logo.png' },
    );
    expect(backdrop).toBe(
      `${API_BASE_URL}/proxy?url=${encodeURIComponent('https://example.com/backdrop2.jpg')}&referer=${encodeURIComponent(SERVICE_REFERER)}`,
    );
  });

  it('resolves tier 2: Program image/poster when no program backdrop exists', () => {
    const backdrop = resolveBackdropUrl(
      { image: 'https://example.com/prog-image.jpg' },
      { artwork: 'https://example.com/artwork.jpg', logo: 'logo.png' },
    );
    expect(backdrop).toBe(
      `${API_BASE_URL}/proxy?url=${encodeURIComponent('https://example.com/prog-image.jpg')}&referer=${encodeURIComponent(SERVICE_REFERER)}`,
    );
  });

  it('resolves tier 3: Channel artwork when program has no images', () => {
    const backdrop = resolveBackdropUrl(
      undefined,
      { artwork: 'channel_art.jpg', logo: 'logo.png' },
    );
    expect(backdrop).toBe(`${SERVICE_BASE_URL}/ch/channel_art.jpg`);
  });

  it('resolves tier 4: Channel logo fallback when no artwork exists', () => {
    const backdrop = resolveBackdropUrl(
      undefined,
      { logo: 'ch_logo.png' },
    );
    expect(backdrop).toBe(`${SERVICE_BASE_URL}/ch/ch_logo.png`);
  });

  it('resolves tier 5: undefined (default background fallback) when no image source is provided', () => {
    const backdrop = resolveBackdropUrl(undefined, undefined);
    expect(backdrop).toBeUndefined();
  });

  it('resolves poster priority: Program image -> Channel artwork -> Channel logo', () => {
    const posterProg = resolvePosterUrl(
      { image: 'https://example.com/prog-poster.jpg' },
      { artwork: 'art.png', logo: 'logo.png' },
    );
    expect(posterProg).toContain(encodeURIComponent('https://example.com/prog-poster.jpg'));

    const posterArt = resolvePosterUrl(
      undefined,
      { artwork: 'art.png', logo: 'logo.png' },
    );
    expect(posterArt).toBe(`${SERVICE_BASE_URL}/ch/art.png`);

    const posterLogo = resolvePosterUrl(
      undefined,
      { logo: 'logo.png' },
    );
    expect(posterLogo).toBe(`${SERVICE_BASE_URL}/ch/logo.png`);
  });
});
