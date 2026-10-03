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
import { SourceDialog } from '../src/components/player/SourceDialog';
import { t } from '../src/i18n';

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
    expect(textContents).toContain(t('playerMultiView'));

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
