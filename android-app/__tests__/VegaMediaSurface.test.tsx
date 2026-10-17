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
