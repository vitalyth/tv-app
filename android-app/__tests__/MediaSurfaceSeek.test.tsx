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
