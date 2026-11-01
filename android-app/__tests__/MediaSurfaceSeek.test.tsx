import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { MediaSurface } from '../src/media/MediaSurface.android';
import type { MediaSurfaceProps } from '../src/media/MediaSurface.types';

const mockSeek = jest.fn();
jest.mock('react-native-video', () => {
  const ReactModule = require('react');
  return {
    __esModule: true,
    default: ReactModule.forwardRef((props: any, ref: any) => {
      ReactModule.useImperativeHandle(ref, () => ({ seek: mockSeek }));
      return ReactModule.createElement('Video', props);
    }),
    SelectedVideoTrackType: { AUTO: 'auto', RESOLUTION: 'resolution' },
  };
});

it('seeks Android playback without remounting or changing pause state and unregisters on exit', () => {
  let seek!: (seconds: number) => void;
  const release = jest.fn();
  const registerSeekHandler: MediaSurfaceProps['registerSeekHandler'] =
    handler => {
      seek = handler;
      return release;
    };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <MediaSurface
        streamUrl="https://example.com/vod.m3u8"
        paused
        registerSeekHandler={registerSeekHandler}
        onFirstFrame={jest.fn()}
        onError={jest.fn()}
      />,
    );
  });
  const video = renderer.root.findByType('Video' as any);
  act(() => seek(130));
  expect(mockSeek).toHaveBeenCalledWith(130);
  expect(renderer.root.findByType('Video' as any)).toBe(video);
  expect(video.props.paused).toBe(true);
  act(() => renderer.unmount());
  expect(release).toHaveBeenCalledTimes(1);
});

it('uses only a finite Android live window and stays behind its live edge', () => {
  mockSeek.mockClear();
  let seek!: (seconds: number) => void;
  const onProgress = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <MediaSurface
        streamUrl="https://example.com/live.m3u8"
        isLive
        registerSeekHandler={handler => { seek = handler; return jest.fn(); }}
        onProgress={onProgress}
        onFirstFrame={jest.fn()}
        onError={jest.fn()}
      />,
    );
  });
  const video = renderer.root.findByType('Video' as any);
  act(() => seek(200));
  expect(mockSeek).not.toHaveBeenCalled();
  act(() => video.props.onProgress({ currentTime: 190, playableDuration: 200, seekableDuration: 200 }));
  act(() => seek(200));
  expect(mockSeek).toHaveBeenLastCalledWith(197);
  act(() => seek(130));
  expect(mockSeek).toHaveBeenLastCalledWith(130);
  for (const seekableDuration of [0, -1, Infinity, NaN]) {
    mockSeek.mockClear();
    act(() => video.props.onProgress({ currentTime: 190, playableDuration: 200, seekableDuration }));
    act(() => seek(150));
    expect(mockSeek).not.toHaveBeenCalled();
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({ seekableStart: undefined, seekableEnd: undefined }));
  }
  expect(renderer.root.findByType('Video' as any)).toBe(video);
  act(() => renderer.unmount());
});

it('caps Android Multi View quality and restores automatic quality without replacing the surface', () => {
  const props = { streamUrl: 'https://example.com/live.m3u8', onFirstFrame: jest.fn(), onError: jest.fn() };
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => { renderer = ReactTestRenderer.create(<MediaSurface {...props} maxVideoHeight={720} maxBitRate={2500000} isMuted disableAudioFocus />); });
  const video = renderer.root.findByType('Video' as any);
  act(() => video.props.onVideoTracks({ videoTracks: [{ height: 1080 }, { height: 720 }, { height: 480 }] }));
  expect(video.props.selectedVideoTrack).toEqual({ type: 'resolution', value: 720 });
  expect(video.props.muted).toBe(true);
  expect(video.props.disableFocus).toBe(true);
  expect(video.props.paused).toBe(false);
  expect(video.props.maxBitRate).toBe(2500000);
  expect(props.onError).not.toHaveBeenCalled();
  act(() => renderer.update(<MediaSurface {...props} />));
  expect(renderer.root.findByType('Video' as any)).toBe(video);
  expect(video.props.selectedVideoTrack).toEqual({ type: 'auto' });
  expect(video.props.disableFocus).toBe(false);
  act(() => renderer.unmount());
});

it('rejects 4K-only Android streams in Multi View rather than exhausting decoders', () => {
  const onError = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => { renderer = ReactTestRenderer.create(<MediaSurface streamUrl="https://example.com/4k.m3u8" maxVideoHeight={720} onFirstFrame={jest.fn()} onError={onError} />); });
  act(() => renderer.root.findByType('Video' as any).props.onVideoTracks({ videoTracks: [{ height: 2160 }] }));
  expect(onError).toHaveBeenCalledTimes(1);
  act(() => renderer.unmount());
});


it('keeps native source and track selection stable across duplicate track events and audio focus changes', () => {
  const props = {streamUrl: 'https://example.com/live.m3u8', maxVideoHeight: 180, onFirstFrame: jest.fn(), onError: jest.fn()};
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => { renderer = ReactTestRenderer.create(<MediaSurface {...props} isMuted />); });
  const video = renderer.root.findByType('Video' as any);
  act(() => video.props.onVideoTracks({videoTracks: [{height: 720}, {height: 360}]}));
  const source = video.props.source;
  const config = video.props.bufferConfig;
  const selection = video.props.selectedVideoTrack;
  act(() => video.props.onVideoTracks({videoTracks: [{height: 360}, {height: 720}, {height: 360}]}));
  act(() => renderer.update(<MediaSurface {...props} isMuted={false} />));
  expect(video.props.source).toBe(source);
  expect(video.props.bufferConfig).toBe(config);
  expect(video.props.selectedVideoTrack).toBe(selection);
  expect(video.props.muted).toBe(false);
  expect(video.props.progressUpdateInterval).toBe(1000);
  act(() => renderer.update(<MediaSurface {...props} maxVideoHeight={undefined} />));
  expect(video.props.progressUpdateInterval).toBe(250);
  act(() => renderer.unmount());
});
