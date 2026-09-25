import {
  toVodMediaItem,
  resolveVodImage,
  resolveVodStream,
  type ApiVodRecentItem,
} from '../src/api/vod';
import type { MediaItem } from '../src/media/player';

describe('VOD API Mapper & Resolver', () => {
  it('maps raw vod recent item to MediaItem correctly', () => {
    const raw: ApiVodRecentItem = {
      id: 'kan-vod:12345',
      episodeId: '12345',
      name: 'פרק 3: ההתחלה',
      programName: 'טהרן',
      channelName: 'כאן 11',
      description: 'תיאור הפרק...',
      episodeImage: 'https://images.frp1.ott.kaltura.com/p/123/thumbnail.jpg',
      season: '2',
      streamUrl: 'https://cdn.example.com/hls/tehran.m3u8',
    };

    const mediaItem = toVodMediaItem(raw);
    expect(mediaItem).toBeDefined();
    expect(mediaItem?.id).toBe('vod-12345');
    expect(mediaItem?.kind).toBe('vod');
    expect(mediaItem?.title).toBe('פרק 3: ההתחלה');
    expect(mediaItem?.channelName).toBe('כאן 11');
    expect(mediaItem?.channelNumber).toBe('Season 2');
    expect(mediaItem?.description).toBe('תיאור הפרק...');
    expect(mediaItem?.imageUrl).toContain('images.frp1.ott.kaltura.com');
  });

  it('selects fallback images in the correct priority order', () => {
    // 1. Program image when episodeImage is missing
    const withoutEpisodeImg: ApiVodRecentItem = {
      episodeId: '999',
      name: 'פרק ללא תמונה',
      programImage: 'https://images.frp1.ott.kaltura.com/p/prog.jpg',
      channelImage: 'https://example.com/ch.png',
    };
    const images1 = resolveVodImage(withoutEpisodeImg);
    expect(images1.imageUrl).toContain('prog.jpg');

    // 2. Channel image when both episode and program are missing
    const onlyChannelImg: ApiVodRecentItem = {
      episodeId: '888',
      name: 'פרק ללא תמונות תוכנית',
      channelImage: 'https://example.com/kan.png',
    };
    const images2 = resolveVodImage(onlyChannelImg);
    expect(images2.imageUrl).toContain('kan.png');
  });

  it('resolves stream URL with proxy for VOD item', async () => {
    const item: MediaItem = {
      id: 'vod-123',
      kind: 'vod',
      title: 'פרק בדיקה',
      sourcePayload: {
        episodeId: '123',
        streamUrl: 'https://kan.org.il/stream.m3u8',
        module: 'kan-vod',
      },
    };

    const stream = await resolveVodStream(item);
    expect(stream.url).toContain('/v/proxy?url=');
    expect(stream.url).toContain('vpn=true');
    expect(stream.type).toBe('m3u8');
  });
});

