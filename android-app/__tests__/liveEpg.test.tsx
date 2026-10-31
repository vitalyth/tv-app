import React from 'react';
import {AppState, type AppStateStatus} from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { createLiveEpgStore, liveEpgStore } from '../src/state/liveEpg';
import { startLiveEpgSync } from '../src/services/liveEpgSync';
import { getProgramGuide } from '../src/api/programGuide';
import {
  MediaControllerProvider,
  useMediaController,
  type MediaControllerValue,
} from '../src/media/MediaController';
import type { MediaItem } from '../src/media/player';
jest.mock('../src/api/programGuide', () => ({ getProgramGuide: jest.fn() }));
const now = 1800000000000;
const channel: MediaItem = {
  id: 'sport5',
  kind: 'live',
  isLive: true,
  title: 'First',
  channelName: 'Sport 5',
  sourcePayload: {
    id: 'primary',
    name: 'Sport 5',
    programs: [
      { start: now - 60000, end: now + 5000, name: 'First' },
      { start: now + 5000, end: now + 120000, name: 'Second' },
    ],
  },
};
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(now);
  liveEpgStore.publish([]);
  jest
    .mocked(getProgramGuide)
    .mockResolvedValue({ channels: [], programs: {}, start: now, end: now });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('retains the selected source and historical/VOD selections when resolving shared metadata', () => {
  const store = createLiveEpgStore();
  const selected = {
    ...channel,
    sourcePayload: {
      id: 'backup',
      linkDetails: { link: 'selected' },
      programs: [],
    },
  };
  const fresh = { ...channel, title: 'Second', timeRange: '12:00–13:00' };
  store.publish([fresh]);
  const result = store.resolve(selected);
  expect(result.title).toBe('Second');
  expect(result.sourcePayload).toMatchObject({
    id: 'backup',
    linkDetails: { link: 'selected' },
    programs: (fresh.sourcePayload as any).programs,
  });
  expect(store.resolve(result)).toBe(result);
  const historical = { ...selected, isLive: false };
  expect(store.resolve(historical)).toBe(historical);
  const vod = { ...selected, kind: 'vod' as const };
  expect(store.resolve(vod)).toBe(vod);
});

test('newly loaded schedules update at the boundary, clear expired metadata and stop after cleanup', async () => {
  const stop = startLiveEpgSync();
  await act(async () => {});
  liveEpgStore.publish([channel]);
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(liveEpgStore.getSnapshot().channels[0].title).toBe('Second');
  await act(async () => {
    jest.advanceTimersByTime(115000);
  });
  expect(liveEpgStore.getSnapshot().channels[0]).toMatchObject({
    title: 'Sport 5',
    timeRange: undefined,
  });
  stop();
  const revision = liveEpgStore.getSnapshot().revision;
  jest.advanceTimersByTime(60000);
  expect(liveEpgStore.getSnapshot().revision).toBe(revision);
});

test('updates playback metadata without changing the stream, selected source, pause or quality', () => {
  let controller!: MediaControllerValue;
  function Probe() {
    controller = useMediaController();
    return null;
  }
  let renderer!: Renderer.ReactTestRenderer;
  act(() => {
    renderer = Renderer.create(
      <MediaControllerProvider>
        <Probe />
      </MediaControllerProvider>,
    );
  });
  const selected = {
    ...channel,
    sourcePayload: { ...(channel.sourcePayload as object), id: 'backup' },
  };
  const stream = { url: 'https://example.com/live.m3u8', sourceId: 'backup' };
  act(() => {
    controller.playFullscreen(selected, stream);
    controller.markPlaying();
  });
  act(() => {
    controller.enterMultiView();
  });
  const second = {...channel, id: 'second', channelName: 'Another channel', sourcePayload: {...channel.sourcePayload as object, id: 'second'}};
  const secondStream = { url: 'https://example.com/second.m3u8' };
  act(() => {
    controller.setMultiViewChannel(second, secondStream);
  });
  act(() => {
    controller.setPaused(true);
    controller.setSelectedQuality('720');
  });
  act(() => {
    liveEpgStore.publish([
      { ...channel, title: 'Updated' },
      { ...second, title: 'Updated second' },
    ]);
  });
  expect(controller.item?.title).toBe('Updated');
  expect(controller.item?.sourcePayload).toMatchObject({ id: 'backup' });
  expect(controller.stream).toBe(stream);
  expect(controller.multiView?.tiles[0].item.title).toBe('Updated second');
  expect(controller.multiView?.tiles[0].stream).toBe(secondStream);
  expect(controller.paused).toBe(true);
  expect(controller.selectedQualityId).toBe('720');
  act(() => {
    renderer.unmount();
  });
});

 test('catches up immediately on foreground and removes its lifecycle listener', async () => {
  let onChange!: (state: AppStateStatus) => void;
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    onChange = callback;
    return {remove};
  });
  const stop = startLiveEpgSync();
  await act(async () => {});
  liveEpgStore.publish([channel]);
  onChange('background');
  jest.setSystemTime(now + 10000);
  await act(async () => {onChange('active');});
  expect(liveEpgStore.getSnapshot().channels[0].title).toBe('Second');
  stop();
  expect(remove).toHaveBeenCalled();
});
