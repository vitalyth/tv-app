import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { BackHandler, TextInput } from 'react-native';
import { VodScreen } from '../src/screens/VodScreen';
import { PageContent } from '../src/components/PageContent';
import {
  MediaControllerProvider,
  useMediaController,
} from '../src/media/MediaController';
import * as catalog from '../src/api/vodCatalog';
import { WatchProgressService } from '../src/services/watchProgress';
import { getRoute } from '../src/navigation/routes';
import * as vodApi from '../src/api/vod';

const mockPreview = {
  focusMediaItem: jest.fn(),
  clearPreview: jest.fn(),
  getCurrentItem: jest.fn(),
};
jest.mock('../src/media/MediaPreviewEngine', () => ({
  useMediaPreviewEngine: () => mockPreview,
}));
jest.mock('../src/components/RemoteImage', () => ({
  RemoteImage: 'RemoteImage',
}));
const mockFocusIndex = jest.fn();
jest.mock('../src/components/MediaCarousel', () => {
  const ReactModule = require('react');
  return {
    MediaCarousel: ReactModule.forwardRef((props: any, ref: any) => {
      ReactModule.useImperativeHandle(ref, () => ({
        focusIndex: mockFocusIndex,
        getSelectedIndex: () => 0,
        restoreFocus: jest.fn(),
      }));
      return ReactModule.createElement('CatalogCarousel', props);
    }),
  };
});

describe('VOD page', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  let controller!: ReturnType<typeof useMediaController>;
  let back: (() => boolean) | undefined;
  const page: catalog.VodCatalogPage = {
    series: [{ id: 's1', title: 'Series One' }],
    categories: ['Drama'],
    total: 41,
    hasMore: true,
    nextOffset: 40,
  };
  const details: catalog.VodSeriesDetails = {
    id: 's1',
    title: 'Series One',
    seasons: [
      { season_id: 'season1', title: 'Season One' },
      { season_id: 'season2', title: 'Season Two' },
    ],
    episodes: [
      { id: 'e1', title: 'Episode One', season_id: 'season1' },
      { id: 'e2', title: 'Episode Two', season_id: 'season2' },
    ],
  };
  function Probe() {
    controller = useMediaController();
    return null;
  }
  const carousel = () => renderer.root.findByType('CatalogCarousel' as any);
  const press = async (testID: string) => {
    await act(async () => {
      renderer.root
        .findAllByProps({ testID })
        .find(node => typeof node.props.onPress === 'function')!
        .props.onPress();
    });
  };
  async function mount(route = false) {
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <MediaControllerProvider>
          <Probe />
          {route ? (
            <PageContent
              route={getRoute('vod')}
              active
              menuFocusDestination={null}
              onContentFocus={jest.fn()}
            />
          ) : (
            <VodScreen
              active
              menuFocusDestination={null}
              onContentFocus={jest.fn()}
            />
          )}
        </MediaControllerProvider>,
      );
    });
  }
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(catalog, 'getVodCatalog').mockResolvedValue(page);
    jest.spyOn(catalog, 'getVodSeriesDetails').mockResolvedValue(details);
    jest
      .spyOn(WatchProgressService, 'getContinueWatching')
      .mockResolvedValue([]);
    jest.spyOn(WatchProgressService, 'getProgress').mockResolvedValue(null);
    jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((_event, handler) => {
        back = handler as () => boolean;
        return { remove: jest.fn() };
      });
  });
  afterEach(async () => {
    await act(async () => renderer?.unmount());
    jest.restoreAllMocks();
  });

  it('connects the VOD route to the real provider catalog instead of live channels', async () => {
    await mount(true);
    expect(catalog.getVodCatalog).toHaveBeenCalledWith('kan', {
      query: '',
      category: '',
      offset: 0,
    });
    expect(carousel().props.items[0]).toMatchObject({
      id: 'series-kan-s1',
      kind: 'vod',
      title: 'Series One',
    });
    expect(mockPreview.focusMediaItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'series-kan-s1' }),
    );
  });

  it.each(['resolve', 'reject'] as const)(
    'ignores a pending resume lookup after changing seasons (%s)',
    async outcome => {
      await mount();
      await act(async () =>
        carousel().props.onItemSelect(carousel().props.items[0]),
      );
      let resolve!: (value: null) => void;
      let reject!: (error: Error) => void;
      jest.mocked(WatchProgressService.getProgress).mockImplementationOnce(
        () =>
          new Promise((done, fail) => {
            resolve = done;
            reject = fail;
          }),
      );
      let pending!: Promise<void>;
      act(() => {
        pending = carousel().props.onItemSelect(carousel().props.items[0]);
      });
      await press('vod-season-season2');
      await act(async () => {
        if (outcome === 'resolve') {
          resolve(null);
        } else {
          reject(new Error('storage unavailable'));
        }
        await pending;
      });
      expect(controller.isFullscreen).toBe(false);
      expect(carousel().props.items[0].episodeName).toBe('Episode Two');
    },
  );

  it('ignores retained episode activation while the player is already fullscreen', async () => {
    await mount();
    await act(async () =>
      carousel().props.onItemSelect(carousel().props.items[0]),
    );
    const retained = carousel().props.onItemSelect;
    const item = carousel().props.items[0];
    await act(async () => retained(item));
    expect(controller.isFullscreen).toBe(true);
    jest.mocked(WatchProgressService.getProgress).mockClear();
    await act(async () => retained(item));
    expect(WatchProgressService.getProgress).not.toHaveBeenCalled();
  });

  it('does not open a pending episode after focus moves to the side menu', async () => {
    await mount();
    await act(async () =>
      carousel().props.onItemSelect(carousel().props.items[0]),
    );
    let resolve!: (value: null) => void;
    jest.mocked(WatchProgressService.getProgress).mockImplementationOnce(
      () =>
        new Promise(done => {
          resolve = done;
        }),
    );
    let pending!: Promise<void>;
    act(() => {
      pending = carousel().props.onItemSelect(carousel().props.items[0]);
    });
    await act(async () =>
      renderer.update(
        <MediaControllerProvider>
          <Probe />
          <VodScreen
            active={false}
            menuFocusDestination={null}
            onContentFocus={jest.fn()}
          />
        </MediaControllerProvider>,
      ),
    );
    await act(async () => {
      resolve(null);
      await pending;
    });
    expect(controller.isFullscreen).toBe(false);
  });

  it('browses details and seasons, resumes in the shared player, then handles Back', async () => {
    await mount();
    await act(async () => {
      carousel().props.onItemSelect(carousel().props.items[0]);
    });
    expect(catalog.getVodSeriesDetails).toHaveBeenCalledWith('kan', 's1');
    expect(carousel().props.items).toHaveLength(2);
    await press('vod-season-season2');
    expect(carousel().props.items).toHaveLength(1);
    expect(carousel().props.items[0].episodeName).toBe('Episode Two');
    jest.mocked(WatchProgressService.getProgress).mockResolvedValue({
      positionMs: 65000,
      durationMs: 300000,
      isCompleted: false,
    });
    await act(async () => {
      await carousel().props.onItemSelect(carousel().props.items[0]);
    });
    expect(controller.isFullscreen).toBe(true);
    expect(controller.item?.resumePositionMs).toBe(65000);
    await act(async () => {
      controller.exitFullscreen();
    });
    await act(async () => {
      expect(back?.()).toBe(true);
    });
    expect(carousel().props.items[0].id).toBe('series-kan-s1');
  });

  it('filters and paginates catalogs, and switches provider without stale results', async () => {
    await mount();
    await press('vod-category-1');
    expect(catalog.getVodCatalog).toHaveBeenLastCalledWith(
      'kan',
      expect.objectContaining({ category: 'Drama', offset: 0 }),
    );
    await press('vod-next');
    expect(catalog.getVodCatalog).toHaveBeenLastCalledWith(
      'kan',
      expect.objectContaining({ category: 'Drama', offset: 40 }),
    );
    await act(async () => {
      renderer.root.findByType(TextInput).props.onChangeText('Query');
    });
    await act(async () => {
      renderer.root.findByType(TextInput).props.onSubmitEditing();
    });
    expect(catalog.getVodCatalog).toHaveBeenLastCalledWith(
      'kan',
      expect.objectContaining({ query: 'Query', offset: 0 }),
    );
    await press('vod-provider-reshet');
    expect(catalog.getVodCatalog).toHaveBeenLastCalledWith(
      'reshet',
      expect.objectContaining({ category: '', offset: 0 }),
    );
    expect(carousel().props.items[0].id).toBe('series-reshet-s1');
  });

  it('shows an error with a working retry and an empty state', async () => {
    jest
      .mocked(catalog.getVodCatalog)
      .mockRejectedValueOnce(new Error('Offline'));
    await mount();
    expect(
      renderer.root.findAllByProps({ testID: 'vod-retry' }).length,
    ).toBeGreaterThan(0);
    jest
      .mocked(catalog.getVodCatalog)
      .mockResolvedValue({ ...page, series: [], total: 0, hasMore: false });
    await press('vod-retry');
    expect(renderer.root.findAllByType('CatalogCarousel' as any)).toHaveLength(
      0,
    );
    expect(renderer.root.findAllByProps({ testID: 'vod-retry' })).toHaveLength(
      0,
    );
  });

  it('ignores an old provider request that resolves after switching tabs', async () => {
    let finish!: (value: catalog.VodCatalogPage) => void;
    jest.mocked(catalog.getVodCatalog).mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
    await mount();
    await press('vod-provider-c14');
    expect(carousel().props.items[0].id).toBe('series-c14-s1');
    await act(async () => {
      finish({ ...page, series: [{ id: 'stale', title: 'Stale' }] });
    });
    expect(carousel().props.items[0].id).toBe('series-c14-s1');
  });

  it('shows Continue Watching with its saved resume position and original payload', async () => {
    jest.mocked(WatchProgressService.getContinueWatching).mockResolvedValue([
      {
        id: 'cw-e1',
        episodeId: 'kan-vod:e1',
        title: 'Saved Episode',
        seriesTitle: 'Series',
        positionMs: 120000,
        durationMs: 600000,
        progressPercentage: 20,
        lastWatchedAt: Date.now(),
        sourcePayload: { episodeId: 'kan-vod:e1', module: 'kan-vod' },
      },
    ]);
    await mount();
    await press('vod-provider-history');
    expect(carousel().props.items[0]).toMatchObject({
      title: 'Saved Episode',
      resumePositionMs: 120000,
      sourcePayload: { module: 'kan-vod' },
    });
    await act(async () => {
      await carousel().props.onItemSelect(carousel().props.items[0]);
    });
    const loadsBeforeExit = jest.mocked(
      WatchProgressService.getContinueWatching,
    ).mock.calls.length;
    await act(async () => {
      controller.exitFullscreen();
    });
    expect(
      jest.mocked(WatchProgressService.getContinueWatching).mock.calls.length,
    ).toBeGreaterThan(loadsBeforeExit);
  });

  it('lists newly added episodes and ignores a retained selection from a previous catalog', async () => {
    jest.spyOn(vodApi, 'getRecentVodItems').mockResolvedValue([
      {
        id: 'vod-recent',
        kind: 'vod',
        title: 'New episode',
        sourcePayload: { episodeId: 'recent' },
      },
    ]);
    await mount();
    const retainedSelect = carousel().props.onItemSelect;
    const oldItem = carousel().props.items[0];
    await press('vod-provider-recent');
    expect(carousel().props.items[0].id).toBe('vod-recent');
    await act(async () => {
      await retainedSelect(oldItem);
    });
    expect(controller.isFullscreen).toBe(false);
    await act(async () => {
      await carousel().props.onItemSelect(carousel().props.items[0]);
    });
    expect(controller.item?.id).toBe('vod-recent');
    expect(controller.isFullscreen).toBe(true);
  });
});
