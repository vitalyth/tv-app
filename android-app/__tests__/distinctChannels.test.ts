import {
  distinctLogicalChannels,
  formatProgramTimeRange,
  calculateProgramProgress,
  getLiveChannelSourceOptions,
  getDistinctLiveChannels,
  selectLiveChannelSource,
} from '../src/api/channels';

describe('Channels deduplication and time formatting', () => {
  it('deduplicates live channels by index or channel number', () => {
    const rawChannels = [
      {
        id: 'ch_11',
        name: 'כאן 11',
        channelNumber: '11',
        index: 1,
        type: 'tv',
        linkDetails: { link: 'https://stream1.m3u8' },
      },
      {
        id: 'ch_11_backup',
        name: 'כאן 11 גיבוי',
        channelNumber: '11',
        index: 1,
        type: 'tv',
        linkDetails: { link: 'https://stream2.m3u8' },
      },
      {
        id: 'ch_12',
        name: 'קשת 12',
        channelNumber: '12',
        index: 2,
        type: 'tv',
        linkDetails: { link: 'https://stream3.m3u8' },
      },
      {
        id: 'radio_kan',
        name: 'כאן ב',
        type: 'radio',
      },
    ];

    const distinct = distinctLogicalChannels(rawChannels);
    expect(distinct).toHaveLength(2); // Only 2 TV channels, radio excluded, ch_11 backup merged
    expect(distinct[0].id).toBe('ch_11');
    expect(distinct[0].sources).toHaveLength(2);
    expect(() => JSON.stringify(distinct[0])).not.toThrow();
    expect(distinct[1].id).toBe('ch_12');
  });

  it('exposes alternate sources and preserves them when one is selected', () => {
    const [channel] = distinctLogicalChannels([
      {
        id: 'ch_11',
        name: 'כאן 11',
        channelNumber: '11',
        index: 1,
        type: 'tv',
        linkDetails: { link: 'https://primary.example/live.m3u8' },
      },
      {
        id: 'ch_11b',
        name: 'כאן 11 - גיבוי',
        channelNumber: '11',
        index: 1,
        type: 'tv',
        linkDetails: { link: 'https://backup.example/live.m3u8' },
      },
    ]);
    const item = {
      id: 'ch_11',
      kind: 'live' as const,
      title: 'חדשות',
      channelName: 'כאן 11',
      sourcePayload: channel,
    };

    expect(getLiveChannelSourceOptions(item)).toEqual([
      { id: 'ch_11', label: 'כאן 11', selected: true },
      { id: 'ch_11b', label: 'כאן 11 - גיבוי', selected: false },
    ]);

    const selected = selectLiveChannelSource(item, 'ch_11b');
    expect(selected?.sourcePayload).toEqual(
      expect.objectContaining({
        id: 'ch_11b',
        sources: expect.arrayContaining([
          expect.objectContaining({ id: 'ch_11' }),
          expect.objectContaining({ id: 'ch_11b' }),
        ]),
      }),
    );
    expect(getLiveChannelSourceOptions(selected!)).toEqual([
      { id: 'ch_11', label: 'כאן 11', selected: false },
      { id: 'ch_11b', label: 'כאן 11 - גיבוי', selected: true },
    ]);
  });

  it('does not merge unrelated channels that reuse the same backend index', () => {
    const distinct = distinctLogicalChannels([
      {
        id: 'ch_9',
        name: 'ערוץ 9',
        channelNumber: '9',
        index: 17,
        type: 'tv',
      },
      {
        id: 'ch_891',
        name: 'Первое Радио 89.1FM',
        index: 17,
        type: 'tv',
      },
    ]);

    expect(distinct).toHaveLength(1);
    expect(distinct[0]).toEqual(
      expect.objectContaining({
        id: 'ch_9',
        sources: [expect.objectContaining({ id: 'ch_9' })],
      }),
    );
  });

  it('keeps a named backup as a source when its channel number is missing', () => {
    const [channel] = distinctLogicalChannels([
      {
        id: 'ch_24',
        name: 'ערוץ 24',
        channelNumber: '24',
        index: 7,
        type: 'tv',
      },
      {
        id: 'ch_24b',
        name: 'ערוץ 24 - גיבוי',
        index: 7,
        type: 'tv',
      },
    ]);

    expect(channel.sources).toHaveLength(2);
  });

  it('formats program time range correctly', () => {
    // 2026-09-24T18:00:00Z to 2026-09-24T19:30:00Z
    const startMs = new Date('2026-09-24T18:00:00').getTime();
    const endMs = new Date('2026-09-24T19:30:00').getTime();
    const range = formatProgramTimeRange(startMs, endMs);
    expect(range).toBe('18:00 - 19:30');
  });

  it('calculates progress percentage accurately', () => {
    const startMs = 1000;
    const endMs = 2000;
    // Mock current time
    const spy = jest.spyOn(Date, 'now').mockReturnValue(1500);
    expect(calculateProgramProgress(startMs, endMs)).toBe(50);
    spy.mockRestore();
  });

  it('filters out channels without EPG when requireEpg is true', () => {
    const { toMediaItem } = require('../src/api/channels');
    const now = 1700000000000;
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(now);

    const channelWithEpg = {
      id: 'ch-1',
      name: 'Channel 1',
      programs: [
        {
          name: 'Morning News',
          start: now - 10000,
          end: now + 50000,
        },
      ],
    };

    const channelWithoutEpg = {
      id: 'ch-2',
      name: 'Channel 2',
      programs: [],
    };

    const itemWithEpg = toMediaItem(channelWithEpg, { requireEpg: true });
    const itemWithoutEpg = toMediaItem(channelWithoutEpg, { requireEpg: true });
    const itemWithoutEpgAllowed = toMediaItem(channelWithoutEpg, {
      requireEpg: false,
    });

    expect(itemWithEpg).toBeDefined();
    expect(itemWithEpg?.title).toBe('Morning News');
    expect(itemWithoutEpg).toBeUndefined();
    expect(itemWithoutEpgAllowed).toBeDefined();
    expect(itemWithoutEpgAllowed?.title).toBe('Channel 2');

    dateSpy.mockRestore();
  });

  it('uses server time for current EPG when the TV clock is stale', async () => {
    const deviceNow = Date.parse('2026-09-26T19:00:00Z');
    const serverNow = Date.parse('2026-09-28T19:00:00Z');
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(deviceNow);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'date'
            ? new Date(serverNow).toUTCString()
            : null,
      },
      json: async () => [
        {
          id: 'ch-1',
          name: 'Channel 1',
          type: 'tv',
          programs: [
            {
              name: 'Evening News',
              start: (serverNow - 30_000) / 1000,
              end: (serverNow + 30_000) / 1000,
            },
          ],
        },
      ],
    } as unknown as Response);

    await expect(
      getDistinctLiveChannels({ requireEpg: true }),
    ).resolves.toEqual([expect.objectContaining({ title: 'Evening News' })]);
    dateSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it('merges live channels updates while strictly preserving order', () => {
    const { mergeLiveChannelsPreservingOrder } = require('../src/api/channels');
    const existing = [
      {
        id: 'ch-12',
        kind: 'live',
        title: 'Old 12',
        timeRange: '10:00 - 11:00',
      },
      {
        id: 'ch-11',
        kind: 'live',
        title: 'Old 11',
        timeRange: '10:00 - 11:00',
      },
      {
        id: 'ch-13',
        kind: 'live',
        title: 'Old 13',
        timeRange: '10:00 - 11:00',
      },
    ];

    const fresh = [
      {
        id: 'ch-11',
        kind: 'live',
        title: 'New 11',
        timeRange: '11:00 - 12:00',
      },
      {
        id: 'ch-13',
        kind: 'live',
        title: 'New 13',
        timeRange: '11:00 - 12:00',
      },
      {
        id: 'ch-12',
        kind: 'live',
        title: 'New 12',
        timeRange: '11:00 - 12:00',
      },
    ];

    const merged = mergeLiveChannelsPreservingOrder(
      existing as any,
      fresh as any,
    );
    expect(merged.map((c: any) => c.id)).toEqual(['ch-12', 'ch-11', 'ch-13']);
    expect(merged[0].title).toBe('New 12');
    expect(merged[1].title).toBe('New 11');
    expect(merged[2].title).toBe('New 13');
  });
});
