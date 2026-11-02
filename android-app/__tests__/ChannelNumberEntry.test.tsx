import React from 'react';
import Renderer, {act} from 'react-test-renderer';
import {AppState, BackHandler, TextInput, type AppStateStatus, type HWEvent} from 'react-native';
import {ChannelNumberEntry} from '../src/components/ChannelNumberEntry';
import {getPlayableLiveChannels} from '../src/api/channels';
import type {MediaItem} from '../src/media/player';
import {t} from '../src/i18n';

let mockRemote: (event: HWEvent) => void;
jest.mock('react-native', () => {
  const native = jest.requireActual('react-native');
  return Object.defineProperty(native, 'useTVEventHandler', {
    value: (handler: typeof mockRemote) => { mockRemote = handler; },
  });
});
jest.mock('../src/api/channels', () => ({getPlayableLiveChannels: jest.fn()}));

const sport5: MediaItem = {
  id: 'ch_sport5', kind: 'live', title: 'ספורט 5', channelNumber: '55',
};

describe('remote channel number entry', () => {
  let renderer: Renderer.ReactTestRenderer;
  let onTune: jest.Mock;
  let background: (state: AppStateStatus) => void;
  let back: (() => boolean) | undefined;
  const load = jest.mocked(getPlayableLiveChannels);
  const press = (eventType: string, eventKeyAction?: number) =>
    act(() => mockRemote({eventType, eventKeyAction}));
  const advance = async (ms: number) => {
    await act(async () => { jest.advanceTimersByTime(ms); });
  };
  const text = () => JSON.stringify(renderer.toJSON());

  beforeEach(() => {
    jest.useFakeTimers();
    onTune = jest.fn();
    back = undefined;
    load.mockReset().mockResolvedValue([sport5]);
    // RN types omit null even though an unfocused text input returns null.
    jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockReturnValue(null!);
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, callback) => {
      background = callback;
      return {remove: jest.fn()};
    });
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_, callback) => {
      back = callback as () => boolean;
      return {remove: jest.fn()};
    });
    act(() => { renderer = Renderer.create(<ChannelNumberEntry onTune={onTune} />); });
  });
  afterEach(() => {
    act(() => renderer.unmount());
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('waits for the last digit and tunes the canonical channel without requiring EPG', async () => {
    press('5', 0);
    press('5', 1);
    await advance(1000);
    expect(onTune).not.toHaveBeenCalled();
    press('5', 0);
    press('5', 1);
    expect(text()).toContain('55');
    await advance(1499);
    expect(load).not.toHaveBeenCalled();
    await advance(1);
    expect(onTune).toHaveBeenCalledWith(sport5);
    expect(renderer.toJSON()).toBeNull();
  });

  it('ignores key-up and held-key repeats while accepting repeated digits after release', async () => {
    load.mockResolvedValue([{...sport5, channelNumber: '5'}]);
    press('5', 0);
    press('5', 0);
    press('5', 1);
    await advance(1500);
    expect(onTune).toHaveBeenCalledTimes(1);
  });

  it('keeps the current channel when the dialed number is missing', async () => {
    press('9');
    await advance(1500);
    expect(onTune).not.toHaveBeenCalled();
    expect(text()).toContain(t('channelNumberNotFound'));
    await advance(2500);
    expect(renderer.toJSON()).toBeNull();
  });

  it.each(['0055', '9999'])('supports four-digit entry %s', async number => {
    const channel = {...sport5, channelNumber: String(Number(number))};
    load.mockResolvedValue([channel]);
    for (const digit of number) press(digit);
    await advance(1500);
    expect(onTune).toHaveBeenCalledWith(channel);
  });

  it('cancels the delay with Back before loading any channel', async () => {
    press('5');
    act(() => { expect(back?.()).toBe(true); });
    await advance(3000);
    expect(load).not.toHaveBeenCalled();
    expect(onTune).not.toHaveBeenCalled();
    expect(renderer.toJSON()).toBeNull();
  });

  it('reports a failed channel fetch and allows another attempt', async () => {
    load.mockRejectedValueOnce(new Error('offline'));
    press('5');
    await advance(1500);
    expect(text()).toContain(t('playerChannelUnavailable'));
    press('5');
    press('5');
    await advance(1500);
    expect(onTune).toHaveBeenCalledWith(sport5);
  });

  it('cancels an older lookup when another number is entered', async () => {
    let resolve!: (items: MediaItem[]) => void;
    load.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    press('5');
    await advance(1500);
    press('5');
    press('5');
    await act(async () => { resolve([{...sport5, channelNumber: '5'}]); });
    expect(onTune).not.toHaveBeenCalled();
    await advance(1500);
    expect(onTune).toHaveBeenCalledTimes(1);
    expect(onTune).toHaveBeenCalledWith(sport5);
  });

  it('leaves numeric text input to the search field', async () => {
    jest.mocked(TextInput.State.currentlyFocusedInput).mockReturnValue({} as TextInput);
    press('5');
    await advance(2000);
    expect(load).not.toHaveBeenCalled();
    expect(renderer.toJSON()).toBeNull();
  });

  it.each(['back', 'navigation', 'background', 'unmount'])('cancels pending tuning on %s', async action => {
    let resolve!: (items: MediaItem[]) => void;
    load.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    press('5');
    press('5');
    await advance(1500);
    act(() => {
      if (action === 'back') expect(back?.()).toBe(true);
      if (action === 'navigation') mockRemote({eventType: 'right', eventKeyAction: 0});
      if (action === 'background') background('background');
      if (action === 'unmount') renderer.unmount();
    });
    await act(async () => { resolve([sport5]); });
    await advance(3000);
    expect(onTune).not.toHaveBeenCalled();
  });
});
