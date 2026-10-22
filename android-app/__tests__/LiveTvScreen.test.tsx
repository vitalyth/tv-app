import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { StyleSheet, View } from 'react-native';
import { LiveTvScreen } from '../src/screens/LiveTvScreen';
import { PageContent } from '../src/components/PageContent';
import { getRoute } from '../src/navigation/routes';
import { getProgramGuide, type GuideData } from '../src/api/programGuide';
import type { PageContentHandle } from '../src/components/PageContent';

let mockRemote: (event: { eventType: string; eventKeyAction?: number }) => void;
jest.mock('react-native', () => {
  const native = jest.requireActual('react-native');
  return Object.defineProperty(native, 'useTVEventHandler', {
    value: (handler: typeof mockRemote) => {
      mockRemote = handler;
    },
  });
});
jest.mock('../src/api/programGuide', () => ({
  ...jest.requireActual('../src/api/programGuide'),
  getProgramGuide: jest.fn(),
}));
jest.mock('../src/components/RemoteImage', () => ({
  RemoteImage: 'RemoteImage',
}));
const mockPreview = { focusMediaItem: jest.fn(), clearPreview: jest.fn() };
const mockOpen = jest.fn();
const mockImage = jest.fn();
const mockController: any = { item: null, stream: null, isFullscreen: false };
jest.mock('../src/media/MediaController', () => ({
  useMediaController: () => mockController,
  useMediaActions: () => ({ openFullscreen: mockOpen, showImage: mockImage }),
}));
jest.mock('../src/media/MediaPreviewEngine', () => ({
  useMediaPreviewEngine: () => mockPreview,
}));

describe('live guide navigation', () => {
  let renderer: Renderer.ReactTestRenderer;
  const ref = React.createRef<PageContentHandle>();
  const onItemFocused = jest.fn();
  const now = 1800000000000;
  const guide: GuideData = {
    start: now - 3600000,
    end: now + 11 * 3600000,
    channels: Array.from({ length: 20 }, (_, i) => ({
      id: `ch${i}`,
      kind: 'live',
      title: `Channel ${i}`,
      channelName: `Channel ${i}`,
    })),
    programs: Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [
        `ch${i}`,
        [
          {
            id: 'past',
            title: 'Past',
            start: now - 3600000,
            end: now - 1800000,
          },
          {
            id: 'current',
            title: 'Current',
            start: now - 1800000,
            end: now + 1800000,
          },
          {
            id: 'next',
            title: 'Next',
            start: now + 1800000,
            end: now + 3600000,
          },
        ],
      ]),
    ),
  };
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
    jest.clearAllMocks();
    Object.assign(mockController, {
      item: null,
      stream: null,
      isFullscreen: false,
    });
    jest.mocked(getProgramGuide).mockResolvedValue(guide);
  });
  afterEach(async () => {
    if (renderer) {
      await act(async () => renderer.unmount());
    }
    jest.useRealTimers();
  });
  const key = async (eventType: string, eventKeyAction = 0) => {
    await act(async () => mockRemote({ eventType, eventKeyAction }));
  };
  async function mount(active = true) {
    await act(async () => {
      renderer = Renderer.create(
        <LiveTvScreen
          ref={ref}
          active={active}
          menuFocusDestination={null}
          onContentFocus={jest.fn()}
          onItemFocused={onItemFocused}
        />,
      );
    });
  }
  const focus = () =>
    renderer.root
      .findAllByProps({ testID: 'guide-focus' })
      .find(node => typeof node.props.onPress === 'function')!;

  test.each([92, 270, 318, 360, 540])(
    'fills the measured grid height (%s) without a bottom strip',
    async height => {
      await mount();
      const grid = renderer.root
        .findAllByProps({ testID: 'guide-grid' })
        .find(node => typeof node.props.onLayout === 'function')!;
      await act(async () =>
        grid.props.onLayout({ nativeEvent: { layout: { height } } }),
      );
      const rows = renderer.root.findAll(
        node =>
          node.type === View && /^guide-row-/.test(node.props.testID || ''),
      );
      const rowsHeight = rows.reduce(
        (total, node) => total + StyleSheet.flatten(node.props.style).height,
        0,
      );
      expect(rowsHeight + 30).toBeCloseTo(height);
      expect(StyleSheet.flatten(grid.props.style).marginBottom || 0).toBe(0);
      const lastRow = rows[rows.length - 1];
      const channel = lastRow.findAll(
        node => typeof node.props.onPress === 'function',
      )[0];
      expect(StyleSheet.flatten(channel.props.style).marginBottom).toBe(0);
      const line = renderer.root.findAllByProps({
        testID: 'guide-live-line',
      })[0];
      expect(StyleSheet.flatten(line.props.style).height).toBeCloseTo(
        height - 30,
      );
      await act(async () => ref.current?.restoreFocus('ch19'));
      const lastRows = renderer.root.findAll(
        node =>
          node.type === View && /^guide-row-/.test(node.props.testID || ''),
      );
      expect(
        lastRows.reduce(
          (total, node) => total + StyleSheet.flatten(node.props.style).height,
          30,
        ),
      ).toBeCloseTo(height);
    },
  );
  test('routes Live TV to the guide without replacing the shell', async () => {
    await act(async () => {
      renderer = Renderer.create(
        <PageContent
          route={getRoute('live-tv')}
          active
          menuFocusDestination={null}
          onContentFocus={jest.fn()}
        />,
      );
    });
    expect(renderer.root.findByType(LiveTvScreen)).toBeDefined();
  });
  test('starts at the current program, preserves time across rows, and previews future entries as artwork only', async () => {
    await mount();
    expect(mockPreview.focusMediaItem).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'ch0', title: 'Current' }),
    );
    await key('down');
    expect(onItemFocused).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'ch1', title: 'Current' }),
    );
    mockPreview.focusMediaItem.mockClear();
    await key('right');
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(mockPreview.focusMediaItem).not.toHaveBeenCalled();
    expect(mockImage).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'Next', isLive: false }),
    );
    await key('down');
    expect(onItemFocused).toHaveBeenLastCalledWith(
      expect.objectContaining({ channelName: 'Channel 2', title: 'Next' }),
    );
  });
  test('allows menu exit only from channel column and ignores key release/volume/fullscreen input', async () => {
    await mount();
    expect(ref.current?.canExitToMenu()).toBe(false);
    await key('left');
    await key('left');
    expect(ref.current?.canExitToMenu()).toBe(true);
    await key('right');
    expect(ref.current?.canExitToMenu()).toBe(false);
    const count = onItemFocused.mock.calls.length;
    await key('volumeUp');
    await key('down', 1);
    mockController.isFullscreen = true;
    await key('down');
    expect(onItemFocused).toHaveBeenCalledTimes(count);
  });
  test('retained activation uses latest selection and reuses the shared stream', async () => {
    await mount();
    const retained = focus().props.onPress;
    await key('down');
    await act(async () => retained());
    expect(mockOpen).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'ch1', title: 'Current' }),
    );
    expect(mockPreview.clearPreview).toHaveBeenLastCalledWith({
      stopMedia: false,
    });
    await act(async () => ref.current?.restoreFocus('ch5'));
    expect(onItemFocused).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'ch5', title: 'Current' }),
    );
  });
  test('keeps an existing paused stream when entering the guide', async () => {
    mockController.item = guide.channels[3];
    mockController.stream = { url: 'existing' };
    await mount();
    expect(onItemFocused).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'ch3' }),
    );
    expect(mockPreview.focusMediaItem).not.toHaveBeenCalled();
  });
  test('bounds rendered cells and handles schedules with no programs', async () => {
    jest.mocked(getProgramGuide).mockResolvedValue({ ...guide, programs: {} });
    await mount();
    expect(
      renderer.root.findAll(
        node =>
          typeof node.props.testID === 'string' &&
          node.props.testID.startsWith('guide-cell-'),
      ).length,
    ).toBeLessThan(100);
    expect(onItemFocused).toHaveBeenLastCalledWith(
      expect.objectContaining({ channelName: 'Channel 0' }),
    );
  });
  test('shows retry after failure and loads successfully', async () => {
    jest.mocked(getProgramGuide).mockRejectedValueOnce(new Error('offline'));
    await mount();
    await act(async () =>
      renderer.root
        .findAllByProps({ testID: 'guide-retry' })
        .find(node => typeof node.props.onPress === 'function')!
        .props.onPress(),
    );
    expect(focus()).toBeDefined();
  });
  test('follows live across program boundaries without switching to historical artwork', async () => {
    await mount();
    await act(async () => {
      jest.advanceTimersByTime(1800000);
    });
    expect(onItemFocused).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'ch0',
        title: 'Next',
        isLive: true,
      }),
    );
    expect(mockImage).not.toHaveBeenCalled();
  });

  test('keeps a browsed future program selected when the clock advances', async () => {
    await mount();
    await key('right');
    await act(async () => {
      jest.advanceTimersByTime(60000);
    });
    expect(onItemFocused).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: 'Next',
        isLive: false,
      }),
    );
  });
  test('shows the current time above the live line and hides it when scrolling away', async () => {
    await mount();
    const timeText = () =>
      renderer.root
        .findByProps({ testID: 'guide-live-time' })
        .findByType(require('react-native').Text).props.children;
    const clock = (value: number) => {
      const date = new Date(value);
      return `${String(date.getHours()).padStart(2, '0')}:${String(
        date.getMinutes(),
      ).padStart(2, '0')}`;
    };
    expect(timeText()).toBe(clock(now));
    await act(async () => {
      jest.advanceTimersByTime(60000);
    });
    expect(timeText()).toBe(clock(now + 60000));
    for (let i = 0; i < 8; i++) {
      await key('right');
    }
    expect(
      renderer.root.findAllByProps({ testID: 'guide-live-time' }),
    ).toHaveLength(0);
  });
});
