import { liveEpgStore } from '../src/state/liveEpg';
import {
  fillGuideGaps,
  getProgramGuide,
  GUIDE_SLOT_MS,
  guideStart,
  normalizePrograms,
  programAt,
  guideMediaItem,
} from '../src/api/programGuide';
import { getPlayableLiveChannels } from '../src/api/channels';
import { getJson } from '../src/api/client';

jest.mock('../src/api/client', () => ({ getJson: jest.fn() }));
jest.mock('../src/api/channels', () => ({
  ...jest.requireActual('../src/api/channels'),
  getPlayableLiveChannels: jest.fn(),
}));
const channel = {
  id: 'kan',
  kind: 'live' as const,
  title: 'Kan',
  channelNumber: '11',
  channelName: 'Kan',
  sourcePayload: {
    programs: [{ start: 1800000000, end: 1800003600, name: 'Inline' }],
  },
};

describe('program guide data and geometry', () => {
  test('uses a 12-hour half-hour aligned window with one hour lookback', async () => {
    jest.mocked(getPlayableLiveChannels).mockResolvedValue([channel]);
    jest.mocked(getJson).mockResolvedValue({
      '11': [{ start: 1800000000, end: 1800003600, name: 'EPG' }],
    });
    const result = await getProgramGuide(1800000100000);
    expect(result.start % GUIDE_SLOT_MS).toBe(0);
    expect(result.start).toBe(guideStart(1800000100000));
    expect(result.end - result.start).toBe(12 * 3600000);
    expect(result.programs.kan[0].title).toBe('EPG');
    expect(getJson).toHaveBeenCalledWith(
      `/epg?start=${result.start / 1000}&end=${result.end / 1000}`,
    );
  });
  test('keeps inline programs on EPG failure and channels without a schedule', async () => {
    jest
      .mocked(getPlayableLiveChannels)
      .mockResolvedValue([
        channel,
        { id: 'empty', title: 'Empty', kind: 'live' },
      ]);
    jest.mocked(getJson).mockRejectedValueOnce(new Error('offline'));
    const result = await getProgramGuide();
    expect(result.channels).toHaveLength(2);
    expect(result.programs.kan[0].title).toBe('Inline');
    expect(result.programs.empty).toEqual([]);
  });
  test('normalizes seconds/milliseconds, sorts and discards invalid ranges', () => {
    expect(
      normalizePrograms([
        null,
        { start: 'bad', end: 5 },
        { start: 4, end: 2 },
        { start: 1800000000000, end: 1800003600000, title: 'Valid' },
      ]),
    ).toEqual([
      expect.objectContaining({ start: 1800000000000, title: 'Valid' }),
    ]);
  });
  test('fills gaps and clips overlaps without changing total timeline coverage', () => {
    const rows = fillGuideGaps(
      [
        { id: 'a', title: 'A', start: -1, end: 900000 },
        { id: 'b', title: 'B', start: 600000, end: 1800000 },
        { id: 'c', title: 'C', start: 2700000, end: 5000000 },
      ],
      0,
      3600000,
    );
    expect(rows[0].start).toBe(0);
    expect(rows.at(-1)?.end).toBe(3600000);
    expect(rows.reduce((sum, p) => sum + p.end - p.start, 0)).toBe(3600000);
    expect(rows.find(p => p.placeholder)).toBeDefined();
    rows.slice(1).forEach((p, i) => expect(p.start).toBe(rows[i].end));
    expect(programAt(rows, 1800000)).toBe(2);
  });
  test('maps artwork/metadata but retains original live source payload', () => {
    const program = {
      id: 'p',
      title: 'News',
      start: 1800000000000,
      end: 1800003600000,
    };
    expect(guideMediaItem(channel, program, program.start + 10)).toMatchObject({
      id: channel.id,
      title: 'News',
      isLive: true,
      sourcePayload: channel.sourcePayload,
    });
    expect(guideMediaItem(channel, program, program.end + 10)).toMatchObject({
      id: `guide:kan:p`,
      isLive: false,
    });
  });
});

test('links tvgID schedules and publishes them for the whole app', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(1800000100000);
  jest.mocked(getPlayableLiveChannels).mockResolvedValue([
    {
      ...channel,
      sourcePayload: { ...channel.sourcePayload, tvgID: 'sport5_max' },
    },
  ]);
  jest
    .mocked(getJson)
    .mockResolvedValue({
      sport5_max: [{ start: 1800000000, end: 1800003600, name: 'Sport event' }],
    });
  const result = await getProgramGuide();
  expect(result.channels[0].title).toBe('Sport event');
  expect(liveEpgStore.getSnapshot().channels[0].title).toBe('Sport event');
  expect((result.channels[0].sourcePayload as any).programs[0].name).toBe(
    'Sport event',
  );
  jest.useRealTimers();
});
