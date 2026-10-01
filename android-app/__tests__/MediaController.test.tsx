import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import {
  MediaControllerProvider,
  useMediaController,
} from '../src/media/MediaController';
import type { MediaControllerValue } from '../src/media/MediaController';
import type { MediaItem, MediaStream } from '../src/media/player';

describe('MediaController', () => {
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
});
