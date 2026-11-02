import React from 'react';
import Renderer, {act} from 'react-test-renderer';
import {AppState, type AppStateStatus} from 'react-native';
import {RecoveringMediaSurface} from '../src/media/RecoveringMediaSurface';
import {resolveLiveChannelStream} from '../src/api/channels';
import {resolveVodStream} from '../src/api/vod';
import type {MediaItem} from '../src/media/player';

const mockSeek = jest.fn();
jest.mock('../src/media/MediaSurface', () => ({
  MediaSurface: (props: any) => {
    const ReactModule = require('react');
    ReactModule.useEffect(() => props.registerSeekHandler(mockSeek), [props.registerSeekHandler]);
    return ReactModule.createElement('VideoSurface', props);
  },
}));
jest.mock('../src/api/channels', () => ({
  resolveLiveChannelStream: jest.fn(),
  selectLiveChannelSource: jest.fn(item => item),
}));
jest.mock('../src/api/vod', () => ({resolveVodStream: jest.fn()}));

describe('playback recovery', () => {
  let renderer: Renderer.ReactTestRenderer;
  let onError: jest.Mock;
  let appState: (state: AppStateStatus) => void;
  const stream = {url: 'https://example.com/stream.m3u8', sourceId: 'primary'};
  const live: MediaItem = {id: 'live', kind: 'live', title: 'Live'};
  const vod: MediaItem = {id: 'vod', kind: 'vod', title: 'Episode', resumePositionMs: 120000};
  const liveResolver = jest.mocked(resolveLiveChannelStream);
  const vodResolver = jest.mocked(resolveVodStream);
  const surface = () => renderer.root.findByType('VideoSurface' as any);
  const advance = async (ms: number) => {
    await act(async () => { jest.advanceTimersByTime(ms); });
  };
  const progress = (time: number, duration = 600) => act(() => {
    surface().props.onProgress({currentTime: time, seekableDuration: duration, seekableStart: 0, seekableEnd: duration});
  });
  const mount = (item = live, extra = {}) => act(() => {
    renderer = Renderer.create(<RecoveringMediaSurface item={item} stream={stream}
      onFirstFrame={jest.fn()} onError={onError} {...extra} />);
  });

  beforeEach(() => {
    jest.useFakeTimers();
    mockSeek.mockClear();
    onError = jest.fn();
    liveResolver.mockReset().mockResolvedValue(stream);
    vodResolver.mockReset().mockResolvedValue(stream);
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, callback) => {
      appState = callback;
      return {remove: jest.fn()};
    });
  });
  afterEach(() => {
    act(() => renderer?.unmount());
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('detects a frozen position even when progress events continue', async () => {
    mount();
    progress(100); progress(101);
    const original = surface();
    for (let i = 0; i < 4; i++) { await advance(1000); progress(101); }
    expect(liveResolver).not.toHaveBeenCalled();
    expect(mockSeek).toHaveBeenCalled();
    await advance(2001);
    expect(liveResolver).toHaveBeenCalledTimes(1);
    expect(liveResolver).toHaveBeenCalledWith(live, {useSavedSource: false});
    // A fresh decoder is required even when renewal returns the identical URL.
    expect(surface()).not.toBe(original);
    expect(onError).not.toHaveBeenCalled();
  });

  it('recovers initial loading with no progress callbacks', async () => {
    mount();
    await advance(10000);
    expect(liveResolver).not.toHaveBeenCalled();
    await advance(1);
    expect(liveResolver).toHaveBeenCalledTimes(1);
  });

  it('returns live recovery to the live edge and verifies the seek lands', async () => {
    mount();
    progress(100, 300); progress(101, 300);
    expect(mockSeek).not.toHaveBeenCalled(); // Intentional timeshift is allowed.
    act(() => surface().props.onError());
    await advance(0);
    progress(100, 300);
    expect(mockSeek).toHaveBeenLastCalledWith(297);
    progress(297, 300); progress(298, 300);
    await advance(2000);
    progress(299, 301);
    expect(mockSeek).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('resumes VOD at the latest watched position instead of its original bookmark', async () => {
    vodResolver.mockResolvedValue({url: 'https://example.com/fresh-vod.m3u8'});
    const onProgress = jest.fn();
    mount(vod, {startPositionSeconds: 120, onProgress});
    progress(350); progress(351);
    act(() => surface().props.onError());
    await advance(0);
    expect(vodResolver).toHaveBeenCalledWith(vod);
    expect(surface().props.startPositionSeconds).toBe(351);
    expect(surface().props.streamUrl).toContain('fresh-vod');
    onProgress.mockClear();
    progress(0);
    expect(onProgress).not.toHaveBeenCalled();
    progress(351); progress(352);
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it('does not restart healthy progress just because a buffer notification is stale', async () => {
    mount();
    act(() => surface().props.onBuffer(true));
    for (let i = 0; i < 15; i++) { progress(i); await advance(1000); }
    expect(liveResolver).not.toHaveBeenCalled();
  });

  it('tries a live-edge seek after two seconds of confirmed empty-buffer stoppage before reloading', async () => {
    mount();
    progress(100); progress(101);
    act(() => {
      surface().props.onProgress({currentTime: 101, playableDuration: 101, seekableEnd: 300});
      surface().props.onPlaybackStateChanged({isPlaying: false, isSeeking: false});
      surface().props.onBuffer(true);
    });
    const original = surface();
    await advance(1999);
    expect(mockSeek).not.toHaveBeenCalled();
    await advance(1);
    expect(mockSeek).toHaveBeenLastCalledWith(297);
    expect(liveResolver).not.toHaveBeenCalled();
    act(() => surface().props.onBuffer(false));
    progress(297, 300); progress(298, 300);
    await advance(3000);
    expect(liveResolver).not.toHaveBeenCalled();
    expect(surface()).toBe(original);
  });

  it('renews the URL promptly if the quick local seek cannot recover playback', async () => {
    mount(vod);
    progress(100); progress(101);
    act(() => {
      surface().props.onProgress({currentTime: 101, playableDuration: 101});
      surface().props.onPlaybackStateChanged({isPlaying: false, isSeeking: false});
      surface().props.onBuffer(true);
    });
    await advance(2000);
    expect(mockSeek).toHaveBeenLastCalledWith(101);
    expect(vodResolver).not.toHaveBeenCalled();
    await advance(2001);
    expect(vodResolver).toHaveBeenCalledTimes(1);
    expect(surface().props.startPositionSeconds).toBe(101);
  });

  it('gives active startup buffering time to finish and ignores a brief rebuffer', async () => {
    mount();
    act(() => surface().props.onBuffer(true));
    for (let i = 0; i < 12; i++) {
      act(() => surface().props.onProgress({currentTime: 0, playableDuration: i + 1}));
      await advance(1000);
    }
    expect(liveResolver).not.toHaveBeenCalled();
    progress(1); progress(2);
    await advance(1500);
    progress(3);
    act(() => surface().props.onBuffer(false));
    expect(mockSeek).not.toHaveBeenCalled();
    expect(liveResolver).not.toHaveBeenCalled();
  });

  it('does not confuse seeking with a stopped player and clears the seek grace when playing resumes', async () => {
    mount(vod);
    progress(100); progress(101);
    act(() => surface().props.onPlaybackStateChanged({isPlaying: false, isSeeking: true}));
    await advance(4000);
    expect(mockSeek).not.toHaveBeenCalled();
    act(() => surface().props.onPlaybackStateChanged({isPlaying: true, isSeeking: true}));
    progress(200); progress(201);
    await advance(4000);
    expect(mockSeek).toHaveBeenLastCalledWith(201);
  });

  it('does not recover user-paused playback or completed VOD', async () => {
    mount(vod, {paused: true});
    act(() => surface().props.onError());
    await advance(90000);
    expect(vodResolver).not.toHaveBeenCalled();
    act(() => renderer.update(<RecoveringMediaSurface item={vod} stream={stream}
      onFirstFrame={jest.fn()} onError={onError} />));
    progress(600);
    act(() => surface().props.onEnd());
    await advance(90000);
    expect(vodResolver).not.toHaveBeenCalled();
  });

  it('limits retries and backs off when stream renewal keeps failing', async () => {
    liveResolver.mockRejectedValue(new Error('offline'));
    mount();
    act(() => surface().props.onError());
    for (const delay of [0, 1000, 3000, 7000, 15000]) await advance(delay);
    expect(liveResolver).toHaveBeenCalledTimes(5);
    expect(onError).toHaveBeenCalledTimes(1);
    await advance(120000);
    expect(liveResolver).toHaveBeenCalledTimes(5);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('also limits repeated decoder failures when URL renewal succeeds', async () => {
    mount();
    for (const delay of [0, 1000, 3000, 7000, 15000]) {
      act(() => surface().props.onError());
      await advance(delay);
    }
    act(() => surface().props.onError());
    await advance(60000);
    expect(liveResolver).toHaveBeenCalledTimes(5);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending retry immediately when the user pauses', async () => {
    mount();
    act(() => surface().props.onError());
    act(() => renderer.update(<RecoveringMediaSurface item={live} stream={stream}
      paused onFirstFrame={jest.fn()} onError={onError} />));
    await advance(60000);
    expect(liveResolver).not.toHaveBeenCalled();
    expect(renderer.root.findAll(node => node.props.children === 'Reconnecting…')).toHaveLength(0);
  });

  it('rearms the retry budget after sustained playback', async () => {
    mount();
    act(() => surface().props.onError());
    await advance(0);
    for (let i = 0; i <= 32; i++) { progress(297 + i, 300 + i); await advance(1000); }
    act(() => surface().props.onError());
    await advance(0);
    expect(liveResolver).toHaveBeenCalledTimes(2); // Starts again at the first delay.
    expect(onError).not.toHaveBeenCalled();
  });

  it('times out a hung renewal before retrying', async () => {
    liveResolver.mockReturnValueOnce(new Promise(() => {}));
    mount();
    act(() => surface().props.onError());
    await advance(0); await advance(15000); await advance(1000);
    expect(liveResolver).toHaveBeenCalledTimes(2);
  });

  it.each(['background', 'unmount', 'channel change'])('ignores a late renewal after %s', async reason => {
    let resolve!: (value: typeof stream) => void;
    liveResolver.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    mount();
    act(() => surface().props.onError());
    await advance(0);
    act(() => {
      if (reason === 'background') appState('background');
      if (reason === 'unmount') renderer.unmount();
      if (reason === 'channel change') renderer.update(<RecoveringMediaSurface
        item={{...live, id: 'another'}} stream={stream} onFirstFrame={jest.fn()} onError={onError} />);
    });
    await act(async () => { resolve({...stream, url: 'https://example.com/stale.m3u8'}); });
    if (reason !== 'unmount') expect(surface().props.streamUrl).toBe(stream.url);
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not retry after a brief stall resolves during backoff', async () => {
    mount();
    progress(1); progress(2);
    act(() => surface().props.onError());
    progress(3);
    await advance(0);
    expect(liveResolver).not.toHaveBeenCalled();
  });
});
