import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { BackHandler, Image, useTVEventHandler } from 'react-native';
import { FullScreenPlayer } from '../src/components/player/FullScreenPlayer';
import {
  MediaControllerProvider,
  useMediaActions,
  useMediaController,
} from '../src/media/MediaController';
import type { MediaItem, MediaStream } from '../src/media/player';
import { WatchProgressService } from '../src/services/watchProgress';
import { SourceDialog } from '../src/components/player/SourceDialog';
import { t } from '../src/i18n';
import * as channelApi from '../src/api/channels';
import { tvPlatform } from '../src/platform/runtime';

jest.mock('react-native/Libraries/Components/TV/useTVEventHandler', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../src/components/RemoteImage', () => ({
  RemoteImage: () => 'RemoteImage',
}));

describe('FullScreenPlayer', () => {
  let backPressHandler: (() => boolean) | null = null;
  let activeRenderer: ReactTestRenderer.ReactTestRenderer | null = null;
  const channelDrawer = () => activeRenderer!.root.find(node =>
    typeof node.props.onSelectChannel === 'function' && typeof node.props.loadChannels === 'function');

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation(
      (event, handler) => {
        if (event === 'hardwareBackPress') {
          backPressHandler = handler as () => boolean;
        }
        return { remove: jest.fn() };
      },
    );
  });

  afterEach(async () => {
    if (activeRenderer) {
      await act(async () => {
        activeRenderer?.unmount();
      });
      activeRenderer = null;
    }
    jest.restoreAllMocks();
  });

  const mockLiveItem: MediaItem = {
    id: 'ch-11',
    kind: 'live',
    title: 'חדשות הערב',
    channelName: 'כאן 11',
    timeRange: '20:00 – 21:00',
    progressPercentage: 45,
    description: 'מהדורת החדשות המרכזית של כאן 11',
    sourcePayload: {
      id: 'ch-11',
      name: 'כאן 11',
      linkDetails: { link: 'https://example.com/primary.m3u8' },
      sources: [
        {
          id: 'ch-11',
          name: 'כאן 11',
          linkDetails: { link: 'https://example.com/primary.m3u8' },
        },
        {
          id: 'ch-11-backup',
          name: 'כאן 11 - גיבוי',
          linkDetails: { link: 'https://example.com/backup.m3u8' },
        },
      ],
    },
  };

  const mockVodItem: MediaItem = {
    id: 'vod-1',
    kind: 'vod',
    title: 'קופה ראשית',
    seasonName: 'עונה 4',
    episodeName: 'פרק 3',
    description: 'קומדיה ישראלית על עובדי סופרמרקט',
  };

  const mockStream: MediaStream = {
    url: 'https://example.com/stream.m3u8',
    type: 'm3u8',
  };

  const channelList: MediaItem[] = [
    mockLiveItem,
    { id: 'ch-12', kind: 'live', title: 'Channel 12', channelName: 'Keshet', channelNumber: '12' },
    { id: 'ch-13', kind: 'live', title: 'Channel 13', channelName: 'Reshet', channelNumber: '13' },
  ];

  async function mountHiddenPlayer(mediaItem = mockLiveItem) {
    let controller!: ReturnType<typeof useMediaController>;
    function Probe() { controller = useMediaController(); return null; }
    await act(async () => {
      activeRenderer = ReactTestRenderer.create(
        <MediaControllerProvider><Probe /><PlayerTestHarness item={mediaItem} onExit={jest.fn()} /></MediaControllerProvider>,
      );
    });
    await act(async () => { backPressHandler?.(); });
    return {
      controller: () => controller,
      handler: jest.mocked(useTVEventHandler).mock.lastCall![0],
    };
  }

  it.each([
    ['up', 1], ['down', 2],
  ] as const)('switches hidden live playback with %s without revealing panels', async (eventType, targetIndex) => {
    const channels = jest.spyOn(channelApi, 'getPlayableLiveChannels').mockResolvedValue(channelList);
    const resolve = jest.spyOn(channelApi, 'resolveLiveChannelStream').mockResolvedValue({ url: 'https://example.com/next.m3u8' });
    const player = await mountHiddenPlayer();
    await act(async () => { player.handler({ eventType, eventKeyAction: 0 }); });
    expect(resolve).toHaveBeenCalledWith(channelList[targetIndex]);
    expect(player.controller().item).toBe(channelList[targetIndex]);
    expect(player.controller().isFullscreen).toBe(true);
    expect(activeRenderer!.root.findByProps({ testID: 'player-top-panel' })).toBeDefined();
    expect(activeRenderer!.root.findAllByProps({ testID: 'quality-button' })).toHaveLength(0);
    await act(async () => { player.handler({ eventType, eventKeyAction: 1 }); });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(channels).toHaveBeenCalledTimes(1);
  });

  it('keeps the latest channel selection when earlier resolution finishes later', async () => {
    jest.spyOn(channelApi, 'getPlayableLiveChannels').mockResolvedValue(channelList);
    let finishFirst!: (stream: MediaStream) => void;
    const resolve = jest.spyOn(channelApi, 'resolveLiveChannelStream')
      .mockImplementationOnce(() => new Promise<MediaStream>(done => { finishFirst = done; }))
      .mockResolvedValueOnce({ url: 'https://example.com/latest.m3u8' });
    const player = await mountHiddenPlayer();
    await act(async () => { player.handler({ eventType: 'up', eventKeyAction: 0 }); });
    await act(async () => { player.handler({ eventType: 'up', eventKeyAction: 0 }); });
    expect(resolve.mock.calls.map(call => call[0].id)).toEqual(['ch-12', 'ch-13']);
    expect(player.controller().item?.id).toBe('ch-13');
    await act(async () => { finishFirst({ url: 'https://example.com/stale.m3u8' }); });
    expect(player.controller().item?.id).toBe('ch-13');
    expect(player.controller().stream?.url).toBe('https://example.com/latest.m3u8');
  });

  it('shows only the selected channel info during resolution and resets its auto-hide timer on another switch', async () => {
    jest.useFakeTimers();
    try {
      jest.spyOn(channelApi, 'getPlayableLiveChannels').mockResolvedValue(channelList);
      let finish!: (stream: MediaStream) => void;
      jest.spyOn(channelApi, 'resolveLiveChannelStream')
        .mockImplementationOnce(() => new Promise<MediaStream>(done => { finish = done; }))
        .mockResolvedValueOnce({ url: 'https://example.com/third.m3u8' });
      const player = await mountHiddenPlayer();
      await act(async () => { player.handler({ eventType: 'up', eventKeyAction: 0 }); });
      const top = () => activeRenderer!.root.findAllByProps({ testID: 'player-top-panel' });
      expect(top()[0].findAllByType('Text' as any).some(node => node.props.children === 'Channel 12')).toBe(true);
      expect(player.controller().item).toBe(mockLiveItem);
      expect(activeRenderer!.root.findAllByProps({ testID: 'quality-button' })).toHaveLength(0);
      await act(async () => { jest.advanceTimersByTime(6000); });
      expect(top().length).toBeGreaterThan(0);
      await act(async () => { finish({ url: 'https://example.com/second.m3u8' }); });
      await act(async () => { jest.advanceTimersByTime(4000); });
      expect(top().length).toBeGreaterThan(0);
      await act(async () => { player.handler({ eventType: 'up', eventKeyAction: 0 }); });
      await act(async () => { jest.advanceTimersByTime(1000); });
      expect(top().length).toBeGreaterThan(0);
      expect(top()[0].findAllByType('Text' as any).some(node => node.props.children === 'Channel 13')).toBe(true);
      await act(async () => { jest.advanceTimersByTime(3500); });
      expect(top()).toHaveLength(0);
      expect(activeRenderer!.root.findAllByProps({ testID: 'quality-button' })).toHaveLength(0);
    } finally {
      await act(async () => { activeRenderer?.unmount(); });
      activeRenderer = null;
      jest.useRealTimers();
    }
  });

  it('preserves the current stream if channel switching fails and retries from that channel', async () => {
    jest.spyOn(channelApi, 'getPlayableLiveChannels').mockResolvedValue(channelList);
    const resolve = jest.spyOn(channelApi, 'resolveLiveChannelStream')
      .mockRejectedValueOnce(new Error('Unavailable'))
      .mockResolvedValueOnce({ url: 'https://example.com/previous.m3u8' });
    const player = await mountHiddenPlayer();
    await act(async () => { player.controller().markPlaying(); });
    await act(async () => { player.handler({ eventType: 'up', eventKeyAction: 0 }); });
    expect(player.controller().item).toBe(mockLiveItem);
    expect(player.controller().stream).toBe(mockStream);
    expect(activeRenderer!.root.findAllByProps({ testID: 'player-loading' })).toHaveLength(0);
    await act(async () => { player.handler({ eventType: 'down', eventKeyAction: 0 }); });
    expect(resolve).toHaveBeenLastCalledWith(channelList[2]);
  });

  it('shows loading through channel resolution and startup, then hides it on playback or error', async () => {
    jest.spyOn(channelApi, 'getPlayableLiveChannels').mockResolvedValue(channelList);
    let finish!: (stream: MediaStream) => void;
    jest.spyOn(channelApi, 'resolveLiveChannelStream')
      .mockImplementationOnce(() => new Promise<MediaStream>(done => { finish = done; }))
      .mockResolvedValueOnce({ url: 'https://example.com/third.m3u8' });
    const player = await mountHiddenPlayer();
    const loading = () => activeRenderer!.root.findAllByProps({ testID: 'player-loading' });
    await act(async () => { player.controller().markPlaying(); });
    expect(loading()).toHaveLength(0);
    await act(async () => { player.handler({ eventType: 'up', eventKeyAction: 0 }); });
    expect(player.controller().status).toBe('playing');
    expect(loading().length).toBeGreaterThan(0);
    await act(async () => { finish({ url: 'https://example.com/second.m3u8' }); });
    expect(player.controller().status).toBe('loading');
    expect(loading().length).toBeGreaterThan(0);
    expect(activeRenderer!.root.findAllByProps({ testID: 'quality-button' })).toHaveLength(0);
    await act(async () => { player.controller().markPlaying(); });
    expect(loading()).toHaveLength(0);
    await act(async () => { player.controller().setPaused(true); });
    expect(loading()).toHaveLength(0);
    await act(async () => { player.handler({ eventType: 'up', eventKeyAction: 0 }); });
    expect(loading().length).toBeGreaterThan(0);
    // Keep automatic live recovery from hiding the terminal error transition.
    jest.mocked(channelApi.resolveLiveChannelStream).mockRejectedValue(new Error('Unavailable'));
    await act(async () => { player.controller().markError(); });
    expect(loading()).toHaveLength(0);
  });

  it('does not change channels when controls are visible or when playing VOD', async () => {
    const channels = jest.spyOn(channelApi, 'getPlayableLiveChannels').mockResolvedValue(channelList);
    const player = await mountHiddenPlayer();
    await act(async () => { player.handler({ eventType: 'right', eventKeyAction: 0 }); });
    const visibleHandler = jest.mocked(useTVEventHandler).mock.calls.at(-2)![0];
    await act(async () => { visibleHandler({ eventType: 'up', eventKeyAction: 0 }); });
    expect(channels).not.toHaveBeenCalled();
    await act(async () => { activeRenderer?.unmount(); });
    const vod = await mountHiddenPlayer(mockVodItem);
    await act(async () => { vod.handler({ eventType: 'down', eventKeyAction: 0 }); });
    expect(channels).not.toHaveBeenCalled();
    expect(activeRenderer!.root.findByProps({ testID: 'quality-button' })).toBeDefined();
  });

  it('opens all live channels with Left without reconnecting or showing the player panels', async () => {
    const channels = jest.spyOn(channelApi, 'getPlayableLiveChannels').mockResolvedValue(channelList);
    const resolve = jest.spyOn(channelApi, 'resolveLiveChannelStream').mockResolvedValue(mockStream);
    const player = await mountHiddenPlayer();
    await act(async () => player.handler({ eventType: 'left', eventKeyAction: 1 }));
    expect(channels).not.toHaveBeenCalled();
    const callCount = jest.mocked(useTVEventHandler).mock.calls.length;
    await act(async () => player.handler({ eventType: 'left', eventKeyAction: 0 }));
    expect(channelDrawer()).toBeDefined();
    expect(channels).toHaveBeenCalledTimes(1);
    expect(resolve).not.toHaveBeenCalled();
    expect(player.controller().stream).toBe(mockStream);
    expect(activeRenderer!.root.findAllByProps({ testID: 'quality-button' })).toHaveLength(0);
    const parentHandler = jest.mocked(useTVEventHandler).mock.calls[callCount][0];
    await act(async () => parentHandler({ eventType: 'up', eventKeyAction: 0 }));
    expect(resolve).not.toHaveBeenCalled();
    await act(async () => parentHandler({ eventType: 'right', eventKeyAction: 0 }));
    expect(activeRenderer!.root.findAllByProps({ testID: 'live-channel-drawer' })).toHaveLength(0);
    expect(activeRenderer!.root.findAllByProps({ testID: 'quality-button' })).toHaveLength(0);
  });

  it('selects a channel from the drawer using the existing fullscreen player', async () => {
    jest.spyOn(channelApi, 'getPlayableLiveChannels').mockResolvedValue(channelList);
    const resolve = jest.spyOn(channelApi, 'resolveLiveChannelStream').mockResolvedValue({ url: 'https://example.com/ch12.m3u8' });
    const player = await mountHiddenPlayer();
    await act(async () => player.handler({ eventType: 'left', eventKeyAction: 0 }));
    await act(async () => channelDrawer().props.onSelectChannel(channelList[1]));
    expect(resolve).toHaveBeenCalledWith(channelList[1]);
    expect(player.controller().item).toBe(channelList[1]);
    expect(player.controller().isFullscreen).toBe(true);
    expect(activeRenderer!.root.findAllByProps({ testID: 'live-channel-drawer' })).toHaveLength(0);
    expect(activeRenderer!.root.findAllByProps({ testID: 'quality-button' })).toHaveLength(0);
  });

  it('selecting the currently playing channel keeps the same stream and paused state', async () => {
    jest.spyOn(channelApi, 'getPlayableLiveChannels').mockResolvedValue(channelList);
    const resolve = jest.spyOn(channelApi, 'resolveLiveChannelStream').mockResolvedValue(mockStream);
    const player = await mountHiddenPlayer();
    await act(async () => player.controller().setPaused(true));
    await act(async () => player.handler({ eventType: 'left', eventKeyAction: 0 }));
    await act(async () => channelDrawer().props.onSelectChannel(channelList[0]));
    expect(resolve).not.toHaveBeenCalled();
    expect(player.controller().stream).toBe(mockStream);
    expect(player.controller().paused).toBe(true);
  });

  it('keeps playback and the drawer available if the selected channel fails', async () => {
    jest.spyOn(channelApi, 'getPlayableLiveChannels').mockResolvedValue(channelList);
    jest.spyOn(channelApi, 'resolveLiveChannelStream').mockRejectedValue(new Error('Unavailable'));
    const player = await mountHiddenPlayer();
    await act(async () => player.handler({ eventType: 'left', eventKeyAction: 0 }));
    await act(async () => channelDrawer().props.onSelectChannel(channelList[1]));
    expect(player.controller().stream).toBe(mockStream);
    expect(player.controller().item).toBe(mockLiveItem);
    expect(channelDrawer().props.error).toBe(t('playerChannelUnavailable'));
  });

  it('Back closes the drawer and cancels pending selection without showing panels', async () => {
    jest.spyOn(channelApi, 'getPlayableLiveChannels').mockResolvedValue(channelList);
    let finish!: (stream: MediaStream) => void;
    jest.spyOn(channelApi, 'resolveLiveChannelStream').mockImplementation(() => new Promise(done => { finish = done; }));
    const player = await mountHiddenPlayer();
    await act(async () => player.handler({ eventType: 'left', eventKeyAction: 0 }));
    let pending!: Promise<void>;
    await act(async () => { pending = channelDrawer().props.onSelectChannel(channelList[1]); });
    await act(async () => { backPressHandler?.(); });
    await act(async () => { finish({ url: 'https://example.com/stale.m3u8' }); await pending; });
    expect(player.controller().item).toBe(mockLiveItem);
    expect(player.controller().stream).toBe(mockStream);
    expect(activeRenderer!.root.findAllByProps({ testID: 'live-channel-drawer' })).toHaveLength(0);
    expect(activeRenderer!.root.findAllByProps({ testID: 'quality-button' })).toHaveLength(0);
  });

  it('closing immediately after selection keeps the next channel switch relative to the playing channel', async () => {
    jest.spyOn(channelApi, 'getPlayableLiveChannels').mockResolvedValue(channelList);
    const resolve = jest.spyOn(channelApi, 'resolveLiveChannelStream').mockResolvedValue(mockStream);
    const player = await mountHiddenPlayer();
    await act(async () => player.handler({ eventType: 'left', eventKeyAction: 0 }));
    const drawer = channelDrawer();
    await act(async () => {
      const pending = drawer.props.onSelectChannel(channelList[1]);
      drawer.props.onClose();
      await pending;
    });
    expect(resolve).not.toHaveBeenCalled();
    expect(player.controller().item).toBe(mockLiveItem);
    const handler = jest.mocked(useTVEventHandler).mock.lastCall![0];
    await act(async () => handler({ eventType: 'up', eventKeyAction: 0 }));
    expect(resolve).toHaveBeenLastCalledWith(channelList[1]);
  });

  it('does not open live channels when Left is pressed during VOD playback', async () => {
    const channels = jest.spyOn(channelApi, 'getPlayableLiveChannels').mockResolvedValue(channelList);
    const player = await mountHiddenPlayer(mockVodItem);
    await act(async () => player.handler({ eventType: 'left', eventKeyAction: 0 }));
    expect(channels).not.toHaveBeenCalled();
    expect(activeRenderer!.root.findAllByProps({ testID: 'live-channel-drawer' })).toHaveLength(0);
    expect(activeRenderer!.root.findByProps({ testID: 'quality-button' })).toBeDefined();
  });

  it('ignores a pending channel switch after leaving the player', async () => {
    jest.spyOn(channelApi, 'getPlayableLiveChannels').mockResolvedValue(channelList);
    let finish!: (stream: MediaStream) => void;
    jest.spyOn(channelApi, 'resolveLiveChannelStream').mockImplementation(() => new Promise<MediaStream>(done => { finish = done; }));
    const player = await mountHiddenPlayer();
    await act(async () => { player.handler({ eventType: 'up', eventKeyAction: 0 }); });
    await act(async () => { activeRenderer?.unmount(); });
    activeRenderer = null;
    await act(async () => { finish({ url: 'https://example.com/stale.m3u8' }); });
    expect(player.controller().item).toBe(mockLiveItem);
  });

  it('gives preferred focus only to the selected source', async () => {
    await act(async () => {
      activeRenderer = ReactTestRenderer.create(
        <SourceDialog
          sources={[
            { id: 'primary', label: 'ראשי', selected: false },
            { id: 'backup-1', label: 'גיבוי 1', selected: false },
            { id: 'backup-2', label: 'גיבוי 2', selected: true },
          ]}
          onSelectSource={jest.fn()}
        />,
      );
    });

    const sourceOptions = activeRenderer!.root.findAll(
      node => typeof node.props.testID === 'string' &&
        node.props.testID.startsWith('source-option-'),
    );
    const preferredSourceIds = new Set(
      sourceOptions
        .filter(node => node.props.hasTVPreferredFocus)
        .map(node => node.props.testID),
    );
    expect([...preferredSourceIds]).toEqual(['source-option-backup-2']);
    expect(
      activeRenderer!.root.findByProps({ testID: 'source-option-backup-2' })
        .props.hasTVPreferredFocus,
    ).toBe(true);
  });

  function PlayerTestHarness({
    item,
    onExit,
  }: {
    item: MediaItem;
    onExit: () => void;
  }) {
    const { playFullscreen } = useMediaActions();

    React.useEffect(() => {
      playFullscreen(item, mockStream);
    }, [item, playFullscreen]);

    return <FullScreenPlayer onExit={onExit} />;
  }

  it('renews a failed live source without exiting fullscreen and limits retries', async () => {
    let controller!: ReturnType<typeof useMediaController>;
    function Probe() {
      controller = useMediaController();
      return null;
    }
    const resolve = jest.spyOn(channelApi, 'resolveLiveChannelStream')
      .mockResolvedValueOnce({ ...mockStream, url: 'https://example.com/fresh-1.m3u8' })
      .mockResolvedValueOnce({ ...mockStream, url: 'https://example.com/fresh-2.m3u8' });
    try {
      await act(async () => {
        activeRenderer = ReactTestRenderer.create(
          <MediaControllerProvider>
            <Probe />
            <PlayerTestHarness item={mockLiveItem} onExit={jest.fn()} />
          </MediaControllerProvider>,
        );
      });
      await act(async () => controller.markError());
      expect(controller.stream?.url).toBe('https://example.com/fresh-1.m3u8');
      expect(controller.isFullscreen).toBe(true);
      await act(async () => controller.markError());
      expect(controller.stream?.url).toBe('https://example.com/fresh-2.m3u8');
      await act(async () => controller.markError());
      expect(resolve).toHaveBeenCalledTimes(2);
      expect(resolve).toHaveBeenCalledWith(mockLiveItem, { useSavedSource: false });
    } finally {
      resolve.mockRestore();
    }
  });

  it('renders LIVE player overlay with all required information and controls', async () => {
    const onExit = jest.fn();

    await act(async () => {
      activeRenderer = ReactTestRenderer.create(
        <MediaControllerProvider>
          <PlayerTestHarness item={mockLiveItem} onExit={onExit} />
        </MediaControllerProvider>,
      );
    });

    const root = activeRenderer!.root;
    const playerView = root.findByProps({ testID: 'fullscreen-player' });
    expect(playerView).toBeDefined();

    // Verify Title and Sub-info
    const textNodes = root.findAllByType('Text' as any);
    const textContents = textNodes.map(node => node.props.children).flat();

    expect(textContents).toContain('חדשות הערב');
    expect(textContents).toContain('20:00 – 21:00');
    expect(textContents).toContain('מהדורת החדשות המרכזית של כאן 11');
    expect(textContents).toContain('LIVE');
    expect(textContents).toContain(t('playerSources'));
    expect(textContents).toContain(t('playerMultiView'));
  });

  it.each(['playpause', 'playPause'])(
    'updates playback and the controls on each %s press, including with hidden panels',
    async eventType => {
      let controller!: ReturnType<typeof useMediaController>;
      function Probe() {
        controller = useMediaController();
        return null;
      }
      await act(async () => {
        activeRenderer = ReactTestRenderer.create(
          <MediaControllerProvider>
            <Probe />
            <PlayerTestHarness item={mockLiveItem} onExit={jest.fn()} />
          </MediaControllerProvider>,
        );
      });
      await act(async () => { backPressHandler?.(); });
      const handler = jest.mocked(useTVEventHandler).mock.lastCall![0];
      await act(async () => { handler({ eventType, eventKeyAction: 0 }); });
      expect(controller.paused).toBe(true);
      expect(activeRenderer!.root.findByProps({ testID: 'play-pause-button' }).findByType(Image).props.source)
        .toBe(require('../src/assets/icons/play.png'));
      await act(async () => { handler({ eventType, eventKeyAction: 1 }); });
      expect(controller.paused).toBe(true);
      await act(async () => { handler({ eventType, eventKeyAction: 0 }); });
      expect(controller.paused).toBe(false);
      expect(activeRenderer!.root.findByProps({ testID: 'play-pause-button' }).findByType(Image).props.source)
        .toBe(require('../src/assets/icons/pause.png'));
      expect(controller.stream).toBe(mockStream);
    },
  );

  it('handles explicit pause and play commands without toggling twice', async () => {
    let controller!: ReturnType<typeof useMediaController>;
    function Probe() {
      controller = useMediaController();
      return null;
    }
    await act(async () => {
      activeRenderer = ReactTestRenderer.create(
        <MediaControllerProvider>
          <Probe />
          <PlayerTestHarness item={mockLiveItem} onExit={jest.fn()} />
        </MediaControllerProvider>,
      );
    });
    await act(async () => { backPressHandler?.(); });
    const handler = jest.mocked(useTVEventHandler).mock.lastCall![0];
    for (const eventType of ['pause', 'pause', 'play', 'play']) {
      await act(async () => { handler({ eventType, eventKeyAction: 0 }); });
      expect(controller.paused).toBe(eventType === 'pause');
      expect(activeRenderer!.root.findByProps({ testID: 'play-pause-button' }).findByType(Image).props.source)
        .toBe(eventType === 'pause' ? require('../src/assets/icons/play.png') : require('../src/assets/icons/pause.png'));
    }
  });

  it('lets the Vega native media session handle playback and renders its reported state', async () => {
    const previousPlatform = tvPlatform.id;
    tvPlatform.id = 'kepler';
    try {
      let controller!: ReturnType<typeof useMediaController>;
      function Probe() { controller = useMediaController(); return null; }
      await act(async () => {
        activeRenderer = ReactTestRenderer.create(
          <MediaControllerProvider><Probe /><PlayerTestHarness item={mockLiveItem} onExit={jest.fn()} /></MediaControllerProvider>,
        );
      });
      await act(async () => { backPressHandler?.(); });
      const handler = jest.mocked(useTVEventHandler).mock.lastCall![0];
      await act(async () => { handler({ eventType: 'playpause', eventKeyAction: 0 }); });
      expect(controller.paused).toBe(false);
      await act(async () => { controller.setPaused(true); });
      expect(activeRenderer!.root.findByProps({ testID: 'play-pause-button' }).findByType(Image).props.source)
        .toBe(require('../src/assets/icons/play.png'));
      await act(async () => { handler({ eventType: 'playpause', eventKeyAction: 0 }); });
      expect(controller.paused).toBe(true);
      await act(async () => { controller.setPaused(false); });
      expect(activeRenderer!.root.findByProps({ testID: 'play-pause-button' }).findByType(Image).props.source)
        .toBe(require('../src/assets/icons/pause.png'));
    } finally {
      tvPlatform.id = previousPlatform;
    }
  });

  it.each(['volume_up', 'volume_down', 'mute', 'volumeUp', 'volumeDown', 'focus', 'blur', 'unknown'])(
    'keeps hidden panels closed for %s while allowing navigation to reveal them',
    async eventType => {
      await act(async () => {
        activeRenderer = ReactTestRenderer.create(
          <MediaControllerProvider>
            <PlayerTestHarness item={mockLiveItem} onExit={jest.fn()} />
          </MediaControllerProvider>,
        );
      });
      await act(async () => { backPressHandler?.(); });
      const handler = jest.mocked(useTVEventHandler).mock.lastCall![0];
      await act(async () => {
        handler({ eventType, eventKeyAction: 0 });
        handler({ eventType, eventKeyAction: 1 });
      });
      expect(activeRenderer!.root.findAllByProps({ testID: 'quality-button' })).toHaveLength(0);
      expect(activeRenderer!.root.findByProps({ testID: 'fullscreen-controls-activator' })).toBeDefined();
      await act(async () => { handler({ eventType: 'right', eventKeyAction: 0 }); });
      expect(activeRenderer!.root.findByProps({ testID: 'quality-button' })).toBeDefined();
    },
  );

  it.each(['volume_up', 'volume_down', 'mute', 'volumeUp', 'volumeDown', 'focus', 'blur', 'unknown'])(
    'does not extend the panels auto-hide timer for %s',
    async eventType => {
      jest.useFakeTimers();
      try {
        await act(async () => {
          activeRenderer = ReactTestRenderer.create(
            <MediaControllerProvider>
              <PlayerTestHarness item={mockLiveItem} onExit={jest.fn()} />
            </MediaControllerProvider>,
          );
        });
        // Reveal again so the latest registered remote handler belongs to the player.
        await act(async () => { backPressHandler?.(); });
        const handler = jest.mocked(useTVEventHandler).mock.lastCall![0];
        await act(async () => { handler({ eventType: 'right', eventKeyAction: 0 }); });
        await act(async () => { jest.advanceTimersByTime(4000); });
        await act(async () => { handler({ eventType, eventKeyAction: 0 }); });
        await act(async () => { jest.advanceTimersByTime(500); });
        expect(activeRenderer!.root.findAllByProps({ testID: 'quality-button' })).toHaveLength(0);
      } finally {
        await act(async () => { activeRenderer?.unmount(); });
        activeRenderer = null;
        jest.useRealTimers();
      }
    },
  );

  it('renders VOD player without Sources or Multi View buttons', async () => {
    const onExit = jest.fn();

    await act(async () => {
      activeRenderer = ReactTestRenderer.create(
        <MediaControllerProvider>
          <PlayerTestHarness item={mockVodItem} onExit={onExit} />
        </MediaControllerProvider>,
      );
    });

    const root = activeRenderer!.root;
    const textNodes = root.findAllByType('Text' as any);
    const textContents = textNodes.map(node => node.props.children).flat();

    expect(textContents).toContain('קופה ראשית');
    expect(textContents).toContain('עונה 4 • פרק 3');
    // Ensure LIVE-only controls are NOT present in VOD
    expect(textContents).not.toContain('LIVE');
    expect(textContents).not.toContain(t('playerSources'));
    expect(textContents).not.toContain(t('playerMultiView'));
  });

  it('hides the Sources button for a live channel with no alternatives', async () => {
    const singleSourceItem: MediaItem = {
      ...mockLiveItem,
      id: 'ch-9',
      channelName: 'ערוץ 9',
      sourcePayload: {
        id: 'ch-9',
        name: 'ערוץ 9',
        sources: [{ id: 'ch-9', name: 'ערוץ 9' }],
      },
    };

    await act(async () => {
      activeRenderer = ReactTestRenderer.create(
        <MediaControllerProvider>
          <PlayerTestHarness item={singleSourceItem} onExit={jest.fn()} />
        </MediaControllerProvider>,
      );
    });

    expect(
      activeRenderer!.root.findAllByProps({ testID: 'sources-button' }),
    ).toHaveLength(0);
    expect(
      activeRenderer!.root.findByProps({ testID: 'multiview-button' }),
    ).toBeDefined();
  });

  it('implements 3-tier Back key hierarchy: Dialog -> Controls -> Exit', async () => {
    const onExit = jest.fn();

    await act(async () => {
      activeRenderer = ReactTestRenderer.create(
        <MediaControllerProvider>
          <PlayerTestHarness item={mockLiveItem} onExit={onExit} />
        </MediaControllerProvider>,
      );
    });

    const root = activeRenderer!.root;

    // 1. Open Quality Dialog using testID
    const qualityButton = root.findByProps({ testID: 'quality-button' });
    expect(qualityButton).toBeDefined();

    await act(async () => {
      qualityButton.props.onPress();
    });

    // Verify dialog is open
    expect(root.findByProps({ testID: 'player-dialog-card' })).toBeDefined();

    // First Back: Closes dialog, player stays open
    await act(async () => {
      const handled = backPressHandler?.();
      expect(handled).toBe(true);
    });
    expect(root.findAllByProps({ testID: 'player-dialog-card' }).length).toBe(0);
    expect(onExit).not.toHaveBeenCalled();

    // Second Back: Hides controls, player stays open
    await act(async () => {
      const handled = backPressHandler?.();
      expect(handled).toBe(true);
    });
    expect(onExit).not.toHaveBeenCalled();

    // Third Back: Exits full screen player
    await act(async () => {
      const handled = backPressHandler?.();
      expect(handled).toBe(true);
    });
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('opens the source picker and switches to the selected live source', async () => {
    const onExit = jest.fn();
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ stream: 'https://example.com/resolved-backup.m3u8' }),
    } as Response);

    await act(async () => {
      activeRenderer = ReactTestRenderer.create(
        <MediaControllerProvider>
          <PlayerTestHarness item={mockLiveItem} onExit={onExit} />
        </MediaControllerProvider>,
      );
    });

    const root = activeRenderer!.root;
    const sourcesButton = root.findByProps({ testID: 'sources-button' });

    await act(async () => {
      sourcesButton.props.onPress();
    });

    expect(root.findByProps({ testID: 'player-dialog-card' })).toBeDefined();
    const textNodes = root.findAllByType('Text' as any);
    const textContents = textNodes.map(node => node.props.children).flat();
    expect(textContents).toContain(t('playerSourceDialogTitle'));
    expect(textContents).toContain('כאן 11 - גיבוי');
    expect(textContents).toContain(t('playerSourceActive'));
    expect(textContents).toContain(t('playerSourceAvailable'));

    await act(async () => {
      root.findByProps({ testID: 'source-option-ch-11-backup' }).props.onPress();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/live_channel'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('ch-11-backup'),
      }),
    );
    expect(root.findAllByProps({ testID: 'player-dialog-card' }).length).toBe(0);
  });

  it('reveals player panels on the first press and opens a dialog on the second', async () => {
    const onExit = jest.fn();
    let now = 1_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    await act(async () => {
      activeRenderer = ReactTestRenderer.create(
        <MediaControllerProvider>
          <PlayerTestHarness item={mockLiveItem} onExit={onExit} />
        </MediaControllerProvider>,
      );
    });

    const root = activeRenderer!.root;
    await act(async () => {
      backPressHandler?.();
    });

    await act(async () => {
      root
        .findByProps({ testID: 'fullscreen-controls-activator' })
        .props.onPress();
    });
    await act(async () => {
      root.findByProps({ testID: 'sources-button' }).props.onPress();
    });
    expect(root.findAllByProps({ testID: 'player-dialog-card' })).toHaveLength(0);

    now += 600;
    await act(async () => {
      root.findByProps({ testID: 'sources-button' }).props.onPress();
    });
    expect(root.findByProps({ testID: 'player-dialog-card' })).toBeDefined();
  });

  it('opens Multi View through the shared media controller without a placeholder', async () => {
    const onExit = jest.fn();
    let controller!: ReturnType<typeof useMediaController>;
    function Probe() { controller = useMediaController(); return null; }

    await act(async () => {
      activeRenderer = ReactTestRenderer.create(
        <MediaControllerProvider>
          <Probe />
          <PlayerTestHarness item={mockLiveItem} onExit={onExit} />
        </MediaControllerProvider>,
      );
    });

    const root = activeRenderer!.root;
    const multiviewButton = root.findByProps({ testID: 'multiview-button' });

    await act(async () => {
      multiviewButton.props.onPress();
    });

    expect(controller.presentation).toBe('multi-tile');
    expect(controller.multiView).toEqual({ tiles: [], audioTile: 0 });
    expect(controller.item).toBe(mockLiveItem);
    expect(controller.stream).toBe(mockStream);
    expect(root.findAllByProps({ testID: 'player-dialog-card' }).length).toBe(0);
  });

  it('saves VOD watch progress when exiting player', async () => {
    const saveSpy = jest.spyOn(WatchProgressService, 'saveProgress');
    const onExit = jest.fn();

    function VodProgressTestHarness() {
      const { playFullscreen, updateProgress } = useMediaActions();

      React.useEffect(() => {
        playFullscreen(mockVodItem, mockStream);
        updateProgress(120, 1800);
      }, [playFullscreen, updateProgress]);

      return <FullScreenPlayer onExit={onExit} />;
    }

    await act(async () => {
      activeRenderer = ReactTestRenderer.create(
        <MediaControllerProvider>
          <VodProgressTestHarness />
        </MediaControllerProvider>,
      );
    });

    // Hide controls
    await act(async () => {
      backPressHandler?.();
    });

    // Exit
    await act(async () => {
      backPressHandler?.();
    });

    expect(saveSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        episodeId: '1',
        title: 'קופה ראשית',
        positionMs: 120000,
        durationMs: 1800000,
      }),
    );
  });
});
