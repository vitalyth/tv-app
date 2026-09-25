import React, { createRef } from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { HomeScreen, type HomeScreenHandle } from '../src/screens/HomeScreen';
import { MediaControllerProvider } from '../src/media/MediaController';
import * as channelsApi from '../src/api/channels';
import * as vodApi from '../src/api/vod';
import {
  WatchProgressService,
  resetWatchProgressMemoryStore,
} from '../src/services/watchProgress';
import type { MediaItem } from '../src/media/player';
import type { RouteDefinition } from '../src/navigation/routes';

const mockRoute: RouteDefinition = {
  id: 'home',
  label: 'Home',
  shortLabel: 'H',
  eyebrow: 'Welcome back',
  title: 'Your television, in one place',
  description:
    'Continue watching, return to live television, or discover something new.',
};

jest.mock('../src/components/MediaCarousel', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return {
    MediaCarousel: ReactModule.forwardRef(function MockMediaCarousel(
      props: any,
      ref: any,
    ) {
      ReactModule.useImperativeHandle(ref, () => ({
        focusIndex: jest.fn(),
        getSelectedIndex: () => 0,
        restoreFocus: jest.fn(),
      }));
      return (
        <View testID={`carousel-${props.id}`}>
          {props.items.map((item: any, idx: number) => (
            <View key={props.keyExtractor ? props.keyExtractor(item, idx) : item.id ?? idx}>
              {props.renderItem(item, idx, idx === 0)}
            </View>
          ))}
        </View>
      );
    }),
  };
});

describe('HomeScreen', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | null = null;

  beforeEach(() => {
    resetWatchProgressMemoryStore();
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (renderer) {
      try {
        act(() => {
          renderer?.unmount();
        });
      } catch {
        // ignore unmount errors
      }
      renderer = null;
    }
    jest.restoreAllMocks();
  });

  const mockLiveChannels: MediaItem[] = [
    {
      id: 'ch-11',
      kind: 'live',
      title: 'חדשות הערב',
      channelName: 'כאן 11',
      channelNumber: '11',
      imageUrl: 'https://example.com/kan11.jpg',
      isLive: true,
    },
    {
      id: 'ch-12',
      kind: 'live',
      title: 'המהדורה המרכזית',
      channelName: 'קשת 12',
      channelNumber: '12',
      imageUrl: 'https://example.com/keshet12.jpg',
      isLive: true,
    },
  ];

  const mockVodItems: MediaItem[] = [
    {
      id: 'vod-101',
      kind: 'vod',
      title: 'טהרן עונה 2 פרק 1',
      channelName: 'כאן 11',
      imageUrl: 'https://example.com/tehran.jpg',
    },
    {
      id: 'vod-102',
      kind: 'vod',
      title: 'פאודה עונה 4 פרק 5',
      channelName: 'yes',
      imageUrl: 'https://example.com/fauda.jpg',
    },
  ];

  it('renders Live and VOD rows without continue watching when history is empty', async () => {
    jest
      .spyOn(channelsApi, 'getDistinctLiveChannels')
      .mockResolvedValue(mockLiveChannels);
    jest.spyOn(vodApi, 'getRecentVodItems').mockResolvedValue(mockVodItems);
    jest
      .spyOn(WatchProgressService, 'getContinueWatching')
      .mockResolvedValue([]);

    const homeRef = createRef<HomeScreenHandle>();
    const onItemFocused = jest.fn();

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <MediaControllerProvider>
          <HomeScreen
            ref={homeRef}
            route={mockRoute}
            active={true}
            menuFocusDestination={null}
            onContentFocus={jest.fn()}
            onItemFocused={onItemFocused}
          />
        </MediaControllerProvider>,
      );
      await new Promise(r => setTimeout(() => r(null), 600));
    });

    const root = renderer!.root;

    // Continue Watching carousel should NOT be present
    expect(root.findAllByProps({ id: 'home-continue' })).toHaveLength(0);

    // Live and VOD carousels should be present
    expect(root.findAllByProps({ id: 'home-live' })).toHaveLength(1);
    expect(root.findAllByProps({ id: 'home-vod' })).toHaveLength(1);

    // Verify initial focus notification was triggered
    expect(onItemFocused).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ch-11' }),
    );
  });

  it('renders all three rows when continue watching items exist', async () => {
    jest
      .spyOn(channelsApi, 'getDistinctLiveChannels')
      .mockResolvedValue(mockLiveChannels);
    jest.spyOn(vodApi, 'getRecentVodItems').mockResolvedValue(mockVodItems);
    jest.spyOn(WatchProgressService, 'getContinueWatching').mockResolvedValue([
      {
        id: 'cw-1',
        episodeId: 'ep-1',
        title: 'פרק שמור',
        seriesTitle: 'סדרה א',
        channelName: 'כאן 11',
        imageUrl: 'https://example.com/saved.jpg',
        positionMs: 60000,
        durationMs: 300000,
        progressPercentage: 20,
        lastWatchedAt: Date.now(),
      },
    ]);

    const homeRef = createRef<HomeScreenHandle>();
    const onItemFocused = jest.fn();

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <MediaControllerProvider>
          <HomeScreen
            ref={homeRef}
            route={mockRoute}
            active={true}
            menuFocusDestination={null}
            onContentFocus={jest.fn()}
            onItemFocused={onItemFocused}
          />
        </MediaControllerProvider>,
      );
      await new Promise(r => setTimeout(() => r(null), 600));
    });

    const root = renderer!.root;

    // All 3 carousels should now be present
    expect(root.findAllByProps({ id: 'home-continue' })).toHaveLength(1);
    expect(root.findAllByProps({ id: 'home-live' })).toHaveLength(1);
    expect(root.findAllByProps({ id: 'home-vod' })).toHaveLength(1);

    // Initial focus on Continue Watching item
    expect(onItemFocused).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cw-1' }),
    );

    // Imperative handle methods
    expect(homeRef.current?.canExitToMenu()).toBe(true);
  });
});
