import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { MediaSurface } from '../src/media/MediaSurface.kepler';

const mockListeners = new Map<string, Array<() => void>>();
const mockPlayer = {
  paused: false,
  initialize: jest.fn(async () => {}),
  setSurfaceHandle: jest.fn(),
  clearSurfaceHandle: jest.fn(),
  pause: jest.fn(),
  play: jest.fn(),
  deinitializeSync: jest.fn(() => 'success'),
  addEventListener: jest.fn((event: string, listener: () => void) => {
    mockListeners.set(event, [...(mockListeners.get(event) ?? []), listener]);
  }),
};
const mockLoad = jest.fn(async () => {});
jest.mock('@amazon-devices/react-native-w3cmedia/dist/headless', () => ({
  VideoPlayer: jest.fn(() => mockPlayer),
}), { virtual: true });
jest.mock('@amazon-devices/react-native-w3cmedia/dist/interface/Video', () => ({
  Video: 'NativeVideo',
}), { virtual: true });
jest.mock('@amazon-devices/react-native-w3cmedia/dist/interface/KeplerVideoSurfaceView', () => ({
  KeplerVideoSurfaceView: 'KeplerSurface',
}), { virtual: true });
jest.mock('../platforms/vega/src/media/vega/VegaShakaPlayer', () => ({
  VegaShakaPlayer: jest.fn(() => ({
    load: mockLoad,
    getQualities: () => [],
    selectQuality: jest.fn(),
    setPlaybackLimits: jest.fn(),
    destroy: jest.fn(async () => {}),
  })),
}));

it('reports native pause/play state, preserves the player across renders, and ignores teardown events', async () => {
  jest.useFakeTimers();
  const onPausedChange = jest.fn();
  const props = {
    streamUrl: 'https://example.com/live.m3u8', isLive: true,
    onFirstFrame: jest.fn(), onError: jest.fn(), onPausedChange,
  };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  try {
    await act(async () => { renderer = ReactTestRenderer.create(<MediaSurface {...props} />); });
    const surface = renderer.root.findByType('KeplerSurface' as any);
    await act(async () => { await surface.props.onSurfaceViewCreated('surface'); });
    const emit = (event: string) => mockListeners.get(event)?.forEach(listener => listener());
    expect(props.onFirstFrame).not.toHaveBeenCalled();
    await act(async () => { emit('loadeddata'); emit('canplay'); });
    expect(props.onFirstFrame).not.toHaveBeenCalled();
    mockPlayer.paused = true;
    await act(async () => { emit('pause'); });
    expect(onPausedChange).toHaveBeenLastCalledWith(true);
    mockPlayer.paused = false;
    await act(async () => { emit('playing'); });
    expect(props.onFirstFrame).toHaveBeenCalledTimes(1);
    expect(onPausedChange).toHaveBeenLastCalledWith(false);
    // Internal pipeline pauses during seek must not mark the media element as paused.
    await act(async () => { emit('pause'); });
    expect(onPausedChange).toHaveBeenLastCalledWith(false);
    const updatedCallback = jest.fn();
    await act(async () => {
      renderer.update(<MediaSurface {...props} onPausedChange={updatedCallback} paused />);
    });
    mockPlayer.paused = true;
    await act(async () => { emit('pause'); });
    expect(updatedCallback).toHaveBeenLastCalledWith(true);
    expect(mockLoad).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByType('KeplerSurface' as any)).toBe(surface);
    await act(async () => { renderer.unmount(); });
    updatedCallback.mockClear();
    emit('pause');
    emit('playing');
    expect(updatedCallback).not.toHaveBeenCalled();
    expect(props.onFirstFrame).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});

it('mutes independent Vega players without reloading either stream and preserves the surviving global media reference', async () => {
  jest.useFakeTimers();
  const { VideoPlayer } = require('@amazon-devices/react-native-w3cmedia/dist/headless');
  const first = { ...mockPlayer, muted: false };
  const second = { ...mockPlayer, muted: false };
  VideoPlayer.mockImplementationOnce(() => first).mockImplementationOnce(() => second);
  const props = { isLive: true, onFirstFrame: jest.fn(), onError: jest.fn() };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  const render = (audio: number, secondary = true) => <>
    <MediaSurface {...props} streamUrl="https://example.com/first.m3u8" isMuted={audio !== 0} maxVideoHeight={720} />
    {secondary ? <MediaSurface {...props} streamUrl="https://example.com/second.m3u8" isMuted={audio !== 1} maxVideoHeight={720} /> : null}
  </>;
  try {
    await act(async () => { renderer = ReactTestRenderer.create(render(0)); await jest.advanceTimersByTimeAsync(3000); });
    const nodes = renderer.root.findAllByType('KeplerSurface' as any);
    await act(async () => { await nodes[0].props.onSurfaceViewCreated('first'); await nodes[1].props.onSurfaceViewCreated('second'); });
    expect([first.muted, second.muted]).toEqual([false, true]);
    const loads = mockLoad.mock.calls.length;
    await act(async () => renderer.update(render(1)));
    expect([first.muted, second.muted]).toEqual([true, false]);
    expect(mockLoad).toHaveBeenCalledTimes(loads);
    (globalThis as any).gmedia = first;
    await act(async () => renderer.update(render(0, false)));
    expect(first.muted).toBe(false);
    expect((globalThis as any).gmedia).toBe(first);
  } finally {
    await act(async () => renderer.unmount());
    jest.useRealTimers();
  }
});

it('reattaches recreated tile surfaces without destroying or reconnecting the player', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(Date.now() + 60000);
  const props = { streamUrl: 'https://example.com/resize.m3u8', isLive: true, onFirstFrame: jest.fn(), onError: jest.fn() };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  try {
    await act(async () => {
      renderer = ReactTestRenderer.create(<MediaSurface {...props} />);
      await jest.advanceTimersByTimeAsync(3000);
    });
    const surface = renderer.root.findByType('KeplerSurface' as any);
    await act(async () => surface.props.onSurfaceViewCreated('full'));
    const loads = mockLoad.mock.calls.length;
    const initializations = mockPlayer.initialize.mock.calls.length;
    const deinitializations = mockPlayer.deinitializeSync.mock.calls.length;
    const pauses = mockPlayer.pause.mock.calls.length;
    await act(async () => surface.props.onSurfaceViewDestroyed('full'));
    expect(mockPlayer.clearSurfaceHandle).toHaveBeenLastCalledWith('full');
    await act(async () => surface.props.onSurfaceViewCreated('tile'));
    expect(mockPlayer.setSurfaceHandle).toHaveBeenLastCalledWith('tile');
    const clears = mockPlayer.clearSurfaceHandle.mock.calls.length;
    await act(async () => surface.props.onSurfaceViewDestroyed('full'));
    expect(mockPlayer.clearSurfaceHandle).toHaveBeenCalledTimes(clears);
    expect(mockLoad).toHaveBeenCalledTimes(loads);
    expect(mockPlayer.initialize).toHaveBeenCalledTimes(initializations);
    expect(mockPlayer.deinitializeSync).toHaveBeenCalledTimes(deinitializations);
    expect(mockPlayer.pause).toHaveBeenCalledTimes(pauses);
    await act(async () => renderer.unmount());
    expect(mockPlayer.clearSurfaceHandle).toHaveBeenLastCalledWith('tile');
    expect(mockPlayer.deinitializeSync).toHaveBeenCalledTimes(deinitializations + 1);
  } finally {
    jest.useRealTimers();
  }
});

it('recreates only the newly focused Vega tile after focus settles and releases it before replacement', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2040-01-01T00:00:00Z'));
  const props = { isLive: true, onFirstFrame: jest.fn(), onError: jest.fn() };
  const render = (audio: number, enabled = true) => <>
    {[0, 1, 2].map(index => <MediaSurface
      key={index} {...props} streamUrl={`https://example.com/tile-${index}.m3u8`}
      isMuted={audio !== index} recoverVideoOnFocus={enabled}
    />)}
  </>;
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  try {
    await act(async () => { renderer = ReactTestRenderer.create(render(2)); });
    await act(async () => { await jest.advanceTimersByTimeAsync(3000); });
    const before = renderer.root.findAllByType('KeplerSurface' as any);
    expect(before).toHaveLength(3);
    await act(async () => {
      for (let index = 0; index < before.length; index++) {
        await before[index].props.onSurfaceViewCreated(`tile-${index}`);
      }
    });
    const loads = mockLoad.mock.calls.length;
    const releases = mockPlayer.deinitializeSync.mock.calls.length;
    await act(async () => { renderer.update(render(0)); });
    await act(async () => { await jest.advanceTimersByTimeAsync(649); });
    expect(renderer.root.findAllByType('KeplerSurface' as any)).toEqual(before);
    await act(async () => { await jest.advanceTimersByTimeAsync(1); });
    expect(mockPlayer.deinitializeSync).toHaveBeenCalledTimes(releases + 1);
    expect(renderer.root.findAllByType('KeplerSurface' as any)).toEqual(before.slice(1));
    await act(async () => { await jest.advanceTimersByTimeAsync(701); });
    const after = renderer.root.findAllByType('KeplerSurface' as any);
    expect(after[0]).not.toBe(before[0]);
    expect(after.slice(1)).toEqual(before.slice(1));
    await act(async () => { await after[0].props.onSurfaceViewCreated('recovered-0'); });
    expect(mockLoad).toHaveBeenCalledTimes(loads + 1);
    await act(async () => { renderer.update(render(0, false)); await jest.advanceTimersByTimeAsync(2000); });
    expect(renderer.root.findAllByType('KeplerSurface' as any)).toEqual(after);
    expect(mockLoad).toHaveBeenCalledTimes(loads + 1);
  } finally {
    await act(async () => { renderer.unmount(); });
    jest.useRealTimers();
  }
});

it('cancels focus recovery when browsing away quickly or leaving multiview', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2041-01-01T00:00:00Z'));
  const props = { streamUrl: 'https://example.com/focus.m3u8', isLive: true, onFirstFrame: jest.fn(), onError: jest.fn() };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  try {
    await act(async () => { renderer = ReactTestRenderer.create(<MediaSurface {...props} isMuted recoverVideoOnFocus />); });
    await act(async () => { await jest.advanceTimersByTimeAsync(10000); });
    const before = renderer.root.findByType('KeplerSurface' as any);
    await act(async () => { renderer.update(<MediaSurface {...props} recoverVideoOnFocus />); });
    await act(async () => { await jest.advanceTimersByTimeAsync(400); });
    await act(async () => { renderer.update(<MediaSurface {...props} isMuted recoverVideoOnFocus />); });
    await act(async () => { await jest.advanceTimersByTimeAsync(1000); });
    expect(renderer.root.findByType('KeplerSurface' as any)).toBe(before);
    await act(async () => { renderer.update(<MediaSurface {...props} recoverVideoOnFocus />); });
    await act(async () => { renderer.update(<MediaSurface {...props} />); });
    await act(async () => { await jest.advanceTimersByTimeAsync(2000); });
    expect(renderer.root.findByType('KeplerSurface' as any)).toBe(before);
  } finally {
    await act(async () => { renderer.unmount(); });
    jest.useRealTimers();
  }
});
