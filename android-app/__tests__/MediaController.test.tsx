import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import {
  MediaControllerProvider,
  useMediaController,
} from '../src/media/MediaController';
import type { MediaControllerValue } from '../src/media/MediaController';
import type { MediaItem, MediaStream } from '../src/media/player';

describe('MediaController', () => {
  it('routes seeks to the active adapter and releases its handler on teardown', () => {
    let controller!: MediaControllerValue;
    function Harness() {
      controller = useMediaController();
      return null;
    }
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <MediaControllerProvider>
          <Harness />
        </MediaControllerProvider>,
      );
    });
    const oldAdapter = jest.fn();
    const activeAdapter = jest.fn();
    const releaseOld = controller.registerSeekHandler(oldAdapter);
    const releaseActive = controller.registerSeekHandler(activeAdapter);
    releaseOld();
    controller.seekTo(130);
    controller.seekTo(NaN);
    controller.seekTo(Infinity);
    controller.seekTo(-10);
    expect(oldAdapter).not.toHaveBeenCalled();
    expect(activeAdapter.mock.calls).toEqual([[130]]);
    releaseActive();
    controller.seekTo(140);
    expect(activeAdapter).toHaveBeenCalledTimes(1);
    act(() => renderer.unmount());
  });

  it('never exposes a stream that belongs to a different media item', () => {
    let controller!: MediaControllerValue;

    function Harness() {
      controller = useMediaController();
      return null;
    }

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <MediaControllerProvider>
          <Harness />
        </MediaControllerProvider>,
      );
    });

    const liveItem: MediaItem = {
      id: 'live-11',
      kind: 'live',
      title: 'Live channel',
    };
    const vodItem: MediaItem = {
      id: 'vod-42',
      kind: 'vod',
      title: 'VOD episode',
    };
    const liveStream: MediaStream = {
      url: 'https://example.com/live.m3u8',
      type: 'm3u8',
    };

    act(() => {
      controller.play(liveItem, liveStream);
    });
    expect(controller.item?.id).toBe(liveItem.id);
    expect(controller.stream).toEqual(liveStream);

    act(() => {
      controller.openFullscreen(vodItem);
    });
    expect(controller.item?.id).toBe(vodItem.id);
    expect(controller.presentation).toBe('fullscreen');
    expect(controller.stream).toBeUndefined();

    act(() => {
      renderer.unmount();
    });
  });

  it('keeps the current stream when opening fullscreen for the same live channel', () => {
    let controller!: MediaControllerValue;

    function Harness() {
      controller = useMediaController();
      return null;
    }

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <MediaControllerProvider>
          <Harness />
        </MediaControllerProvider>,
      );
    });

    const liveItem: MediaItem = {
      id: 'reshet-primary',
      kind: 'live',
      title: 'Program A',
      channelName: 'Reshet 13',
      channelNumber: '13',
      sourcePayload: { id: 'source-a', channelID: '13' },
    };
    const refreshedLiveItem: MediaItem = {
      id: 'reshet-refreshed',
      kind: 'live',
      title: 'Program B',
      channelName: 'Reshet 13',
      channelNumber: '13',
      sourcePayload: { id: 'source-b', channelID: '13' },
    };
    const liveStream: MediaStream = {
      url: 'https://example.com/reshet.m3u8',
      type: 'm3u8',
    };

    act(() => {
      controller.play(liveItem, liveStream);
      controller.markPlaying();
    });

    act(() => {
      controller.openFullscreen(refreshedLiveItem);
    });

    expect(controller.presentation).toBe('single-video');
    expect(controller.isFullscreen).toBe(true);
    expect(controller.item?.id).toBe(refreshedLiveItem.id);
    expect(controller.stream).toEqual(liveStream);
    expect(controller.status).toBe('playing');

    act(() => {
      renderer.unmount();
    });
  });
});
