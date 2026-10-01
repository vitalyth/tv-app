import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { BackHandler } from 'react-native';
import { FullScreenPlayer } from '../src/components/player/FullScreenPlayer';
import {
  MediaControllerProvider,
  useMediaActions,
} from '../src/media/MediaController';
import type { MediaItem, MediaStream } from '../src/media/player';
import { WatchProgressService } from '../src/services/watchProgress';

jest.mock('../src/components/RemoteImage', () => ({
  RemoteImage: () => 'RemoteImage',
}));

describe('FullScreenPlayer', () => {
  let backPressHandler: (() => boolean) | null = null;
  let activeRenderer: ReactTestRenderer.ReactTestRenderer | null = null;

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
  });

  const mockLiveItem: MediaItem = {
    id: 'ch-11',
    kind: 'live',
    title: 'חדשות הערב',
    channelName: 'כאן 11',
    timeRange: '20:00 – 21:00',
    progressPercentage: 45,
    description: 'מהדורת החדשות המרכזית של כאן 11',
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
    expect(textContents).toContain('מקורות');
    expect(textContents).toContain('צפייה מפוצלת');
  });

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
    expect(textContents).not.toContain('מקורות');
    expect(textContents).not.toContain('צפייה מפוצלת');
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

  it('opens and closes Other Sources placeholder dialog', async () => {
    const onExit = jest.fn();

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
    expect(textContents).toContain('מקורות נוספים');

    // Close dialog
    await act(async () => {
      backPressHandler?.();
    });
    expect(root.findAllByProps({ testID: 'player-dialog-card' }).length).toBe(0);
  });

  it('opens and closes Multi View placeholder dialog', async () => {
    const onExit = jest.fn();

    await act(async () => {
      activeRenderer = ReactTestRenderer.create(
        <MediaControllerProvider>
          <PlayerTestHarness item={mockLiveItem} onExit={onExit} />
        </MediaControllerProvider>,
      );
    });

    const root = activeRenderer!.root;
    const multiviewButton = root.findByProps({ testID: 'multiview-button' });

    await act(async () => {
      multiviewButton.props.onPress();
    });

    expect(root.findByProps({ testID: 'player-dialog-card' })).toBeDefined();
    const textNodes = root.findAllByType('Text' as any);
    const textContents = textNodes.map(node => node.props.children).flat();
    expect(textContents).toContain('צפייה מפוצלת');

    // Close dialog
    await act(async () => {
      backPressHandler?.();
    });
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
