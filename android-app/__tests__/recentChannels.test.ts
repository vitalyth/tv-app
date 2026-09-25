import {
  RecentChannelsService,
  resetRecentChannelsMemoryStore,
} from '../src/services/recentChannels';

describe('RecentChannelsService', () => {
  beforeEach(() => {
    resetRecentChannelsMemoryStore();
  });

  it('returns empty array when no recent channels exist', async () => {
    const recents = await RecentChannelsService.getRecentChannelIds();
    expect(recents).toEqual([]);
  });

  it('records watched channel and puts most recent first', async () => {
    await RecentChannelsService.recordChannelWatched('ch-11');
    await RecentChannelsService.recordChannelWatched('ch-12');
    await RecentChannelsService.recordChannelWatched('ch-13');

    const recents = await RecentChannelsService.getRecentChannelIds();
    expect(recents).toEqual(['ch-13', 'ch-12', 'ch-11']);
  });

  it('moves existing channel to the top when re-watched', async () => {
    await RecentChannelsService.recordChannelWatched('ch-11');
    await RecentChannelsService.recordChannelWatched('ch-12');
    await RecentChannelsService.recordChannelWatched('ch-11');

    const recents = await RecentChannelsService.getRecentChannelIds();
    expect(recents).toEqual(['ch-11', 'ch-12']);
  });

  it('ignores invalid channel IDs', async () => {
    const res1 = await RecentChannelsService.recordChannelWatched('');
    const res2 = await RecentChannelsService.recordChannelWatched(null as any);
    expect(res1).toBe(false);
    expect(res2).toBe(false);

    const recents = await RecentChannelsService.getRecentChannelIds();
    expect(recents).toEqual([]);
  });

  it('clears recent channels', async () => {
    await RecentChannelsService.recordChannelWatched('ch-11');
    await RecentChannelsService.clearRecentChannels();
    const recents = await RecentChannelsService.getRecentChannelIds();
    expect(recents).toEqual([]);
  });
});

