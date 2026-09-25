import {
  distinctLogicalChannels,
  formatProgramTimeRange,
  calculateProgramProgress,
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
});

