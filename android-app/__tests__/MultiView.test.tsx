import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { BackHandler, useTVEventHandler } from 'react-native';
import {
  MediaControllerProvider,
  useMediaController,
} from '../src/media/MediaController';
import { MediaLayer } from '../src/components/MediaLayer';
import { MultiViewPlayer } from '../src/components/player/MultiViewPlayer';
import {
  getPlayableLiveChannels,
  resolveLiveChannelStream,
} from '../src/api/channels';
import { multiViewTileLayout } from '../src/media/multiViewLayout';
import type { MediaItem, MediaStream } from '../src/media/player';

jest.mock('react-native/Libraries/Components/TV/useTVEventHandler', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock('../src/components/RemoteImage', () => ({
  RemoteImage: 'RemoteImage',
}));
const mockMount = jest.fn();
const mockUnmount = jest.fn();
jest.mock('../src/media/MediaSurface', () => ({
  MediaSurface: (props: any) => {
    const react = require('react');
    react.useEffect(() => {
      mockMount(props.streamUrl);
      return () => mockUnmount(props.streamUrl);
    }, []);
    return react.createElement('VideoSurface', props);
  },
}));
jest.mock('../src/api/channels', () => ({
  getPlayableLiveChannels: jest.fn(),
  resolveLiveChannelStream: jest.fn(),
}));

describe('old Android-style Multi View', () => {
  const channels: MediaItem[] = Array.from({ length: 5 }, (_, index) => ({
    id: String(index + 11),
    kind: 'live',
    title: `Program ${index}`,
    channelName: `Channel ${index}`,
  }));
  const streams = channels.map(channel => ({
    url: `https://example.com/${channel.id}.m3u8`,
  }));
  let controller: ReturnType<typeof useMediaController>;
  let renderer: Renderer.ReactTestRenderer;
  let back: () => boolean;
  function Harness() {
    controller = useMediaController();
    return (
      <>
        <MediaLayer />
        {controller.presentation === 'multi-tile' ? <MultiViewPlayer /> : null}
      </>
    );
  }
  const button = (id: string) =>
    renderer.root
      .findAllByProps({ testID: `multiview-${id}` })
      .find(node => typeof node.props.onPress === 'function')!;
  const key = async (eventType: string) =>
    act(async () => {
      jest
        .mocked(useTVEventHandler)
        .mock.lastCall![0]({ eventType, eventKeyAction: 0 });
    });
  const surfaces = () => renderer.root.findAllByType('VideoSurface' as any);
  const drawer = () =>
    renderer.root.find(
      node =>
        typeof node.props.onSelectChannel === 'function' &&
        typeof node.props.loadChannels === 'function',
    );
  const enter = async () => {
    await act(async () => controller.enterMultiView());
    await act(async () => {
      back();
    });
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
  };
  const add = async (index: number) => {
    await act(async () =>
      controller.setMultiViewChannel(channels[index], streams[index], index),
    );
    await act(async () => surfaces()[index].props.onFirstFrame());
  };
  beforeEach(async () => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((_event, handler) => {
        back = handler as () => boolean;
        return { remove: jest.fn() };
      });
    jest.mocked(getPlayableLiveChannels).mockResolvedValue(channels);
    jest.mocked(resolveLiveChannelStream).mockResolvedValue(streams[1]);
    await act(async () => {
      renderer = Renderer.create(
        <MediaControllerProvider>
          <Harness />
        </MediaControllerProvider>,
      );
    });
    await act(async () => {
      controller.playFullscreen(channels[0], streams[0]);
      controller.markPlaying();
    });
  });
  afterEach(async () => {
    await act(async () => renderer.unmount());
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('keeps the original surface mounted across entry, four-tile layout, and exit', async () => {
    const original = surfaces()[0];
    expect(original.props.resizeMode).toBe('contain');
    await enter();
    await add(1);
    await add(2);
    await add(3);
    expect(surfaces()).toHaveLength(4);
    expect(surfaces()[0]).toBe(original);
    expect(surfaces().every(node => node.props.resizeMode === 'contain')).toBe(true);
    expect(surfaces().every(node => node.props.maxVideoHeight === 180)).toBe(
      true,
    );
    await act(async () =>
      controller.setMultiViewChannel(channels[4], streams[4], 4),
    );
    expect(surfaces()).toHaveLength(4);
    await act(async () => {
      controller.play(channels[4], streams[4]);
      controller.stopAll();
    });
    expect(controller.item).toBe(channels[0]);
    await act(async () => {
      back();
    });
    expect(surfaces()).toEqual([original]);
    expect(controller.presentation).toBe('fullscreen');
    expect(original.props.resizeMode).toBe('contain');
    expect(controller.stream).toBe(streams[0]);
    expect(mockUnmount).not.toHaveBeenCalledWith(streams[0].url);
  });

  it('fits Android fullscreen without cropping and keeps background fill without reconnecting', async () => {
    const original = surfaces()[0];
    expect(original.props.resizeMode).toBe('contain');
    await act(async () => controller.exitFullscreen());
    expect(surfaces()[0]).toBe(original);
    expect(original.props.resizeMode).toBe('cover');
    await act(async () => controller.openFullscreen(channels[0]));
    expect(surfaces()[0]).toBe(original);
    expect(original.props.resizeMode).toBe('contain');
    expect(mockUnmount).not.toHaveBeenCalled();
  });

  it('immediately unmutes only the focused tile, including vertical navigation, without resolving or reconnecting', async () => {
    await enter();
    await add(1);
    await add(2);
    await add(3);
    const original = surfaces();
    expect(surfaces().every(node => node.props.disableAudioFocus === true)).toBe(true);
    expect(surfaces().map(node => node.props.isMuted)).toEqual([
      false,
      true,
      true,
      true,
    ]);
    await key('right');
    expect(surfaces().map(node => node.props.isMuted)).toEqual([
      true,
      false,
      true,
      true,
    ]);
    await key('down');
    expect(surfaces().map(node => node.props.isMuted)).toEqual([
      true,
      true,
      true,
      false,
    ]);
    await key('left');
    expect(surfaces().map(node => node.props.isMuted)).toEqual([
      true,
      true,
      false,
      true,
    ]);
    await key('up');
    expect(surfaces().map(node => node.props.isMuted)).toEqual([
      false,
      true,
      true,
      true,
    ]);
    expect(surfaces()).toEqual(original);
    expect(surfaces().every(node => node.props.paused === false)).toBe(true);
    expect(resolveLiveChannelStream).not.toHaveBeenCalled();
  });

  it('silences all other tiles while the focused tile loads or fails', async () => {
    await enter();
    await act(async () =>
      controller.setMultiViewChannel(channels[1], streams[1]),
    );
    await key('right');
    expect(surfaces().map(node => node.props.isMuted)).toEqual([true, true]);
    await act(async () => surfaces()[1].props.onFirstFrame());
    expect(surfaces().map(node => node.props.isMuted)).toEqual([true, false]);
    await act(async () => surfaces()[1].props.onError());
    expect(surfaces()).toHaveLength(1);
    expect(surfaces()[0].props.isMuted).toBe(true);
    expect(controller.multiView?.audioTile).toBe(-1);
    await key('left');
    expect(surfaces()[0].props.isMuted).toBe(false);
  });

  it('opens the add picker on entry and from the right edge, filters duplicates, and focuses the added channel', async () => {
    await act(async () => controller.enterMultiView());
    expect(await drawer().props.loadChannels()).toEqual(channels.slice(1));
    await act(async () => drawer().props.onSelectChannel(channels[1]));
    expect(controller.multiView?.tiles[0]?.item).toBe(channels[1]);
    expect(controller.multiView?.audioTile).toBe(-1);
    await act(async () => surfaces()[1].props.onFirstFrame());
    expect(controller.multiView?.audioTile).toBe(1);
    await key('right');
    expect(await drawer().props.loadChannels()).toEqual(channels.slice(2));
  });

  it('opens compact in-tile actions with Select and hides them automatically', async () => {
    await enter();
    await add(1);
    expect(
      renderer.root.findAllByProps({ testID: 'multiview-fullscreen' }),
    ).toHaveLength(0);
    await act(async () => button('focus').props.onPress());
    expect(button('fullscreen')).toBeDefined();
    expect(button('add')).toBeDefined();
    expect(button('remove')).toBeDefined();
    await act(async () => jest.advanceTimersByTime(4500));
    expect(
      renderer.root.findAllByProps({ testID: 'multiview-fullscreen' }),
    ).toHaveLength(0);
  });

  it('removes either tile and returns to a single player when one channel remains', async () => {
    await enter();
    await add(1);
    await act(async () => button('focus').props.onPress());
    await act(async () => button('remove').props.onPress());
    expect(controller.item).toBe(channels[1]);
    expect(controller.presentation).toBe('fullscreen');
    expect(surfaces()).toHaveLength(1);
  });

  it('removing another tile does not remount remaining secondary players', async () => {
    await enter();
    await add(1);
    await add(2);
    await add(3);
    const last = surfaces()[3];
    await act(async () => controller.removeMultiViewChannel(1));
    expect(controller.multiView?.tiles.map(entry => entry.item.id)).toEqual([
      channels[2].id,
      channels[3].id,
    ]);
    expect(surfaces()).toHaveLength(3);
    expect(surfaces()[2]).toBe(last);
  });

  it('ignores late picker resolution and preserves playback on resolver failure', async () => {
    let finish!: (value: MediaStream) => void;
    jest.mocked(resolveLiveChannelStream).mockImplementationOnce(
      () =>
        new Promise(done => {
          finish = done;
        }),
    );
    await act(async () => controller.enterMultiView());
    let pending!: Promise<void>;
    await act(async () => {
      pending = drawer().props.onSelectChannel(channels[1]);
    });
    await act(async () => {
      back();
    });
    await act(async () => {
      finish(streams[1]);
      await pending;
    });
    expect(controller.multiView?.tiles).toEqual([]);
    await key('right');
    jest
      .mocked(resolveLiveChannelStream)
      .mockRejectedValueOnce(new Error('offline'));
    await act(async () => drawer().props.onSelectChannel(channels[1]));
    expect(drawer().props.error).toBeTruthy();
    expect(controller.stream).toBe(streams[0]);
  });

  it('times out and releases a nonplaying extra tile', async () => {
    await enter();
    await act(async () =>
      controller.setMultiViewChannel(channels[1], streams[1]),
    );
    await act(async () => jest.advanceTimersByTime(25000));
    expect(controller.multiView?.tiles[0]?.status).toBe('error');
    expect(surfaces()).toHaveLength(1);
    expect(controller.status).toBe('playing');
  });

  it('honors hardware play/pause, ignores volume, and preserves pause on exit', async () => {
    await enter();
    await add(1);
    await key('playpause');
    expect(surfaces().every(node => node.props.paused)).toBe(true);
    await key('volumeUp');
    expect(
      renderer.root.findAllByProps({ testID: 'multiview-fullscreen' }),
    ).toHaveLength(0);
    await act(async () => {
      back();
    });
    expect(controller.paused).toBe(true);
  });

  it('does not open multiview for VOD or an unresolved stream', async () => {
    await act(async () =>
      controller.playFullscreen({ ...channels[0], kind: 'vod' }, streams[0]),
    );
    await act(async () => controller.enterMultiView());
    expect(controller.multiView).toBeNull();
    await act(async () => controller.openFullscreen(channels[1]));
    await act(async () => controller.enterMultiView());
    expect(controller.multiView).toBeNull();
  });

  it('uses the same full-screen grid geometry for media and focus overlays', () => {
    for (const count of [2, 3, 4]) {
      const layouts = Array.from({ length: count }, (_, index) =>
        multiViewTileLayout(index, count, 960, 540),
      );
      for (const box of layouts) {
        expect(Number(box.left) + Number(box.width)).toBeLessThanOrEqual(960);
        expect(Number(box.top) + Number(box.height)).toBeLessThanOrEqual(540);
      }
      expect(layouts[0].top).toBe(18);
      expect(Number(layouts[0].height)).toBe(count === 2 ? 504 : 246);
    }
  });
});
