import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import {
  MediaControllerProvider,
  useMediaController,
} from '../src/media/MediaController';
import type { MediaControllerValue } from '../src/media/MediaController';
import type { MediaItem, MediaStream } from '../src/media/player';

describe('MediaController', () => {
  it('reuses the latest stream when a native card retained the initial fullscreen callback', () => {
    let controller!: MediaControllerValue;
    function Probe() { controller = useMediaController(); return null; }
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => { renderer = ReactTestRenderer.create(<MediaControllerProvider><Probe /></MediaControllerProvider>); });
    const retainedOpenFullscreen = controller.openFullscreen;
    const item: MediaItem = { id: '12', kind: 'live', title: 'Keshet' };
    const stream: MediaStream = { url: 'https://example.com/live.m3u8' };
    act(() => { controller.play(item, stream); controller.markPlaying(); });
    expect(controller.openFullscreen).toBe(retainedOpenFullscreen);
    act(() => retainedOpenFullscreen(item));
    expect(controller.isFullscreen).toBe(true);
    expect(controller.stream).toBe(stream);
    expect(controller.status).toBe('playing');
    act(() => { controller.exitFullscreen(); retainedOpenFullscreen(item); });
    expect(controller.stream).toBe(stream);
    act(() => renderer.unmount());
  });

  it.each(['enterFullscreen', 'openFullscreen'] as const)(
    'protects reused playback from preview cleanup after %s', action => {
      let controller!: MediaControllerValue;
      function Harness() { controller = useMediaController(); return null; }
      let renderer!: ReactTestRenderer.ReactTestRenderer;
      act(() => {
        renderer = ReactTestRenderer.create(<MediaControllerProvider><Harness /></MediaControllerProvider>);
      });
      const item: MediaItem = { id: '13', kind: 'live', title: 'Reshet' };
      const stream: MediaStream = { url: 'https://example.com/live.m3u8' };
      act(() => { controller.play(item, stream); controller.markPlaying(); });
      act(() => {
        if (action === 'openFullscreen') { controller.openFullscreen(item); }
        else { controller.enterFullscreen(); }
        controller.stopAll();
        controller.stopVideo();
        controller.showImage({ ...item, id: 'other' });
        controller.play({ ...item, id: 'other' }, { url: 'https://example.com/other.m3u8' });
      });
      expect(controller.isFullscreen).toBe(true);
      expect(controller.item).toBe(item);
      expect(controller.stream).toBe(stream);
      expect(controller.status).toBe('playing');
      act(() => { controller.exitFullscreen(); controller.stopAll(); });
      expect(controller.stream).toBeUndefined();
      act(() => renderer.unmount());
    },
  );

  it('stops timeline broadcasts in Multi View and resumes them after exit', () => {
    let controller!: MediaControllerValue;
    const render = jest.fn();
    function Probe() { controller = useMediaController(); render(); return null; }
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => { renderer = ReactTestRenderer.create(<MediaControllerProvider><Probe /></MediaControllerProvider>); });
    act(() => { controller.playFullscreen({id: '12', kind: 'live', title: '12'}, {url: 'https://example.com/live.m3u8'}); });
    act(() => controller.updateProgress(10, 30, 0, 30));
    act(() => controller.enterMultiView());
    render.mockClear();
    act(() => controller.updateProgress(20, 40, 5, 40));
    expect(render).not.toHaveBeenCalled();
    expect(controller.currentTime).toBe(10);
    act(() => controller.exitMultiView());
    act(() => controller.updateProgress(21, 41, 6, 41));
    expect(controller.currentTime).toBe(21);
    expect(controller.seekableEnd).toBe(41);
    act(() => renderer.unmount());
  });

  it('does not broadcast unchanged quality lists but publishes changed qualities', () => {
    let controller!: MediaControllerValue;
    const render = jest.fn();
    function Probe() { controller = useMediaController(); render(); return null; }
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => { renderer = ReactTestRenderer.create(<MediaControllerProvider><Probe /></MediaControllerProvider>); });
    const quality = {id: '360', label: '360p', height: 360, active: true};
    act(() => controller.setAvailableQualities([quality]));
    render.mockClear();
    act(() => controller.setAvailableQualities([{...quality}]));
    // React may invoke the provider for a no-op setter, but consumers stay unchanged.
    expect(render).not.toHaveBeenCalled();
    act(() => controller.setAvailableQualities([{...quality, active: false}]));
    expect(controller.videoQualities[0].active).toBe(false);
    expect(render).toHaveBeenCalled();
    act(() => renderer.unmount());
  });

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
