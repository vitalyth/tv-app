import {
  getVodCatalog,
  getVodSeriesDetails,
  vodEpisodeMediaItem,
  vodSeriesMediaItem,
} from '../src/api/vodCatalog';
import * as client from '../src/api/client';

afterEach(() => jest.restoreAllMocks());

it('uses real catalog filters, validates entries, and shares cached requests', async () => {
  const fetchPage = jest.spyOn(client, 'getJson').mockResolvedValue({
    series: [{ id: 's1', title: 'Series' }, { title: 'Missing ID' }],
    categories: ['Drama', 'Comedy'],
    total: 42,
    hasMore: true,
  });
  const first = getVodCatalog('kan', {
    query: 'A & B',
    category: 'Drama',
    offset: 40,
  });
  const same = getVodCatalog('kan', {
    query: 'A & B',
    category: 'Drama',
    offset: 40,
  });
  expect(first).toBe(same);
  const result = await first;
  expect(fetchPage).toHaveBeenCalledTimes(1);
  expect(fetchPage.mock.calls[0][0]).toContain('/kan-vod?');
  expect(fetchPage.mock.calls[0][0]).toContain('q=A+%26+B');
  expect(fetchPage.mock.calls[0][0]).toContain('category=Drama');
  expect(result.series).toHaveLength(1);
  expect(result.categories).toEqual(['Drama', 'Comedy']);
  expect(result.nextOffset).toBe(42);
});

it('evicts failed requests so retry can succeed', async () => {
  const fetchPage = jest
    .spyOn(client, 'getJson')
    .mockResolvedValueOnce({ series: [], error: 'Unavailable' })
    .mockResolvedValueOnce({ series: [], hasMore: false });
  await expect(getVodCatalog('reshet', { query: 'retry' })).rejects.toThrow();
  await expect(
    getVodCatalog('reshet', { query: 'retry' }),
  ).resolves.toMatchObject({ series: [], hasMore: false });
  expect(fetchPage).toHaveBeenCalledTimes(2);
});

it('loads details with encoded IDs and builds provider-specific episode playback payloads', async () => {
  const fetchDetails = jest.spyOn(client, 'getJson').mockResolvedValue({
    id: 'series/1',
    title: 'Example',
    image: 'series.jpg',
    seasons: [{ season_id: 's1', title: 'Season 1' }],
    episodes: [
      {
        id: 123,
        title: 'Episode 1',
        season_id: 's1',
        stream_url: 'https://example.com/episode.m3u8',
      },
    ],
  });
  const details = await getVodSeriesDetails('keshet', 'series/1');
  expect(fetchDetails).toHaveBeenCalledWith('/keshet-vod/series%2F1');
  const media = vodEpisodeMediaItem(details.episodes[0], details, 'keshet');
  expect(media).toMatchObject({
    kind: 'vod',
    programName: 'Example',
    seasonName: 'Season 1',
  });
  expect(media.sourcePayload).toMatchObject({
    episodeId: 'keshet-vod:123',
    module: 'keshet-vod',
    streamUrl: 'https://example.com/episode.m3u8',
    streamEndpoint: '/keshet-vod/stream?episode_id=123',
  });
  expect(vodSeriesMediaItem(details, 'keshet').sourcePayload).toBeUndefined();
});

it('rejects malformed details instead of inventing playable episodes', async () => {
  jest
    .spyOn(client, 'getJson')
    .mockResolvedValue({
      id: 'bad',
      title: 'Bad',
      error: 'No provider',
      episodes: [],
    });
  await expect(getVodSeriesDetails('i24', 'bad')).rejects.toThrow(
    'VOD series unavailable',
  );
});
