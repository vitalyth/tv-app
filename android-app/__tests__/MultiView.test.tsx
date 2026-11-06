import {liveEpgStore} from '../src/state/liveEpg';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Animated, BackHandler } from 'react-native';
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
import { multiViewTileLayout, multiViewFocusLayout, multiViewToolbarLayout } from '../src/media/multiViewLayout';
import {PlayerTopInfo} from '../src/components/player/PlayerTopInfo';
import {PlayerBottomControls} from '../src/components/player/PlayerBottomControls';
import {SubtitleDialog} from '../src/components/player/SubtitleDialog';
import {QualityDialog} from '../src/components/player/QualityDialog';
import {MultiViewTileFrame} from '../src/components/player/MultiViewTileFrame';
import type { MediaItem, MediaStream } from '../src/media/player';

const mockRemoteListeners = new Set<{current: (event: any) => void}>();
jest.mock('react-native/Libraries/Components/TV/useTVEventHandler', () => ({
  __esModule: true,
  default: jest.fn((callback: (event: any) => void) => {
    const react = require('react');
    const latest = react.useRef(callback);
    latest.current = callback;
    react.useEffect(() => {
      mockRemoteListeners.add(latest);
      return () => {mockRemoteListeners.delete(latest);};
    }, []);
  }),
}));
jest.mock('../src/components/RemoteImage', () => ({
  RemoteImage: 'RemoteImage',
}));
const mockRender = jest.fn();
const mockMount = jest.fn();
const mockUnmount = jest.fn();
jest.mock('../src/media/MediaSurface', () => ({
  MediaSurface: (props: any) => {
    mockRender(props.streamUrl);
    const react = require('react');
    react.useEffect(() => {
      mockMount(props.streamUrl);
      return () => mockUnmount(props.streamUrl);
    }, []);
    return react.createElement('VideoSurface', props);
  },
}));
jest.mock('../src/api/channels', () => ({
  ...jest.requireActual('../src/api/channels'),
  getPlayableLiveChannels: jest.fn(),
  resolveLiveChannelStream: jest.fn(),
}));

describe('Multi View channel menu', () => {
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
    const [drawerOpen, setDrawerOpen] = React.useState(false);
    return (
      <>
        <MediaLayer channelDrawerOpen={drawerOpen} />
        {controller.presentation === 'multi-tile' ? <MultiViewPlayer onChannelDrawerChange={setDrawerOpen} /> : null}
      </>
    );
  }
  const button = (id: string) =>
    renderer.root
      .findAllByProps({ testID: `multiview-${id}` })
      .find(node => typeof node.props.onPress === 'function')!;
  const key = async (eventType: string) =>
    act(async () => {
      for (const listener of mockRemoteListeners) {
        listener.current({eventType, eventKeyAction: 0});
      }
    });
  const openActiveControls = async () => {
    await act(async () => button('active-activator').props.onPress());
    await act(async () => jest.advanceTimersByTime(400));
  };
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
    liveEpgStore.publish([]);
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
    expect(surfaces()[0].props.maxBitRate).toBeUndefined();
    expect(surfaces().slice(1).every(node => node.props.maxBitRate === 260000)).toBe(true);
    await add(2);
    await add(3);
    expect(surfaces()).toHaveLength(4);
    expect(surfaces()[0]).toBe(original);
    expect(original.props.preferSurfaceView).toBeUndefined();
    expect(surfaces().slice(1).every(node => node.props.preferSurfaceView === true)).toBe(true);
    expect(surfaces().every(node => node.props.resizeMode === 'contain')).toBe(true);
    expect(surfaces()[0].props.maxVideoHeight).toBeUndefined();
    expect(surfaces().slice(1).every(node => node.props.maxVideoHeight === 180)).toBe(true);
    expect(surfaces()[0].props.maxBitRate).toBeUndefined();
    expect(surfaces().slice(1).every(node => node.props.maxBitRate === 260000)).toBe(true);
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

  it('uses regular-player quality for the large video and keeps the other previews bounded through promotion', async () => {
    await act(async () => controller.setSelectedQuality('720'));
    const fullscreen = surfaces()[0];
    const regularPolicy = {maxVideoHeight: fullscreen.props.maxVideoHeight,
      maxBitRate: fullscreen.props.maxBitRate, preferSurfaceView: fullscreen.props.preferSurfaceView};
    await enter(); await add(1); await add(2); await add(3);
    const original = surfaces();
    expect(original[0].props.selectedQualityId).toBe('720');
    expect({maxVideoHeight: original[0].props.maxVideoHeight, maxBitRate: original[0].props.maxBitRate,
      preferSurfaceView: original[0].props.preferSurfaceView}).toEqual(regularPolicy);
    await act(async () => button('select-2').props.onPress());
    expect({maxVideoHeight: original[2].props.maxVideoHeight, maxBitRate: original[2].props.maxBitRate,
      preferSurfaceView: original[2].props.preferSurfaceView}).toEqual(regularPolicy);
    for (const index of [0, 1, 3]) {
      expect(original[index].props.maxVideoHeight).toBe(180);
      expect(original[index].props.maxBitRate).toBe(260000);
      expect(original[index].props.preferSurfaceView).toBe(true);
    }
    await act(async () => original[2].props.onVideoTracks([
      {id: 'auto', label: 'Auto'}, {id: '144', label: '144p', height: 144},
      {id: '1080', label: '1080p', height: 1080},
    ]));
    await openActiveControls();
    await act(async () => renderer.root.findByType((PlayerBottomControls as any).type).props.onOpenQuality());
    const quality = renderer.root.findByType((QualityDialog as any).type);
    expect(quality.props.qualities.some((option: any) => option.id === '1080')).toBe(true);
    await act(async () => quality.props.onSelectQuality('1080'));
    expect(original[2].props.selectedQualityId).toBe('1080');
    expect(original[2].props.maxVideoHeight).toBeUndefined();
    await act(async () => button('select-0').props.onPress());
    expect(original[0].props.selectedQualityId).toBe('720');
    expect(original[2].props.maxVideoHeight).toBe(180);
    expect(original[2].props.maxBitRate).toBe(260000);
    expect(surfaces()).toEqual(original);
    expect(mockUnmount).not.toHaveBeenCalled();
    expect(resolveLiveChannelStream).not.toHaveBeenCalled();
  });

  it('shares normal subtitle preferences with the large player and ignores reports from demoted streams', async () => {
    await enter(); await add(1);
    const original = surfaces();
    const staleReport = original[0].props.onSubtitleTracks;
    await act(async () => staleReport([{id: '0', language: 'he', label: 'Hebrew'}]));
    await act(async () => controller.setSelectedSubtitle('0'));
    expect(original[0].props.selectedSubtitleId).toBe('0');
    expect(original[1].props.selectedSubtitleId).toBe('off');
    expect(original[1].props.onSubtitleTracks).toBeUndefined();
    await act(async () => button('select-1').props.onPress());
    expect(controller.subtitleTracks).toHaveLength(0);
    expect(original[0].props.selectedSubtitleId).toBe('off');
    expect(original[0].props.onSubtitleTracks).toBeUndefined();
    await act(async () => staleReport([{id: '0', language: 'en', label: 'English'}]));
    expect(controller.subtitleTracks).toHaveLength(0);
    await act(async () => original[1].props.onSubtitleTracks([{id: '3', language: 'heb', label: 'Hebrew'}]));
    expect(original[1].props.selectedSubtitleId).toBe('3');
    await openActiveControls();
    const controls = renderer.root.findByType((PlayerBottomControls as any).type);
    expect(controls.props.hasSubtitles).toBe(true);
    await act(async () => controls.props.onOpenSubtitles());
    const subtitles = renderer.root.findByType((SubtitleDialog as any).type);
    expect(subtitles.props.selectedId).toBe('3');
    await act(async () => subtitles.props.onSelect('off'));
    expect(original[1].props.selectedSubtitleId).toBe('off');
    expect(surfaces()).toEqual(original);
    expect(mockUnmount).not.toHaveBeenCalled();
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

  it('previews audio on small-video focus and promotes the selected video without reconnecting', async () => {
    await enter(); await add(1); await add(2); await add(3);
    const original = surfaces();
    expect(controller.multiView?.audioTile).toBe(1);
    await key('down');
    expect(controller.multiView?.activeTile ?? 0).toBe(0);
    expect(controller.multiView?.audioTile).toBe(2);
    await act(async () => button('focus').props.onPress());
    expect(controller.multiView?.activeTile).toBe(2);
    expect(controller.multiView?.audioTile).toBe(2);
    expect(button('active-activator').props.focusable).toBe(true);
    expect(renderer.root.findAllByType((PlayerBottomControls as any).type)).toHaveLength(0);
    await key('right');
    await key('down'); await key('down');
    expect(controller.multiView?.audioTile).toBe(3);
    await key('left');
    expect(controller.multiView?.audioTile).toBe(2);
    expect(surfaces().filter(node => !node.props.isMuted)).toHaveLength(1);
    expect(surfaces()).toEqual(original);
    expect(mockUnmount).not.toHaveBeenCalled();
    expect(resolveLiveChannelStream).not.toHaveBeenCalled();
  });

  it('keeps unaffected video renders out of audio-focus and progress updates', async () => {
    await enter(); await add(1); await add(2); await add(3);
    mockRender.mockClear();
    await act(async () => controller.updateProgress(10, 30));
    expect(mockRender.mock.calls.flat()).not.toContain(streams[1].url);
    expect(mockRender.mock.calls.flat()).not.toContain(streams[2].url);
    expect(mockRender.mock.calls.flat()).not.toContain(streams[3].url);
    mockRender.mockClear();
    await key('down');
    expect(mockRender.mock.calls.flat()).toContain(streams[1].url);
    expect(mockRender.mock.calls.flat()).toContain(streams[2].url);
    expect(mockRender.mock.calls.flat()).not.toContain(streams[3].url);
  });

  it('keeps secondary progress local while the active player panels are closed', async () => {
    await enter(); await add(1); await add(2); await add(3);
    mockRender.mockClear();
    await act(async () => {
      surfaces()[2].props.onProgress({currentTime: 50, seekableDuration: 80});
      surfaces()[3].props.onProgress({currentTime: 60, seekableDuration: 90});
    });
    expect(mockRender).not.toHaveBeenCalled();
  });

  it('shares focused geometry with every video and overlay without replacing any players', async () => {
    await enter(); await add(1); await add(2); await add(3);
    const original = surfaces();
    const timing = jest.spyOn(Animated, 'timing');
    await key('down'); await key('down');
    await act(async () => button('focus').props.onPress());
    expect(controller.multiView?.activeTile).toBe(3);
    const frames = renderer.root.findAllByType(MultiViewTileFrame);
    expect(frames).toHaveLength(8);
    expect(frames.every(frame => frame.props.activeTile === 3)).toBe(true);
    expect(surfaces()).toEqual(original);
    expect(mockUnmount).not.toHaveBeenCalled();
    expect(resolveLiveChannelStream).not.toHaveBeenCalled();
    const focusAnimations = timing.mock.calls.filter(([, config]) => config.duration === 200);
    expect(focusAnimations.length).toBeGreaterThan(0);
    expect(focusAnimations.every(([, config]) => config.useNativeDriver && config.isInteraction === false)).toBe(true);
    await act(async () => controller.setMultiViewActiveTile(100));
    expect(controller.multiView?.activeTile).toBe(3);
    await act(async () => controller.setMultiViewActiveTile(-1));
    expect(controller.multiView?.activeTile).toBe(0);
  });

  it('enlarges the focused video and stacks every other video on the right with wider vertical gaps and no overlap', () => {
    for (const count of [2, 3, 4]) {
      for (let focused = 0; focused < count; focused++) {
        const boxes = Array.from({length: count}, (_, index) => multiViewFocusLayout(index, count, 960, 540, focused));
        const focusedArea = boxes[focused].width * boxes[focused].height;
        const others = boxes.filter((_, index) => index !== focused);
        expect(boxes[focused].width).toBeGreaterThan(960 * 0.65);
        expect(others.every(box => Math.abs(box.left - others[0].left) < 0.001)).toBe(true);
        expect(others.every(box => box.left > boxes[focused].left + boxes[focused].width)).toBe(true);
        for (let index = 1; index < others.length; index++) {
          expect(others[index].top - others[index - 1].top - others[index - 1].height).toBeCloseTo(24);
        }
        expect(boxes[focused].width).toBeGreaterThan(Number(multiViewTileLayout(focused, count, 960, 540).width));
        for (let i = 0; i < count; i++) {
          const box = boxes[i];
          expect(box.width / box.height).toBeCloseTo(16 / 9);
          expect(box.left).toBeGreaterThanOrEqual(0);
          expect(box.top).toBeGreaterThanOrEqual(0);
          expect(box.left + box.width).toBeLessThanOrEqual(960);
          expect(box.top + box.height).toBeLessThanOrEqual(540);
          if (i !== focused) expect(focusedArea / (box.width * box.height)).toBeGreaterThan(5);
          for (let j = i + 1; j < count; j++) {
            const other = boxes[j];
            expect(box.left + box.width <= other.left + 0.001 || other.left + other.width <= box.left + 0.001 ||
              box.top + box.height <= other.top + 0.001 || other.top + other.height <= box.top + 0.001).toBe(true);
          }
        }
      }
    }
  });

  it('silences all other tiles while the focused tile loads or fails', async () => {
    await enter();
    await act(async () =>
      controller.setMultiViewChannel(channels[1], streams[1]),
    );
    expect(surfaces().map(node => node.props.isMuted)).toEqual([true, true]);
    await act(async () => surfaces()[1].props.onFirstFrame());
    expect(surfaces().map(node => node.props.isMuted)).toEqual([true, false]);
    // The surface retries transient errors; this is its terminal failure signal.
    await act(async () => controller.markMultiViewError(1));
    expect(surfaces()).toHaveLength(1);
    expect(surfaces()[0].props.isMuted).toBe(true);
    expect(controller.multiView?.audioTile).toBe(-1);
    await key('left');
    expect(surfaces()[0].props.isMuted).toBe(false);
  });

  it('opens the styled picker on entry and from Add, starting on the active channel', async () => {
    await act(async () => controller.enterMultiView());
    expect(await drawer().props.loadChannels()).toEqual(channels);
    expect(drawer().props.item).toBe(channels[0]);
    await act(async () => drawer().props.onSelectChannel(channels[1]));
    expect(controller.multiView?.tiles[0]?.item).toBe(channels[1]);
    expect(button('active-activator').props.focusable).toBe(true);
    expect(button('active-activator').props.accessibilityLabel).toBe('Channel 1');
    expect(renderer.root.findAllByType((PlayerBottomControls as any).type)).toHaveLength(0);
    expect(controller.multiView?.audioTile).toBe(-1);
    await act(async () => surfaces()[1].props.onFirstFrame());
    expect(controller.multiView?.audioTile).toBe(1);
    await act(async () => button('add').props.onPress());
    expect(await drawer().props.loadChannels()).toEqual(channels);
    expect(drawer().props.item).toBe(channels[1]);
  });

  it('focuses an existing channel without resolving or duplicating its stream', async () => {
    await enter();
    await add(1);
    await act(async () => button('focus').props.onPress());
    const original = surfaces();
    await act(async () => button('add').props.onPress());
    expect(drawer().props.item).toBe(channels[1]);
    await act(async () => drawer().props.onSelectChannel(channels[0]));
    expect(controller.multiView?.tiles).toHaveLength(1);
    expect(controller.multiView?.audioTile).toBe(0);
    expect(button('active-activator').props.accessibilityLabel).toBe('Channel 0');
    expect(surfaces()).toEqual(original);
    expect(resolveLiveChannelStream).not.toHaveBeenCalled();
  });

  it('opens the picker with Add and keeps the original stream', async () => {
    await enter();
    const original = surfaces()[0];
    await act(async () => button('add').props.onPress());
    expect(drawer().props.item).toBe(channels[0]);
    await act(async () => drawer().props.onSelectChannel(channels[1]));
    expect(controller.multiView?.tiles[0]?.item).toBe(channels[1]);
    expect(surfaces()[0]).toBe(original);
    expect(controller.stream).toBe(streams[0]);
  });

  it('never opens the picker or activates a tile with horizontal arrows', async () => {
    await enter(); await add(1); await add(2); await add(3);
    const original = surfaces();
    await key('left'); await key('right'); await key('right'); await key('left');
    expect(button('change').props.focusable).toBe(false);
    expect(button('active-activator').props.focusable).toBe(true);
    expect(button('focus').props.focusable).toBe(false);
    expect(controller.multiView?.activeTile ?? 0).toBe(0);
    expect(controller.multiView?.audioTile).toBe(0);
    expect(renderer.root.findAllByProps({testID: 'live-channel-drawer'})).toHaveLength(0);
    expect(surfaces()).toEqual(original);
    expect(resolveLiveChannelStream).not.toHaveBeenCalled();
  });

  it.each([0, 1])('changes only tile %i at capacity and preserves other streams', async target => {
    await enter();
    await add(1); await add(2); await add(3);
    if (target) { await act(async () => button('focus').props.onPress()); }
    const original = surfaces();
    expect(button('add')).toBeUndefined();
    await act(async () => button('change').props.onPress());
    expect(drawer().props.item).toBe(channels[target]);
    jest.mocked(resolveLiveChannelStream).mockResolvedValueOnce(streams[4]);
    await act(async () => drawer().props.onSelectChannel(channels[4]));
    expect([controller.item, ...controller.multiView!.tiles.map(entry => entry.item)])
      .toEqual(channels.slice(0, 4).map((channel, index) => index === target ? channels[4] : channel));
    expect(surfaces()).toHaveLength(4);
    original.forEach((surface, index) => {
      if (index !== target) { expect(surfaces()[index]).toBe(surface); }
    });
    await act(async () => surfaces()[target].props.onFirstFrame());
    expect(controller.multiView?.audioTile).toBe(target);
    expect(button('active-activator').props.focusable).toBe(true);
  });

  it('preserves the current channels when changing is cancelled or fails', async () => {
    await enter(); await add(1);
    const original = surfaces();
    await act(async () => button('change').props.onPress());
    await act(async () => { back(); });
    expect(surfaces()).toEqual(original);
    await act(async () => jest.advanceTimersByTime(400));
    await act(async () => button('change').props.onPress());
    jest.mocked(resolveLiveChannelStream).mockRejectedValueOnce(new Error('offline'));
    await act(async () => drawer().props.onSelectChannel(channels[2]));
    expect(drawer().props.error).toBeTruthy();
    expect(surfaces()).toEqual(original);
    expect(controller.item).toBe(channels[0]);
    expect(controller.multiView?.tiles[0].item).toBe(channels[1]);
  });

  it('animates the media grid and overlay together when opening and closing the picker', async () => {
    await enter(); await add(1);
    const original = surfaces();
    await act(async () => button('add').props.onPress());
    expect(renderer.root.findByType(MediaLayer).props.channelDrawerOpen).toBe(true);
    await key('right');
    expect(renderer.root.findAllByProps({testID: 'live-channel-drawer'})).toHaveLength(0);
    expect(renderer.root.findByType(MediaLayer).props.channelDrawerOpen).toBe(false);
    expect(surfaces()).toEqual(original);
    expect(mockUnmount).not.toHaveBeenCalled();
  });

  it('moves Left between tile actions without opening the channel menu', async () => {
    await enter(); await add(1);
    await key('down');
    expect(button('fullscreen')).toBeDefined();
    await key('left');
    expect(button('focus').props.accessibilityLabel).toBe(button('remove').props.accessibilityLabel);
    expect(renderer.root.findAllByProps({testID: 'live-channel-drawer'})).toHaveLength(0);
    await key('right');
    expect(button('focus').props.accessibilityLabel).toBe(button('fullscreen').props.accessibilityLabel);
  });

  it('reopens the menu from the shared channel list without waiting for another request', async () => {
    await enter();
    const calls = jest.mocked(getPlayableLiveChannels).mock.calls.length;
    await act(async () => {liveEpgStore.publish(channels);});
    await act(async () => button('add').props.onPress());
    expect(await drawer().props.loadChannels()).toEqual(channels);
    expect(getPlayableLiveChannels).toHaveBeenCalledTimes(calls);
    expect(drawer().props.item).toBe(channels[0]);
  });

  it('hides information panels until tile focus changes and restarts their timeout', async () => {
    await enter(); await add(1); await add(2); await add(3);
    const original = surfaces();
    const captions = () => [...new Set(renderer.root.findAll(node => /^multiview-caption-/.test(node.props.testID ?? '')).map(node => node.props.testID))];
    expect(captions()).toHaveLength(4);
    await act(async () => jest.advanceTimersByTime(4500));
    expect(captions()).toHaveLength(0);
    await key('right'); // At the small-video column edge: no focus change.
    await key('playpause'); await key('playpause');
    await act(async () => controller.updateProgress(10, 30));
    expect(captions()).toHaveLength(0);
    await key('down');
    expect(captions()).toHaveLength(4);
    await act(async () => jest.advanceTimersByTime(3000));
    await key('down');
    await act(async () => jest.advanceTimersByTime(2000));
    expect(captions()).toHaveLength(4);
    await act(async () => jest.advanceTimersByTime(2500));
    expect(captions()).toHaveLength(0);
    await act(async () => button('focus').props.onPress());
    expect(button('change')).toBeDefined();
    expect(captions()).toHaveLength(3);
    expect(surfaces()).toEqual(original);
    expect(mockUnmount).not.toHaveBeenCalled();
    expect(resolveLiveChannelStream).not.toHaveBeenCalled();
  });

  it('keeps the active toolbar visible and targets the active video while a small video is focused', async () => {
    await enter(); await add(1); await add(2);
    expect(button('fullscreen')).toBeDefined();
    expect(button('add')).toBeDefined();
    expect(button('change')).toBeDefined();
    expect(button('remove')).toBeDefined();
    await act(async () => jest.advanceTimersByTime(6000));
    expect(button('change')).toBeDefined();
    await key('down');
    expect(button('focus').props.accessibilityLabel).toBe('Channel 2');
    await act(async () => button('change').props.onPress());
    expect(drawer().props.item).toBe(channels[0]);
  });

  it.each([1, 2, 3, 4])('reserves space below the active video for %i streams', count => {
    for (let active = 0; active < count; active++) {
      const video = multiViewFocusLayout(active, count, 960, 540, active);
      const toolbar = multiViewToolbarLayout(count, 960, 540, active);
      expect(toolbar.top - video.top - video.height).toBeCloseTo(12);
      expect(toolbar.left).toBe(video.left);
      expect(toolbar.width).toBe(video.width);
      expect(toolbar.top + toolbar.height).toBeLessThanOrEqual(540 - 8);
    }
  });

  it('moves Left from a small video to the main video, keeping its controls closed until a click', async () => {
    await enter(); await add(1); await add(2);
    await key('down'); await key('left');
    expect(button('active-activator').props.focusable).toBe(true);
    expect(button('fullscreen').props.focusable).toBe(false);
    expect(renderer.root.findAllByType((PlayerBottomControls as any).type)).toHaveLength(0);
    const overlays = renderer.root.findAllByType(MultiViewTileFrame).filter(node => /^multiview-tile-/.test(node.props.testID ?? ''));
    expect(overlays[0].props.style.filter(Boolean)).toHaveLength(2);
    expect(overlays.slice(1).every(node => node.props.style.filter(Boolean).length === 1)).toBe(true);
    await key('right');
    expect(button('focus').props.accessibilityLabel).toBe('Channel 2');
    expect(controller.multiView?.audioTile).toBe(2);
    await key('left');
    await key('down');
    expect(button('fullscreen').props.focusable).toBe(true);
    await key('right');
    expect(button('add').props.focusable).toBe(true);
    await act(async () => button('add').props.onPress());
    expect(drawer().props.item).toBe(channels[0]);
  });

  it('places compact information panels at the top and the toolbar outside every video frame', async () => {
    await enter(); await add(1);
    const toolbar = renderer.root.findAllByProps({testID: 'multiview-toolbar'})[0];
    expect(toolbar.findAllByProps({testID: 'multiview-fullscreen'}).length).toBeGreaterThan(0);
    for (const frame of renderer.root.findAllByType(MultiViewTileFrame)) {
      expect(frame.findAllByProps({testID: 'multiview-toolbar'})).toHaveLength(0);
    }
    for (const caption of renderer.root.findAllByProps({testID: 'multiview-caption-0'})) {
      expect(caption.props.style.top).toBe(8);
      expect(caption.props.style.height).toBeLessThan(50);
      expect(caption.props.style.bottom).toBeUndefined();
    }
  });

  it('enters the persistent toolbar below the last small video and returns with Up', async () => {
    await enter(); await add(1); await add(2);
    await key('down'); await key('down');
    expect(button('fullscreen').props.accessibilityState.selected).toBe(true);
    await key('right');
    expect(button('add').props.accessibilityState.selected).toBe(true);
    await key('up');
    expect(renderer.root.findAllByProps({testID: 'multiview-active-panels'}).length).toBeGreaterThan(0);
    expect(button('add').props.accessibilityState.selected).toBe(false);
    expect(controller.multiView?.activeTile ?? 0).toBe(0);
  });

  it('focuses the active secondary and uses its real progress, seek, pause and quality controls', async () => {
    await enter(); await add(1); await add(2);
    const original = surfaces();
    const seek = jest.fn();
    await act(async () => {
      original[1].props.registerSeekHandler(seek);
      original[1].props.onProgress({currentTime: 20, seekableDuration: 60, seekableStart: 0, seekableEnd: 60});
      original[1].props.onVideoTracks([{id: 'auto', label: 'Auto'}, {id: '144', label: '144p', height: 144}]);
      button('select-1').props.onPress();
    });
    await key('left');
    await openActiveControls();
    expect(renderer.root.findByType((PlayerTopInfo as any).type).props.item).toBe(channels[1]);
    let panel = renderer.root.findByType((PlayerBottomControls as any).type);
    expect(panel.props.currentTime).toBe(20);
    expect(renderer.root.findAllByProps({testID: 'multiview-button'})).toHaveLength(0);
    expect(controller.multiView?.audioTile).toBe(1);
    await act(async () => panel.props.onSeek(40));
    expect(seek).toHaveBeenCalledWith(40);
    await act(async () => panel.props.onTogglePlayPause());
    expect(original[1].props.paused).toBe(true);
    expect(original[0].props.paused).toBe(false);
    expect(original[2].props.paused).toBe(false);
    panel = renderer.root.findByType((PlayerBottomControls as any).type);
    expect(panel.props.paused).toBe(true);
    await act(async () => panel.props.onOpenQuality());
    await act(async () => renderer.root.findByType((QualityDialog as any).type).props.onSelectQuality('144'));
    expect(original[1].props.selectedQualityId).toBe('144');
    expect(original[0].props.selectedQualityId).toBe('auto');
    expect(surfaces()).toEqual(original);
    expect(mockUnmount).not.toHaveBeenCalled();
  });

  it('returns from active controls to the toolbar and small videos without opening a picker', async () => {
    await enter(); await add(1); await add(2);
    await key('up');
    await openActiveControls();
    expect(renderer.root.findAllByType((PlayerBottomControls as any).type)).toHaveLength(1);
    await key('down');
    expect(renderer.root.findAllByType((PlayerBottomControls as any).type)).toHaveLength(0);
    expect(button('fullscreen').props.focusable).toBe(true);
    await key('up');
    await openActiveControls();
    await act(async () => renderer.root.findByType((PlayerBottomControls as any).type).props.onFocusControl('timeline'));
    await key('up');
    expect(renderer.root.findAllByType((PlayerBottomControls as any).type)).toHaveLength(0);
    expect(controller.multiView?.audioTile).toBe(1);
    expect(renderer.root.findAllByProps({testID: 'live-channel-drawer'})).toHaveLength(0);
  });

  it('hides active panels after inactivity and reveals them without activating a control or changing tiles', async () => {
    await enter(); await add(1);
    await key('left');
    await openActiveControls();
    const original = surfaces();
    expect(renderer.root.findAllByType((PlayerBottomControls as any).type)).toHaveLength(1);
    await act(async () => jest.advanceTimersByTime(4500));
    expect(renderer.root.findAllByType((PlayerBottomControls as any).type)).toHaveLength(0);
    expect(button('active-activator').props.focusable).toBe(true);
    expect(button('fullscreen')).toBeDefined();
    await key('right'); // Return to the small column without opening controls.
    await key('left');
    expect(renderer.root.findAllByType((PlayerBottomControls as any).type)).toHaveLength(0);
    await key('select'); // Select reveals only; remain on the main video.
    expect(renderer.root.findAllByType((PlayerBottomControls as any).type)).toHaveLength(1);
    expect(button('fullscreen').props.focusable).toBe(false);
    await act(async () => renderer.root.findByType((PlayerBottomControls as any).type).props.onTogglePlayPause());
    expect(surfaces()[0].props.paused).toBe(false);
    await act(async () => jest.advanceTimersByTime(400));
    await act(async () => renderer.root.findByType((PlayerBottomControls as any).type).props.onTogglePlayPause());
    expect(surfaces()[0].props.paused).toBe(true);
    expect(surfaces()).toEqual(original);
    expect(mockUnmount).not.toHaveBeenCalled();
  });

  it('resets the active panel timeout on remote activity and suspends it for dialogs', async () => {
    await enter(); await add(1); await key('left');
    await openActiveControls();
    await act(async () => jest.advanceTimersByTime(3000));
    await key('right');
    await act(async () => jest.advanceTimersByTime(3000));
    expect(renderer.root.findAllByType((PlayerBottomControls as any).type)).toHaveLength(1);
    await act(async () => renderer.root.findByType((PlayerBottomControls as any).type).props.onOpenQuality());
    await act(async () => jest.advanceTimersByTime(6000));
    expect(renderer.root.findAllByType((QualityDialog as any).type)).toHaveLength(1);
    await act(async () => renderer.root.findByType((QualityDialog as any).type).props.onClose());
    expect(renderer.root.findAllByType((PlayerBottomControls as any).type)).toHaveLength(1);
    await act(async () => jest.advanceTimersByTime(4500));
    expect(renderer.root.findAllByType((PlayerBottomControls as any).type)).toHaveLength(0);
  });

  it('keeps a solid placeholder until the first video frame arrives', async () => {
    await enter();
    await act(async () => controller.setMultiViewChannel(channels[1], streams[1], 1));
    expect(renderer.root.findAllByProps({testID: 'multiview-placeholder-1'}).length).toBeGreaterThan(0);
    await act(async () => surfaces()[1].props.onFirstFrame());
    expect(renderer.root.findAllByProps({testID: 'multiview-placeholder-1'})).toHaveLength(0);
  });

  it('removes either tile and returns to a single player when one channel remains', async () => {
    await enter();
    await add(1);
    await act(async () => button('remove').props.onPress());
    expect(controller.item).toBe(channels[1]);
    expect(controller.presentation).toBe('fullscreen');
    expect(surfaces()).toHaveLength(1);
  });

  it('keeps audio and the active channel when removing an earlier inactive tile', async () => {
    await enter(); await add(1); await add(2); await add(3);
    await key('down'); await key('down');
    await act(async () => button('focus').props.onPress());
    await act(async () => controller.removeMultiViewChannel(1));
    expect(controller.multiView?.activeTile).toBe(2);
    expect(controller.multiView?.audioTile).toBe(2);
    expect(surfaces().map(node => node.props.isMuted)).toEqual([true, true, false]);
  });

  it.each([0, 2])('focuses and unmutes the main player after removing active tile %i', async removed => {
    await enter(); await add(1); await add(2); await add(3);
    if (removed) await act(async () => button(`select-${removed}`).props.onPress());
    else await key('left');
    await key('down');
    expect(button('remove').props.focusable).toBe(false);
    const original = surfaces();
    await act(async () => button('remove').props.onPress());
    expect(controller.multiView?.activeTile ?? 0).toBe(0);
    expect(controller.multiView?.audioTile).toBe(0);
    expect(button('active-activator').props.focusable).toBe(true);
    expect(renderer.root.findAllByType((PlayerBottomControls as any).type)).toHaveLength(0);
    expect(surfaces()[0]).toBe(original[removed === 0 ? 1 : 0]);
    expect(surfaces().map(node => node.props.isMuted)).toEqual([false, true, true]);
    expect(resolveLiveChannelStream).not.toHaveBeenCalled();
  });

  it('activates a clicked small video and ignores a click on the large video', async () => {
    await enter(); await add(1); await add(2);
    await act(async () => button('select-2').props.onPress());
    expect(controller.multiView?.activeTile).toBe(2);
    expect(button('active-activator').props.accessibilityLabel).toBe('Channel 2');
    expect(controller.multiView?.audioTile).toBe(2);
    expect(renderer.root.findAllByType((PlayerBottomControls as any).type)).toHaveLength(0);
    await act(async () => button('select-2').props.onPress());
    expect(controller.presentation).toBe('multi-tile');
    expect(controller.multiView?.activeTile).toBe(2);
    expect(button('fullscreen').props.accessibilityState.selected).toBe(false);
    expect(renderer.root.findAllByProps({testID: 'multiview-active-panels'}).length).toBeGreaterThan(0);
  });

  it('preserves every remaining decoder when removing the primary, including promotion to fullscreen', async () => {
    await enter(); await add(1); await add(2); await add(3);
    const original = surfaces();
    mockUnmount.mockClear(); mockMount.mockClear();
    await act(async () => controller.removeMultiViewChannel(0));
    expect(surfaces()).toEqual(original.slice(1));
    expect(controller.status).toBe('playing');
    expect(mockMount).not.toHaveBeenCalled();
    expect(mockUnmount.mock.calls.flat()).toEqual([streams[0].url]);
    await act(async () => controller.removeMultiViewChannel(0));
    expect(surfaces()).toEqual(original.slice(2));
    await act(async () => controller.removeMultiViewChannel(0));
    expect(surfaces()).toEqual([original[3]]);
    expect(original[3].props.preferSurfaceView).toBeUndefined();
    expect(controller.presentation).toBe('fullscreen');
    expect(controller.status).toBe('playing');
    expect(mockMount).not.toHaveBeenCalled();
    expect(mockUnmount).not.toHaveBeenCalledWith(streams[3].url);
    expect(resolveLiveChannelStream).not.toHaveBeenCalled();
  });

  it('promotes an existing secondary to fullscreen without reconnecting or waiting for another first frame', async () => {
    await enter(); await add(1);
    const playing = surfaces()[1];
    await act(async () => button('focus').props.onPress());
    mockMount.mockClear();
    await act(async () => button('fullscreen').props.onPress());
    expect(controller.presentation).toBe('fullscreen');
    expect(controller.status).toBe('playing');
    expect(surfaces()).toEqual([playing]);
    expect(mockMount).not.toHaveBeenCalled();
    expect(mockUnmount).not.toHaveBeenCalledWith(streams[1].url);
  });

  it('keeps codec policy and stream identity stable through repeated tile additions and removals', async () => {
    await enter(); await add(1);
    const firstTwo = surfaces();
    const budgets = firstTwo.map(node => node.props.maxBitRate);
    mockMount.mockClear(); mockUnmount.mockClear();
    await add(2); await add(3);
    expect(surfaces().slice(0, 2)).toEqual(firstTwo);
    expect(surfaces().slice(0, 2).map(node => node.props.maxBitRate)).toEqual(budgets);
    await act(async () => controller.removeMultiViewChannel(3));
    await act(async () => controller.removeMultiViewChannel(2));
    expect(surfaces()).toEqual(firstTwo);
    expect(surfaces().map(node => node.props.maxBitRate)).toEqual(budgets);
    expect(mockUnmount).not.toHaveBeenCalledWith(streams[0].url);
    expect(mockUnmount).not.toHaveBeenCalledWith(streams[1].url);
    expect(mockMount.mock.calls.flat()).toEqual([streams[2].url, streams[3].url]);
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
    await act(async () => button('add').props.onPress());
    jest
      .mocked(resolveLiveChannelStream)
      .mockRejectedValueOnce(new Error('offline'));
    await act(async () => drawer().props.onSelectChannel(channels[1]));
    expect(drawer().props.error).toBeTruthy();
    expect(controller.stream).toBe(streams[0]);
  });

  it('retries a nonplaying extra tile and releases it after bounded failures', async () => {
    await enter();
    await act(async () =>
      controller.setMultiViewChannel(channels[1], streams[1]),
    );
    jest.mocked(resolveLiveChannelStream).mockRejectedValue(new Error('offline'));
    // Keep the primary healthy while the extra tile exhausts its five retries.
    for (let second = 1; second <= 40; second++) {
      await act(async () => {
        surfaces()[0].props.onProgress({currentTime: second, seekableDuration: second + 3});
        jest.advanceTimersByTime(1000);
      });
    }
    expect(resolveLiveChannelStream).toHaveBeenCalledTimes(5);
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
      renderer.root.findAllByProps({ testID: 'multiview-fullscreen' }).length,
    ).toBeGreaterThan(0);
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
      expect(layouts[0].top).toBe(8);
      expect(Number(layouts[0].height)).toBe(count === 2 ? 524 : 261);
    }
  });
});
