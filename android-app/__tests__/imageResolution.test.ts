import {
  resolveBackdropUrl,
  resolvePosterUrl,
  upgradeImageResolution,
} from '../src/api/channels';
import {
  API_BASE_URL,
  SERVICE_BASE_URL,
  SERVICE_REFERER,
} from '../src/config/api';

describe('Image resolution priority ladder', () => {
  it('resolves tier 1: Program backdrop when available', () => {
    const backdrop = resolveBackdropUrl(
      {
        backdrop: 'https://example.com/backdrop.jpg',
        image: 'https://example.com/image.jpg',
      },
      { artwork: 'https://example.com/artwork.jpg', logo: 'logo.png' },
    );
    expect(backdrop).toBe(
      `${API_BASE_URL}/proxy?url=${encodeURIComponent(
        'https://example.com/backdrop.jpg',
      )}&referer=${encodeURIComponent(SERVICE_REFERER)}`,
    );
  });

  it('resolves tier 1 alt: Program backdrop_image', () => {
    const backdrop = resolveBackdropUrl(
      { backdrop_image: 'https://example.com/backdrop2.jpg' },
      { artwork: 'https://example.com/artwork.jpg', logo: 'logo.png' },
    );
    expect(backdrop).toBe(
      `${API_BASE_URL}/proxy?url=${encodeURIComponent(
        'https://example.com/backdrop2.jpg',
      )}&referer=${encodeURIComponent(SERVICE_REFERER)}`,
    );
  });

  it('resolves tier 2: Program image/poster when no program backdrop exists', () => {
    const backdrop = resolveBackdropUrl(
      { image: 'https://example.com/prog-image.jpg' },
      { artwork: 'https://example.com/artwork.jpg', logo: 'logo.png' },
    );
    expect(backdrop).toBe(
      `${API_BASE_URL}/proxy?url=${encodeURIComponent(
        'https://example.com/prog-image.jpg',
      )}&referer=${encodeURIComponent(SERVICE_REFERER)}`,
    );
  });

  it('resolves tier 3: Channel artwork when program has no images', () => {
    const backdrop = resolveBackdropUrl(undefined, {
      artwork: 'channel_art.jpg',
      logo: 'logo.png',
    });
    expect(backdrop).toBe(`${SERVICE_BASE_URL}/ch/channel_art.jpg`);
  });

  it('resolves tier 4: Channel logo fallback when no artwork exists', () => {
    const backdrop = resolveBackdropUrl(undefined, { logo: 'ch_logo.png' });
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
    expect(posterProg).toContain(
      encodeURIComponent('https://example.com/prog-poster.jpg'),
    );

    const posterArt = resolvePosterUrl(undefined, {
      artwork: 'art.png',
      logo: 'logo.png',
    });
    expect(posterArt).toBe(`${SERVICE_BASE_URL}/ch/art.png`);

    const posterLogo = resolvePosterUrl(undefined, { logo: 'logo.png' });
    expect(posterLogo).toBe(`${SERVICE_BASE_URL}/ch/logo.png`);
  });

  describe('upgradeImageResolution (High Quality Backdrops)', () => {
    it('upgrades Kan Umbraco thumbnail query to 1920x1080 for backdrops', () => {
      const original =
        'https://www.kan.org.il/media/qczl5kij/cover_1920x1080.jpg?rmode=pad&width=288&height=162';
      const upgraded = upgradeImageResolution(original, true);
      expect(upgraded).toContain('width=1920');
      expect(upgraded).toContain('height=1080');
    });

    it('keeps Kan card thumbnails at a size supported by its image server', () => {
      const original =
        'https://mobapi.kan.org.il/media/show/program.jpg?rmode=pad&width=288&height=162';

      expect(upgradeImageResolution(original, false)).toBe(original);
    });

    it('upgrades Cloudinary (Reshet 13) grid thumbnail to 1920x1080 backdrop', () => {
      const original =
        'https://media3.reshet.tv/image/upload/t_new_grid_item/v1740399479/uploads/2025/904477416.jpg';
      const upgraded = upgradeImageResolution(original, true);
      expect(upgraded).toContain('w_1920');
      expect(upgraded).toContain('h_1080');
      expect(upgraded).toContain('q_90');
      expect(upgraded).not.toContain('t_new_grid_item');
    });

    it('preserves a Cloudinary public ID path when no version is present', () => {
      const original =
        'https://media3.reshet.tv/image/upload/uploads/2026/program.jpg';
      const upgraded = upgradeImageResolution(original, true);
      expect(upgraded).toContain('/uploads/2026/program.jpg');
    });

    it('upgrades Kaltura OTT CDN thumbnails to 1920x1080', () => {
      const original =
        'https://images.frp1.ott.kaltura.com/api_v3/p/123/thumbnail/entry_id/abc/width/320/height/180/quality/60';
      const upgraded = upgradeImageResolution(original, true);
      expect(upgraded).toContain('/width/1920');
      expect(upgraded).toContain('/height/1080');
      expect(upgraded).toContain('/quality/90');
    });

    it('unwraps Immergo (Channel 14) resize proxy to extract original high-res asset for backdrop', () => {
      const inner =
        'https://channel14.vod.immergo.tv/channel14/uploaded/9da5e997-58fc-484a-ac4b-577cbc72de8e.png';
      const original = `https://insight-images-do.immergo.tv/resize?url=${encodeURIComponent(
        inner,
      )}`;
      const upgraded = upgradeImageResolution(original, true);
      expect(upgraded).toBe(inner);
    });

    it('preserves shorthand query parameter names', () => {
      const original = 'https://images.example.com/p.jpg?w=288&h=162&q=60';
      const upgraded = upgradeImageResolution(original, true);
      expect(upgraded).toContain('w=1920');
      expect(upgraded).toContain('h=1080');
      expect(upgraded).toContain('q=90');
      expect(upgraded).not.toContain('width=');
    });

    it('upgrades Redge destination dimensions', () => {
      const original =
        'https://r.il.cdn-redge.media/scale/image.jpg?dsth=393&dstw=704&quality=80';
      const upgraded = upgradeImageResolution(original, true);
      expect(upgraded).toContain('dsth=1080');
      expect(upgraded).toContain('dstw=1920');
      expect(upgraded).toContain('quality=90');
    });

    it('upgrades Channel 14 WordPress image dimensions', () => {
      const original =
        'https://www.c14.co.il/images/300/90/wp-content/uploads/show.webp';
      expect(upgradeImageResolution(original, true)).toContain(
        '/images/1920/90/',
      );
      expect(upgradeImageResolution(original, false)).toContain(
        '/images/480/78/',
      );
    });
  });
});
