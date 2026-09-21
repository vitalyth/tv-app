import {getLiveChannelCount} from '../src/api/channels';

describe('getLiveChannelCount', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns the number of channels from the real API shape', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [{id: 'ch_11'}, {id: 'ch_12'}],
    } as Response);
    await expect(getLiveChannelCount()).resolves.toBe(2);
  });

  it('rejects an unexpected API shape', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({channels: []}),
    } as Response);
    await expect(getLiveChannelCount()).rejects.toThrow('Unexpected live channels response');
  });
});
