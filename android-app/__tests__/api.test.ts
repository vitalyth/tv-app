import {
  getLiveChannelCount,
  getPlayableLiveChannels,
  resolveLiveChannelStream,
} from '../src/api/channels';
import { API_BASE_URL } from '../src/config/api';
import type { MediaItem } from '../src/media/player';

describe('getLiveChannelCount', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns the number of channels from the real API shape', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'ch_11' }, { id: 'ch_12' }],
    } as Response);
    await expect(getLiveChannelCount()).resolves.toBe(2);
  });

  it('rejects an unexpected API shape', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ channels: [] }),
    } as Response);
    await expect(getLiveChannelCount()).rejects.toThrow(
      'Unexpected live channels response',
    );
  });
});

describe('resolveLiveChannelStream', () => {
  afterEach(() => jest.restoreAllMocks());

  const item = (sourcePayload: {
    id: string;
    module?: string;
    linkDetails: { link: string; referer?: string };
  }): MediaItem => ({
    id: sourcePayload.id,
    kind: 'live',
    title: 'Current program',
    channelName: sourcePayload.id === 'ch_11' ? 'כאן 11' : 'קשת 12',
    sourcePayload,
  });

  it('uses the VPN resolver and playback proxy for Kan channels', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ stream: 'https://r.il.cdn-redge.media/live.m3u8' }),
    } as Response);

    const stream = await resolveLiveChannelStream(
      item({ id: 'ch_11', module: 'kan', linkDetails: { link: 'raw-url' } }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/v/live_channel`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(stream.url).toContain(`${API_BASE_URL}/v/proxy?url=`);
    expect(stream.url).toContain('referer=');
    expect(stream.url).toContain('vpn=true');
    expect(stream.type).toBe('m3u8');
  });

  it('uses the standard resolver for other live channels', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ stream: 'https://example.com/live.m3u8' }),
    } as Response);

    const stream = await resolveLiveChannelStream(
      item({ id: 'ch_12', linkDetails: { link: 'raw-url' } }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/live_channel`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(stream.url).toContain(`${API_BASE_URL}/proxy?url=`);
    expect(stream.url).toContain(
      encodeURIComponent('https://example.com/live.m3u8'),
    );
  });

  it('proxies Reshet streams with the channel referer', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ stream: 'https://reshet.example/live.m3u8' }),
    } as Response);

    const stream = await resolveLiveChannelStream(
      item({
        id: 'ch_13',
        module: 'reshet',
        linkDetails: {
          link: 'raw-url',
          referer: 'https://13tv.co.il/live/',
        },
      }),
    );

    expect(stream.url).toContain('/api/v/proxy?url=');
    expect(stream.url).toContain(
      encodeURIComponent('https://13tv.co.il/live/'),
    );
    expect(stream.url).toContain('vpn=true');
  });

  it('identifies extensionless live.livx manifests as MPEG-DASH', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        stream:
          'https://r.il.cdn-redge.media/livedash/live/kan11/live.livx?dvr=120000',
      }),
    } as Response);

    const stream = await resolveLiveChannelStream(
      item({ id: 'ch_11b', linkDetails: { link: 'raw-url' } }),
    );

    expect(stream.type).toBe('mpd');
    expect(stream.fallbackType).toBe('m3u8');
    expect(stream.fallbackUrl).toContain(
      encodeURIComponent('/livehls/live/kan11/live.livx/playlist.m3u8'),
    );
  });
});

describe('getPlayableLiveChannels', () => {
  afterEach(() => jest.restoreAllMocks());

  it('keeps TV channels that rely entirely on the resolver', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 'resolver-only', name: 'Resolver TV', type: 'tv' },
      ],
    } as Response);

    await expect(getPlayableLiveChannels()).resolves.toEqual([
      expect.objectContaining({
        id: 'resolver-only',
        channelName: 'Resolver TV',
      }),
    ]);
  });
});
